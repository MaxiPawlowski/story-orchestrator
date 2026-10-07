import { growth, percentile, ratio, type B1Verdict, type LiveRead } from './b1Runs.mts';
import { scoreContains, scoreRejected, type ContainsSpec } from './liveSuiteScore.mts';

export const QUEST_ARMS = [0, 5, 10, 20] as const;
export const QUEST_CAP_FLOOR_ARM = 5;
export const M1_TIER_DROP_MAX = 0.03;
export const M1_TOKEN_GROWTH_MAX = 0.15;
export const M1_LATENCY_GROWTH_MAX = 0.2;
export const M1_TIERS = ['deltas', 'facts', 'rejected'] as const;
export const M2_CASES = 20;
export const M2_WITHIN_TURNS = 3;
export const M2_RECALL_MIN = 0.8;
export const M2_FALSE_LATCHES_MAX = 1;
export const M1_FLOOR_TEXT = 'no tier (`plotDeltaAccuracy`, facts, rejected) drops more than **3 points** vs arm 0; prompt tokens per read **≤ +15 %**, p50 read latency **≤ +20 %**; the highest passing arm sets `QUEST_SCOPE_CAP` (floor 5; if arm 5 fails, Q1 ships without side quests discovered by extraction)';
export const M2_FLOOR_TEXT = '`done_when` latched within **N = 3 player turns** of the act in **≥ 0.80** of cases, false latches **≤ 1 of 20**';
export const PLAYER_SPEAKER = 'You';

export interface CompletionCase {
  id: string;
  quest?: string;
  checkpoint?: string;
  before?: Record<string, unknown>;
  latches: boolean;
  expected: { q: string; v: unknown };
  turns: Array<{ player: string; replies: Array<{ speaker: string; text: string }> }>;
  facts?: ContainsSpec;
  rejected?: Array<{ reason?: string; scope?: string }>;
}

export interface CaseRead {
  turn: number;
  read: LiveRead;
}

export interface CaseOutcome {
  index: number;
  latches: boolean;
  wrote: boolean;
  latched: boolean;
  falseLatch: boolean;
  pass: boolean;
  reads: number;
  errors: number;
}

export function transcriptUpTo(entry: CompletionCase, turn: number) {
  const rows: Array<{ index: number; speaker: string; text: string; is_user?: boolean }> = [];
  for (const step of entry.turns.slice(0, turn)) {
    rows.push({ index: rows.length, speaker: PLAYER_SPEAKER, text: step.player, is_user: true });
    for (const reply of step.replies) rows.push({ index: rows.length, speaker: reply.speaker, text: reply.text });
  }
  return rows;
}

export function caseSpec(story: unknown, entry: CompletionCase, turn: number, values: Record<string, unknown>, scopeCaps: Record<string, number | null> = { quest: null }) {
  return {
    story,
    transcript: transcriptUpTo(entry, turn),
    ...(entry.checkpoint ? { activeCheckpointId: entry.checkpoint } : {}),
    blackboard: { values, versions: {}, latched: {} },
    scopeCaps,
  };
}

export const holds = (expected: unknown, value: unknown, before: unknown): boolean =>
  (typeof expected === 'number' && typeof value === 'number' && !(typeof before === 'number' && before >= expected) ? value >= expected : value === expected);

export function applyGuarded(values: Record<string, unknown>, read: LiveRead): Record<string, unknown> {
  return read.guarded.reduce((next, delta) => ({ ...next, [delta.q]: delta.v }), values);
}

export function caseOutcome(index: number, entry: CompletionCase, reads: CaseRead[]): CaseOutcome {
  const key = entry.expected.q;
  const before = entry.before?.[key];
  const writes = reads.flatMap((row) => row.read.guarded.filter((delta) => delta.q === key));
  const latched = writes.some((delta) => holds(entry.expected.v, delta.v, before));
  const wrote = writes.length > 0;
  const falseLatch = !entry.latches && writes.some((delta) => delta.v === entry.expected.v);
  return { index, latches: entry.latches, wrote, latched, falseLatch, pass: entry.latches ? latched : !falseLatch, reads: reads.length, errors: reads.filter((row) => row.read.error).length };
}

export function caseProblems(cases: CompletionCase[], expectedCount: number = M2_CASES): string[] {
  const problems: string[] = [];
  if (cases.length !== expectedCount) problems.push(`${cases.length} case(s), the floor is over ${expectedCount}`);
  cases.forEach((entry, index) => {
    if (!entry?.expected?.q) problems.push(`case ${index + 1}: no expected {q, v}`);
    if (typeof entry?.latches !== 'boolean') problems.push(`case ${index + 1}: latches must be true or false`);
    if (!Array.isArray(entry?.turns) || !entry.turns.length) problems.push(`case ${index + 1}: no turns`);
    else if (entry.turns.length > M2_WITHIN_TURNS + 1) problems.push(`case ${index + 1}: ${entry.turns.length} turns, more than the act plus ${M2_WITHIN_TURNS}`);
  });
  return problems;
}

export function scoreM2(outcomes: CaseOutcome[], problems: string[] = []) {
  const latching = outcomes.filter((row) => row.latches);
  const recalled = latching.filter((row) => row.latched).length;
  const falseLatches = outcomes.filter((row) => row.falseLatch).length;
  const errors = outcomes.reduce((sum, row) => sum + row.errors, 0);
  const incomplete = [...problems, ...(errors ? [`${errors} read(s) errored`] : []), ...(!latching.length ? ['no latching case, recall has no denominator'] : [])];
  const recall = ratio(recalled, latching.length);
  const floors = {
    recall: { value: recall, latching: latching.length, recalled, min: M2_RECALL_MIN, ok: recall !== null && recall >= M2_RECALL_MIN },
    falseLatches: { value: falseLatches, of: outcomes.length, max: M2_FALSE_LATCHES_MAX, ok: falseLatches <= M2_FALSE_LATCHES_MAX },
  };
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : floors.recall.ok && floors.falseLatches.ok ? 'PASS' : 'FAIL';
  return { floor: M2_FLOOR_TEXT, verdict, incomplete, floors, cases: outcomes.map((row) => ({ case: row.index, latches: row.latches, latched: row.latched, falseLatch: row.falseLatch, pass: row.pass })) };
}

export interface ArmRun {
  arm: number;
  cases: CompletionCase[];
  reads: CaseRead[][];
}

const tierOutcomes = (entry: CompletionCase, reads: CaseRead[]) => ({
  facts: scoreContains('facts', entry.facts, reads.flatMap((row) => row.read.facts)),
  rejected: scoreRejected(entry.rejected, reads.flatMap((row) => row.read.rejected)),
});

export function armSummary(run: ArmRun) {
  const outcomes = run.cases.map((entry, index) => caseOutcome(index + 1, entry, run.reads[index] ?? []));
  const tiers: Record<string, { scored: number; passed: number; accuracy: number | null }> = { deltas: { scored: outcomes.length, passed: outcomes.filter((row) => row.pass).length, accuracy: ratio(outcomes.filter((row) => row.pass).length, outcomes.length) } };
  for (const tier of ['facts', 'rejected'] as const) {
    const scored = run.cases.map((entry, index) => tierOutcomes(entry, run.reads[index] ?? [])[tier]).filter((row) => row.scored);
    tiers[tier] = { scored: scored.length, passed: scored.filter((row) => row.pass).length, accuracy: ratio(scored.filter((row) => row.pass).length, scored.length) };
  }
  const reads = run.reads.flat().map((row) => row.read);
  const questKeys = reads.map((read) => read.sources.find((source) => source.kind === 'quest')?.keys.length ?? 0);
  return {
    arm: run.arm,
    cases: outcomes.length,
    reads: reads.length,
    errors: reads.filter((read) => read.error).length,
    tiers,
    tokensMean: reads.length ? Number((reads.reduce((sum, read) => sum + read.tokens, 0) / reads.length).toFixed(1)) : null,
    latencyP50: percentile(reads.filter((read) => !read.error).map((read) => read.ms), 0.5),
    questKeysMax: questKeys.length ? Math.max(...questKeys) : 0,
    questDroppedMax: reads.length ? Math.max(...reads.map((read) => read.sources.find((source) => source.kind === 'quest')?.dropped.length ?? 0)) : 0,
  };
}

export function scoreM1(runs: ArmRun[], problems: string[] = []) {
  const arms = runs.map(armSummary).sort((left, right) => left.arm - right.arm);
  const base = arms.find((arm) => arm.arm === 0) ?? null;
  const missing = QUEST_ARMS.filter((arm) => !arms.some((row) => row.arm === arm));
  const unmeasured = M1_TIERS.filter((tier) => !base || !(base.tiers[tier]?.scored > 0));
  const incomplete = [
    ...problems,
    ...missing.map((arm) => `arm ${arm} did not run`),
    ...arms.filter((arm) => arm.errors).map((arm) => `arm ${arm.arm}: ${arm.errors} read(s) errored`),
    ...unmeasured.map((tier) => `tier ${tier} is stated by no case, and the floor names it: it cannot be measured on these cases`),
    ...arms.filter((arm) => base && arm.arm > 0 && arm.questKeysMax - base.questKeysMax < arm.arm).map((arm) => `arm ${arm.arm} carried ${arm.questKeysMax - (base?.questKeysMax ?? 0)} extra quest key(s) in scope, not ${arm.arm}`),
  ];
  const judged = arms.filter((arm) => arm.arm > 0).map((arm) => {
    const drops = Object.fromEntries(M1_TIERS.map((tier) => {
      const baseAccuracy = base?.tiers[tier]?.accuracy ?? null;
      const armAccuracy = arm.tiers[tier]?.accuracy ?? null;
      const drop = baseAccuracy === null || armAccuracy === null ? null : Number((baseAccuracy - armAccuracy).toFixed(4));
      return [tier, { drop, ok: drop !== null && drop <= M1_TIER_DROP_MAX }];
    }));
    const tokens = growth(arm.tokensMean, base?.tokensMean ?? null);
    const latency = growth(arm.latencyP50, base?.latencyP50 ?? null);
    const checks = { tiers: drops, tokens: { growth: tokens, max: M1_TOKEN_GROWTH_MAX, ok: tokens !== null && tokens <= M1_TOKEN_GROWTH_MAX }, latencyP50: { growth: latency, max: M1_LATENCY_GROWTH_MAX, ok: latency !== null && latency <= M1_LATENCY_GROWTH_MAX } };
    const passes = Object.values(drops).every((row) => row.ok) && checks.tokens.ok && checks.latencyP50.ok;
    return { arm: arm.arm, passes, ...checks };
  });
  const passing = judged.filter((row) => row.passes).map((row) => row.arm);
  const capFloorPasses = passing.includes(QUEST_CAP_FLOOR_ARM);
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : capFloorPasses ? 'PASS' : 'FAIL';
  return {
    floor: M1_FLOOR_TEXT,
    verdict,
    incomplete,
    arms,
    judged,
    questScopeCap: incomplete.length ? null : capFloorPasses ? Math.max(...passing) : null,
    decision: incomplete.length ? 'not decided: the run is incomplete' : capFloorPasses ? `QUEST_SCOPE_CAP = ${Math.max(...passing)} (the highest passing arm)` : 'arm 5 failed: Q1 ships without side quests discovered by extraction',
  };
}
