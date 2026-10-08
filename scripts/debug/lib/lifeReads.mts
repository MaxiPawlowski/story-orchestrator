import { growth, percentile, ratio, type B1Verdict, type LiveRead } from './b1Runs.mts';

export const LIFE_ARMS = ['a', 'b', 'c'] as const;
export type LifeArm = (typeof LIFE_ARMS)[number];
export const M1_MIN_WINDOWS = 20;
export const M1_DIRECTION_MIN = 0.8;
export const M1_STUCK_MAX = 0.1;
export const M1_CLAMP_MAX = 0;
export const M1_A_BELOW_B_MAX = 0.05;
export const AXES_ARMS = [2, 4, 8, 16] as const;
export const BLOCK_P95_MAX = 350;
export const BLOCK_MAX = 600;
export const M2_TOKEN_GROWTH_MAX = 0.12;
export const M2_LATENCY_GROWTH_MAX = 0.15;
export const LIFE_M1_FLOOR_TEXT = 'direction accuracy ≥ 0.80; stuck rate (no move where the label moves) ≤ 0.10; step-clamp violations 0 (code); arm (a) not more than 5 points below arm (b) on direction accuracy (else the anchoring guard is reconsidered, not the floor). The arm that passes decides the read path\'s default (judge first only if (c) passes).';
export const LIFE_M2_FLOOR_TEXT = 'the relationship + mood + agenda blocks together add ≤ 350 prompt tokens per drafted member at p95 and ≤ 600 at max over the 20 lab windows; extraction prompt growth ≤ +12 % tokens with p50 latency ≤ +15 %.';

export interface RelationshipWindow {
  id: string;
  checkpoint?: string;
  present: string[];
  holder: string;
  toward: string;
  axis: string;
  start: number;
  messages: Array<{ speaker: string; text: string }>;
  label: 'up' | 'down' | 'none';
  expected: { q: string; v: number } | null;
}

export const relationshipKeyOf = (window: RelationshipWindow): string => window.expected?.q ?? `rel_${window.holder}_${window.toward}_${window.axis}`;

export function windowSpec(story: unknown, window: RelationshipWindow, isPlayer: (speaker: string) => boolean, arm: LifeArm | null, caps: Record<string, number | null> = { relationship: null }, present: string[] | null = null) {
  return {
    story,
    transcript: window.messages.map((message, index) => ({ index, speaker: message.speaker, text: message.text, ...(isPlayer(message.speaker) ? { is_user: true } : {}) })),
    ...(window.checkpoint ? { activeCheckpointId: window.checkpoint } : {}),
    blackboard: { values: { [relationshipKeyOf(window)]: window.start }, versions: {}, latched: {} },
    scopeCaps: caps,
    scopeContext: { present: present ?? window.present, drafted: window.holder },
    ...(arm === 'b' ? { showValues: true } : {}),
  };
}

export const stepOf = (window: RelationshipWindow): number => (window.label === 'none' || !window.expected ? 1 : Math.max(1, Math.abs(window.expected.v - window.start)));

export const directionOf = (value: unknown, start: number): 'up' | 'down' | 'none' => (typeof value !== 'number' || value === start ? 'none' : value > start ? 'up' : 'down');

export function windowOutcome(index: number, window: RelationshipWindow, read: LiveRead) {
  const key = relationshipKeyOf(window);
  const guarded = [...read.guarded].reverse().find((delta) => delta.q === key);
  const raw = [...read.deltas].reverse().find((delta) => delta.q === key);
  const observed = directionOf(guarded?.v, window.start);
  const moved = typeof guarded?.v === 'number' ? Math.abs(guarded.v - window.start) : 0;
  return {
    window: index,
    label: window.label,
    observed,
    right: observed === window.label,
    stuck: window.label !== 'none' && observed === 'none',
    clampViolation: moved > stepOf(window),
    rawOverStep: typeof raw?.v === 'number' && Math.abs(raw.v - window.start) > stepOf(window),
    inScope: read.scope.includes(key),
    judgeAnswered: read.judged ? read.judged.answered.includes(key) : null,
    error: Boolean(read.error),
  };
}

export function armOutcome(arm: LifeArm, windows: RelationshipWindow[], reads: LiveRead[]) {
  const rows = windows.map((window, index) => windowOutcome(index + 1, window, reads[index]));
  const moving = rows.filter((row) => row.label !== 'none');
  const direction = ratio(rows.filter((row) => row.right).length, rows.length);
  const stuck = ratio(rows.filter((row) => row.stuck).length, moving.length);
  const clamp = rows.filter((row) => row.clampViolation).length;
  const incomplete = [
    ...(windows.length < M1_MIN_WINDOWS ? [`${windows.length} window(s), about ${M1_MIN_WINDOWS} are owed`] : []),
    ...(rows.some((row) => row.error) ? [`${rows.filter((row) => row.error).length} read(s) errored`] : []),
    ...(rows.some((row) => !row.inScope && !row.error) ? [`${rows.filter((row) => !row.inScope && !row.error).length} window(s) never put the labelled axis in scope`] : []),
  ];
  const floors = {
    direction: { value: direction, min: M1_DIRECTION_MIN, ok: direction !== null && direction >= M1_DIRECTION_MIN },
    stuck: { value: stuck, max: M1_STUCK_MAX, moving: moving.length, ok: stuck !== null && stuck <= M1_STUCK_MAX },
    clampViolations: { value: clamp, max: M1_CLAMP_MAX, ok: clamp <= M1_CLAMP_MAX, rawOverStep: rows.filter((row) => row.rawOverStep).length },
  };
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : Object.values(floors).every((floor) => floor.ok) ? 'PASS' : 'FAIL';
  return { arm, verdict, incomplete, floors, judgeAnswered: arm === 'c' ? rows.filter((row) => row.judgeAnswered).length : null, windows: rows };
}

export function scoreLifeM1(windows: RelationshipWindow[], reads: Record<LifeArm, LiveRead[]>) {
  const arms = Object.fromEntries(LIFE_ARMS.map((arm) => [arm, reads[arm] ? armOutcome(arm, windows, reads[arm]) : null])) as Record<LifeArm, ReturnType<typeof armOutcome> | null>;
  const missing = LIFE_ARMS.filter((arm) => !arms[arm]);
  const a = arms.a?.floors.direction.value ?? null;
  const b = arms.b?.floors.direction.value ?? null;
  const gap = a === null || b === null ? null : Number((b - a).toFixed(4));
  const anchoring = { aBelowB: gap, max: M1_A_BELOW_B_MAX, ok: gap !== null && gap <= M1_A_BELOW_B_MAX };
  const incomplete = [...missing.map((arm) => `arm (${arm}) did not run`), ...LIFE_ARMS.filter((arm) => arms[arm]?.verdict === 'INCOMPLETE').map((arm) => `arm (${arm}): ${arms[arm]?.incomplete.join('; ')}`)];
  const defaultPath = arms.c?.verdict === 'PASS' ? 'judge first (arm c passed)' : arms.a?.verdict === 'PASS' ? 'extractor, value hidden (arm a passed; arm c did not)' : 'none: neither arm (a) nor arm (c) passed';
  const decided = arms.c?.verdict === 'PASS' ? arms.c : arms.a;
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : decided?.verdict === 'PASS' && anchoring.ok ? 'PASS' : 'FAIL';
  return {
    floor: LIFE_M1_FLOOR_TEXT,
    verdict,
    incomplete,
    rule: 'the row passes when the arm that decides the default (c if it passes, else a) meets every floor and arm (a) is within 5 points of arm (b)',
    defaultPath: incomplete.length ? 'not decided: the run is incomplete' : defaultPath,
    anchoring,
    arms: Object.fromEntries(LIFE_ARMS.map((arm) => [arm, arms[arm] ? { verdict: arms[arm]!.verdict, floors: arms[arm]!.floors, judgeAnswered: arms[arm]!.judgeAnswered, windows: arms[arm]!.windows } : null])),
  };
}

export interface CostArm {
  axes: number;
  reads: LiveRead[];
}

const relationshipKeys = (read: LiveRead) => read.sources.find((source) => source.kind === 'relationship')?.keys.length ?? 0;

export function costArm(arm: CostArm) {
  const ok = arm.reads.filter((read) => !read.error);
  return {
    axes: arm.axes,
    reads: arm.reads.length,
    errors: arm.reads.length - ok.length,
    tokensMean: ok.length ? Number((ok.reduce((sum, read) => sum + read.tokens, 0) / ok.length).toFixed(1)) : null,
    latencyP50: percentile(ok.map((read) => read.ms), 0.5),
    axesMax: ok.length ? Math.max(...ok.map(relationshipKeys)) : 0,
  };
}

export function scoreLifeM2(windows: number, base: CostArm, arms: CostArm[], blocks: number[]) {
  const baseline = costArm(base);
  const rows = arms.map(costArm).sort((left, right) => left.axes - right.axes);
  const missing = AXES_ARMS.filter((axes) => !rows.some((row) => row.axes === axes));
  const judged = rows.map((row) => {
    const tokens = growth(row.tokensMean, baseline.tokensMean);
    const latency = growth(row.latencyP50, baseline.latencyP50);
    return { axes: row.axes, axesMax: row.axesMax, reached: row.axesMax >= row.axes, tokens: { growth: tokens, max: M2_TOKEN_GROWTH_MAX, ok: tokens !== null && tokens <= M2_TOKEN_GROWTH_MAX }, latencyP50: { growth: latency, max: M2_LATENCY_GROWTH_MAX, ok: latency !== null && latency <= M2_LATENCY_GROWTH_MAX } };
  });
  const p95 = percentile(blocks, 0.95);
  const max = blocks.length ? Math.max(...blocks) : null;
  const block = { p95, max, p95Max: BLOCK_P95_MAX, maxMax: BLOCK_MAX, windows: blocks.length, ok: p95 !== null && max !== null && p95 <= BLOCK_P95_MAX && max <= BLOCK_MAX };
  const incomplete = [
    ...(windows < M1_MIN_WINDOWS ? [`${windows} window(s), the ceiling is over the 20 lab windows`] : []),
    ...missing.map((axes) => `the ${axes}-axis arm did not run`),
    ...[baseline, ...rows].filter((row) => row.errors).map((row) => `${row.axes}-axis arm: ${row.errors} read(s) errored`),
    ...judged.filter((row) => !row.reached).map((row) => `the ${row.axes}-axis arm put at most ${row.axesMax} axes in scope`),
    ...(blocks.length < windows ? [`${windows - blocks.length} block reading(s) missing`] : []),
  ];
  const passing = judged.filter((row) => row.tokens.ok && row.latencyP50.ok).map((row) => row.axes);
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : block.ok && passing.length ? 'PASS' : 'FAIL';
  return {
    floor: LIFE_M2_FLOOR_TEXT,
    verdict,
    incomplete,
    baseline,
    arms: rows,
    judged,
    block,
    relAxesPerRead: incomplete.length || !passing.length ? null : Math.max(...passing),
    decision: incomplete.length ? 'not decided: the run is incomplete' : passing.length ? `REL_AXES_PER_READ = ${Math.max(...passing)} (the largest N under the ceiling)` : 'no N meets the extraction ceiling',
  };
}
