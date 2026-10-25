export type StopDirection = 'atLeast' | 'atMost';
export type StopFloor = { id: string; rate: number; direction: StopDirection; planned?: number };
export type StopDeclaration = { N: number; floors: StopFloor[]; zeroFloors?: string[]; needsAll?: boolean };
export type Trial = boolean | number | { hits: number; of: number };
export type StopItem = { plumbing?: false; metrics: Record<string, Trial> } | { plumbing: true; retried: boolean; error?: string };
export type StopRuleId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
export type StopVerdict = 'pass' | 'fail' | 'not-a-measurement';
export type MetricCount = { hits: number; of: number; rate: number | null };
export type StopCounts = { items: number; planned: number; measured: number; plumbing: number; metrics: Record<string, MetricCount> };
export type StopDecision = { stop: null | { rule: StopRuleId; verdict: StopVerdict; at: string; reason: string; counts: StopCounts } };
export type StopRecord = { stopped: StopRuleId; verdict: StopVerdict; at: string; reason: string; counts: StopCounts };

const EPS = 1e-9;
const Z = 1.959963984540054;

export const pilotSize = (N: number): number => Math.min(10, Math.ceil(Math.max(0, N) / 4));

export function wilson(hits: number, of: number): { lower: number; upper: number } {
  if (of <= 0) return { lower: 0, upper: 1 };
  const p = hits / of;
  const z2 = Z * Z;
  const centre = p + z2 / (2 * of);
  const spread = Z * Math.sqrt((p * (1 - p)) / of + z2 / (4 * of * of));
  const scale = 1 + z2 / of;
  return { lower: Math.max(0, (centre - spread) / scale), upper: Math.min(1, (centre + spread) / scale) };
}

const asCount = (trial: Trial): { hits: number; of: number; counted: boolean } => {
  if (typeof trial === 'boolean') return { hits: trial ? 1 : 0, of: 1, counted: false };
  if (typeof trial === 'number') return { hits: trial, of: 0, counted: true };
  return { hits: trial.hits, of: trial.of, counted: true };
};

export function tallyItems(declaration: StopDeclaration, items: readonly StopItem[]): StopCounts & { counted: Set<string> } {
  const ids = [...new Set([...declaration.floors.map((floor) => floor.id), ...(declaration.zeroFloors ?? [])])];
  const metrics: Record<string, MetricCount> = Object.fromEntries(ids.map((id) => [id, { hits: 0, of: 0, rate: null }]));
  const counted = new Set<string>();
  let measured = 0;
  let plumbing = 0;
  for (const item of items) {
    if (!('metrics' in item)) {
      plumbing += 1;
      continue;
    }
    measured += 1;
    for (const id of ids) {
      const trial = item.metrics[id];
      if (trial === undefined) continue;
      const count = asCount(trial);
      if (count.counted) counted.add(id);
      metrics[id].hits += count.hits;
      metrics[id].of += count.of;
    }
  }
  for (const id of ids) metrics[id].rate = metrics[id].of ? metrics[id].hits / metrics[id].of : null;
  return { items: items.length, planned: declaration.N, measured, plumbing, metrics, counted };
}

const remainingFor = (floor: StopFloor, count: MetricCount, counted: Set<string>, N: number): number | null => {
  if (floor.planned !== undefined) return Math.max(0, floor.planned - count.of);
  if (counted.has(floor.id)) return null;
  return Math.max(0, N - count.of);
};

const best = (floor: StopFloor, count: MetricCount, remaining: number): number | null => {
  const of = count.of + remaining;
  if (!of) return null;
  return floor.direction === 'atLeast' ? (count.hits + remaining) / of : count.hits / of;
};

const worst = (floor: StopFloor, count: MetricCount, remaining: number): number | null => {
  const of = count.of + remaining;
  if (!of) return null;
  return floor.direction === 'atLeast' ? count.hits / of : (count.hits + remaining) / of;
};

const misses = (floor: StopFloor, value: number): boolean => (floor.direction === 'atLeast' ? value < floor.rate - EPS : value > floor.rate + EPS);

const meets = (floor: StopFloor, value: number): boolean => !misses(floor, value);

const shown = (count: MetricCount): string => `${count.hits}/${count.of}`;

export function evaluateStop(declaration: StopDeclaration, items: readonly StopItem[]): StopDecision {
  const { counted, ...counts } = tallyItems(declaration, items);
  const at = `${items.length}/${declaration.N}`;
  const stop = (rule: StopRuleId, verdict: StopVerdict, reason: string): StopDecision => ({ stop: { rule, verdict, at, reason, counts } });
  const broken = items.find((item): item is Extract<StopItem, { plumbing: true }> => item.plumbing === true && item.retried);
  if (broken) return stop('S5', 'not-a-measurement', `plumbing after one retry${broken.error ? `: ${broken.error}` : ''}`);
  const leak = (declaration.zeroFloors ?? []).find((id) => counts.metrics[id].hits > 0);
  if (leak) return stop('S3', 'fail', `zero floor ${leak} violated (${counts.metrics[leak].hits})`);
  if (items.length >= declaration.N || counts.measured < pilotSize(declaration.N)) return { stop: null };
  for (const floor of declaration.floors) {
    const count = counts.metrics[floor.id];
    const remaining = remainingFor(floor, count, counted, declaration.N);
    if (remaining === null) continue;
    const reachable = best(floor, count, remaining);
    if (reachable !== null && misses(floor, reachable)) return stop('S1', 'fail', `${floor.id} ${shown(count)}: best reachable ${reachable.toFixed(4)} misses ${floor.direction} ${floor.rate}`);
  }
  for (const floor of declaration.floors) {
    const count = counts.metrics[floor.id];
    if (!count.of) continue;
    const bound = wilson(count.hits, count.of);
    const futile = floor.direction === 'atLeast' ? bound.upper < floor.rate - EPS : bound.lower > floor.rate + EPS;
    if (futile) return stop('S2', 'fail', `${floor.id} ${shown(count)}: Wilson 95% ${floor.direction === 'atLeast' ? `upper ${bound.upper.toFixed(4)}` : `lower ${bound.lower.toFixed(4)}`} misses ${floor.direction} ${floor.rate}`);
  }
  if (declaration.needsAll || (declaration.zeroFloors ?? []).length) return { stop: null };
  const decided = declaration.floors.every((floor) => {
    const count = counts.metrics[floor.id];
    const remaining = remainingFor(floor, count, counted, declaration.N);
    if (remaining === null) return false;
    const floorValue = worst(floor, count, remaining);
    return floorValue !== null && meets(floor, floorValue);
  });
  if (decided && declaration.floors.length) return stop('S4', 'pass', `every floor met over ${declaration.N} whatever the rest answer`);
  return { stop: null };
}

export function stopRecord(decision: StopDecision): StopRecord | null {
  if (!decision.stop) return null;
  const { rule, verdict, at, reason, counts } = decision.stop;
  return { stopped: rule, verdict, at, reason, counts };
}

export function interleave<U, A>(units: readonly U[], arms: readonly A[]): Array<{ unit: U; arm: A; index: number; last: boolean }> {
  return units.flatMap((unit, index) => arms.map((arm, slot) => ({ unit, arm, index, last: slot === arms.length - 1 })));
}

export async function withOneRetry<T>(run: () => Promise<T>): Promise<{ ok: true; value: T; retried: boolean } | { ok: false; error: string; retried: true }> {
  try {
    return { ok: true, value: await run(), retried: false };
  } catch {
    try {
      return { ok: true, value: await run(), retried: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), retried: true };
    }
  }
}

const PLUMBING_PATTERNS = [
  /Target (page, context or browser has been )?closed/i, /Session closed/i, /Execution context was destroyed/i, /Protocol error/i,
  /net::ERR_/, /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE/, /socket hang up/i, /fetch failed/i,
  /CSRF token is stale/i, /live harness refused/, /not registered \(extension not loaded\?\)/, /is not a function/,
  /\b(502|503|504) (Bad Gateway|Service Unavailable|Gateway Timeout)\b/i, /\b429\b|Too Many Requests/i, /backend (is )?(down|unreachable|offline)/i,
];

export const isPlumbingError = (message: string | null | undefined): boolean => Boolean(message) && PLUMBING_PATTERNS.some((pattern) => pattern.test(message as string));

export const NO_STOP_FLAG = '--no-stop';
