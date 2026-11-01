export interface ReadMemoryArm { neighbours: boolean; keys: boolean; relations: boolean; acts: boolean }

export interface LiveWave {
  neighbours?: Array<{ alias: string; id: string }>;
  tagged?: Array<{ text: string; kind: 'same' | 'update'; id: string | null }>;
  keyed?: Array<{ text: string; keys: string[] }>;
  keyable?: number;
  relations?: Array<{ subject: string; relation: string; object: string; ended: boolean }>;
  acts?: Array<{ q: string; act: string }>;
  actsDropped?: number;
}

export interface WaveLive { readMemory?: ReadMemoryArm | null; wave?: LiveWave }

export interface NeighboursSpec { same?: string[]; update?: string[]; distinct?: Array<{ id: string; needle: string }> }
export interface RelationClaim { subject: string; object: string; relation: string[]; ended?: boolean }
export interface RelationsSpec { expect?: RelationClaim[]; also?: Array<{ subject: string; object: string }> }
export interface ActsSpec { expect?: Array<{ q: string; act: string }> }

export type WaveTier = 'neighbours' | 'relations' | 'acts';
export interface WaveCounts { expected: number; matched: number; spurious: number }
export interface WaveOutcome { tier: WaveTier; scored: boolean; pass: boolean; detail: string; counts?: WaveCounts }

const fold = (value: string) => value.trim().toLowerCase();
const off = (tier: WaveTier, why: string): WaveOutcome => ({ tier, scored: false, pass: false, detail: why });
const outcome = (tier: WaveTier, problems: string[], counts: WaveCounts): WaveOutcome => ({
  tier, scored: true, pass: problems.length === 0, counts,
  detail: problems.length ? problems.join('; ') : `${counts.matched} of ${counts.expected} matched, nothing spurious`,
});

export function scoreNeighbours(spec: NeighboursSpec | undefined, live: WaveLive): WaveOutcome {
  if (!spec) return off('neighbours', 'the fixture states no expectation for this tier');
  if (!live.readMemory?.neighbours) return off('neighbours', 'memory.neighbourRead was off for this run');
  const tagged = live.wave?.tagged ?? [];
  const wanted = [...(spec.same ?? []).map((id) => ({ id, kind: 'same' as const })), ...(spec.update ?? []).map((id) => ({ id, kind: 'update' as const }))];
  const problems: string[] = [];
  let matched = 0;
  for (const want of wanted) {
    if (tagged.some((line) => line.id === want.id && line.kind === want.kind)) matched += 1;
    else problems.push(`no ${want.kind}= line for ${want.id}`);
  }
  const spurious = tagged.filter((line) => {
    if (line.id === null) { problems.push(`unknown alias on "${line.text}"`); return true; }
    if (wanted.some((want) => want.id === line.id && want.kind === line.kind)) return false;
    const crossed = (spec.distinct ?? []).find((pair) => pair.id === line.id && fold(line.text).includes(fold(pair.needle)));
    if (crossed) { problems.push(`"${line.text}" tagged ${line.kind}=${line.id} but is about ${crossed.needle}`); return true; }
    if (wanted.some((want) => want.id === line.id)) { problems.push(`${line.kind}= on ${line.id}, expected the other tag`); return true; }
    return false;
  }).length;
  return outcome('neighbours', problems, { expected: wanted.length, matched, spurious });
}

const samePair = (left: { subject: string; object: string }, right: { subject: string; object: string }) =>
  fold(left.subject) === fold(right.subject) && fold(left.object) === fold(right.object);

export function scoreRelations(spec: RelationsSpec | undefined, live: WaveLive): WaveOutcome {
  if (!spec) return off('relations', 'the fixture states no expectation for this tier');
  if (!live.readMemory?.relations) return off('relations', 'memory.relationRows was off for this run');
  const rows = live.wave?.relations ?? [];
  const claims = spec.expect ?? [];
  const taken = new Set<number>();
  const problems: string[] = [];
  let matched = 0;
  for (const claim of claims) {
    const at = rows.findIndex((row, index) => !taken.has(index) && samePair(row, claim) && row.ended === (claim.ended === true)
      && claim.relation.some((needle) => fold(row.relation).includes(fold(needle))));
    if (at >= 0) { taken.add(at); matched += 1; } else problems.push(`missing ${claim.ended ? 'ended ' : ''}${claim.subject} ${claim.relation.join('|')} ${claim.object}`);
  }
  const spurious = rows.filter((row, index) => !taken.has(index) && !(spec.also ?? []).some((pair) => samePair(row, pair))
    && !claims.some((claim) => samePair(row, claim)));
  for (const row of spurious) problems.push(`false relation ${row.subject} ${row.relation} ${row.object}`);
  return outcome('relations', problems, { expected: claims.length, matched, spurious: spurious.length });
}

export function scoreActs(spec: ActsSpec | undefined, live: WaveLive): WaveOutcome {
  if (!spec) return off('acts', 'the fixture states no expectation for this tier');
  if (!live.readMemory?.acts) return off('acts', 'memory.socialActs was off for this run');
  const acts = live.wave?.acts ?? [];
  const claims = spec.expect ?? [];
  const same = (left: { q: string; act: string }, right: { q: string; act: string }) => left.q === right.q && fold(left.act) === fold(right.act);
  const missing = claims.filter((claim) => !acts.some((entry) => same(entry, claim)));
  const spurious = acts.filter((entry) => !claims.some((claim) => same(entry, claim)));
  const problems = [...missing.map((claim) => `missing act=${claim.act} on ${claim.q}`), ...spurious.map((entry) => `unexpected act=${entry.act} on ${entry.q}`)];
  return outcome('acts', problems, { expected: claims.length, matched: claims.length - missing.length, spurious: spurious.length });
}

export function scoreWave(expected: Record<string, any>, live: WaveLive): WaveOutcome[] {
  return [scoreNeighbours(expected.neighbours, live), scoreRelations(expected.relations, live), scoreActs(expected.acts, live)].filter((row) => row.scored);
}

const ratio = (num: number, den: number) => (den ? Number((num / den).toFixed(4)) : null);

export interface WaveRates { scored: number; passed: number; expected: number; matched: number; spurious: number; precision: number | null; recall: number | null }

export interface WaveTotals {
  arm: ReadMemoryArm | null;
  tiers: Partial<Record<WaveTier, WaveRates>>;
  keys: { lines: number; keyed: number; share: number | null; overThree: number };
  tagged: { lines: number; validAlias: number; share: number | null };
  actsDropped: number;
}

export function waveTotals(lives: WaveLive[], outcomes: WaveOutcome[]): WaveTotals {
  const tiers: Partial<Record<WaveTier, WaveRates>> = {};
  for (const tier of ['neighbours', 'relations', 'acts'] as const) {
    const rows = outcomes.filter((row) => row.tier === tier && row.scored);
    if (!rows.length) continue;
    const sum = (key: keyof WaveCounts) => rows.reduce((total, row) => total + (row.counts?.[key] ?? 0), 0);
    const [expected, matched, spurious] = [sum('expected'), sum('matched'), sum('spurious')];
    tiers[tier] = { scored: rows.length, passed: rows.filter((row) => row.pass).length, expected, matched, spurious, precision: ratio(matched, matched + spurious), recall: ratio(matched, expected) };
  }
  const waves = lives.map((live) => live.wave ?? {});
  const lines = waves.reduce((total, wave) => total + (wave.keyable ?? 0), 0);
  const keyed = waves.flatMap((wave) => wave.keyed ?? []);
  const tagged = waves.flatMap((wave) => wave.tagged ?? []);
  const validAlias = tagged.filter((line) => line.id !== null).length;
  return {
    arm: lives.find((live) => live.readMemory !== undefined)?.readMemory ?? null,
    tiers,
    keys: { lines, keyed: keyed.length, share: ratio(keyed.length, lines), overThree: keyed.filter((row) => row.keys.length > 3).length },
    tagged: { lines: tagged.length, validAlias, share: ratio(validAlias, tagged.length) },
    actsDropped: waves.reduce((total, wave) => total + (wave.actsDropped ?? 0), 0),
  };
}
