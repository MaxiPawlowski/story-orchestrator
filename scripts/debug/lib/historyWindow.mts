export const WINDOW_HIGH = 0.9;
export const WINDOW_LOW = 0.65;

export interface CutInput {
  tokens: readonly number[];
  budget: number;
  coveredTo: number;
  user?: readonly boolean[];
  high?: number;
  low?: number;
}

export interface CutResult {
  cut: number;
  k: number;
  step: number;
  total: number;
  kept: number;
  limit: number;
  over: boolean;
  clamped: boolean;
  snapped: boolean;
}

export function prefixMass(tokens: readonly number[]): number[] {
  const mass = [0];
  for (const count of tokens) mass.push(mass[mass.length - 1] + Math.max(0, count));
  return mass;
}

export function cutFor({ tokens, budget, coveredTo, user, high = WINDOW_HIGH, low = WINDOW_LOW }: CutInput): CutResult {
  const mass = prefixMass(tokens);
  const total = mass[mass.length - 1];
  const limit = high * budget;
  const step = Math.max(1, (high - low) * budget);
  const none = { cut: 0, k: 0, step, total, kept: total, limit, clamped: false, snapped: false };
  if (budget <= 0 || total <= limit) return { ...none, over: false };
  let k = 0;
  let cut = 0;
  while (cut < tokens.length && total - mass[cut] > limit) {
    k += 1;
    const target = k * step;
    while (cut < tokens.length && mass[cut] < target) cut += 1;
  }
  let snapped = false;
  if (user && cut > 0 && cut < tokens.length && !user[cut]) {
    let next = cut;
    while (next < tokens.length && !user[next]) next += 1;
    if (next < tokens.length) {
      snapped = next !== cut;
      cut = next;
    }
  }
  const ceiling = Math.max(0, Math.min(tokens.length, coveredTo + 1));
  const clamped = cut > ceiling;
  if (clamped) cut = ceiling;
  return { cut, k, step, total, kept: total - mass[cut], limit, over: true, clamped, snapped };
}

export function stepTurns(masses: readonly number[], budget: number, high = WINDOW_HIGH, low = WINDOW_LOW): number[] {
  const step = Math.max(1, (high - low) * budget);
  const limit = high * budget;
  const kOf = (total: number) => (total <= limit ? 0 : Math.ceil((total - limit) / step));
  const out: number[] = [];
  masses.forEach((total, index) => {
    if (index > 0 && kOf(total) > kOf(masses[index - 1])) out.push(index);
  });
  return out;
}

export function coveredToOf(memory: { shortTermSummaryEnd?: unknown; chapters?: unknown } | null | undefined): { coveredTo: number; summaryEnd: number; chapterEnd: number } {
  const summaryEnd = typeof memory?.shortTermSummaryEnd === 'number' && Number.isFinite(memory.shortTermSummaryEnd) ? memory.shortTermSummaryEnd : -1;
  const records = Array.isArray(memory?.chapters) ? memory.chapters as Array<{ status?: unknown; range?: { to?: unknown } }> : [];
  const chapterEnd = records.filter((record) => record?.status !== 'degraded' && typeof record?.range?.to === 'number').reduce((max, record) => Math.max(max, record.range!.to as number), -1);
  return { coveredTo: Math.max(summaryEnd, chapterEnd), summaryEnd, chapterEnd };
}
