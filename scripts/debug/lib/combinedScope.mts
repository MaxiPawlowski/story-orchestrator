import { growth, percentile, type B1Verdict, type LiveRead } from './b1Runs.mts';
import { M1_LATENCY_GROWTH_MAX, M1_TOKEN_GROWTH_MAX } from './questScope.mts';
import { BLOCK_MAX, BLOCK_P95_MAX, M2_LATENCY_GROWTH_MAX, M2_TOKEN_GROWTH_MAX } from './lifeReads.mts';

export const FAIR_MAX_WAIT = 3;
export const MIN_ACTIVE_QUEST_KEYS = 3;
export const MIN_MEMBERS = 7;
export const COMBINED_ROWS = ['S-17', '37-S17'] as const;
export type CombinedRow = (typeof COMBINED_ROWS)[number];
export const BASELINE_CAPS = { quest: 0, relationship: 0 } as const;
export const COMBINED_FLOOR_TEXT: Record<CombinedRow, string> = {
  'S-17': '36\'s M1 token/latency floors and 37\'s M2 ceiling hold together; overflow priority as B2 decides; fairness: no active quest left out of scope for more than 3 consecutive reads; caps passing separately is not enough',
  '37-S17': '36\'s M1 token/latency floors and this plan\'s M2 ceiling must hold at once … no active quest or present pair waits more than 3 consecutive reads. Each cap passing alone does not accept the combined feature.',
};

export function waits(reads: LiveRead[], kind: string) {
  const streak = new Map<string, number>();
  const worst = new Map<string, number>();
  for (const read of reads) {
    const source = read.sources.find((entry) => entry.kind === kind);
    if (!source) continue;
    const kept = new Set(source.keys);
    for (const key of [...source.keys, ...source.dropped]) {
      const next = kept.has(key) ? 0 : (streak.get(key) ?? 0) + 1;
      streak.set(key, next);
      worst.set(key, Math.max(worst.get(key) ?? 0, next));
    }
    for (const key of [...streak.keys()]) if (!source.keys.includes(key) && !source.dropped.includes(key)) streak.set(key, 0);
  }
  const values = [...worst.values()];
  return { candidates: worst.size, maxWait: values.length ? Math.max(...values) : 0, over: values.filter((value) => value > FAIR_MAX_WAIT).length };
}

const meanTokens = (reads: LiveRead[]) => (reads.length ? Number((reads.reduce((sum, read) => sum + read.tokens, 0) / reads.length).toFixed(1)) : null);

export function overflowOrder(reads: LiveRead[]) {
  return reads.map((read, index) => ({ read: index + 1, dropped: Object.fromEntries(read.sources.filter((source) => source.dropped.length).map((source) => [source.kind, source.dropped.length])) }))
    .filter((row) => Object.keys(row.dropped).length);
}

export function scoreCombined(row: CombinedRow, { members, baseline, combined, blocks }: { members: number; baseline: LiveRead[]; combined: LiveRead[]; blocks: number[] }) {
  const ok = (reads: LiveRead[]) => reads.filter((read) => !read.error);
  const base = { tokensMean: meanTokens(ok(baseline)), latencyP50: percentile(ok(baseline).map((read) => read.ms), 0.5) };
  const both = { tokensMean: meanTokens(ok(combined)), latencyP50: percentile(ok(combined).map((read) => read.ms), 0.5) };
  const tokens = growth(both.tokensMean, base.tokensMean);
  const latency = growth(both.latencyP50, base.latencyP50);
  const firstQuest = combined[0]?.sources.find((source) => source.kind === 'quest');
  const activeQuestKeys = firstQuest ? firstQuest.keys.length + firstQuest.dropped.length : 0;
  const cardPulls = Math.max(0, ...combined.map((read) => read.sources.find((source) => source.kind === 'card')?.keys.length ?? 0));
  const relationshipPulls = Math.max(0, ...combined.map((read) => read.sources.find((source) => source.kind === 'relationship')?.keys.length ?? 0));
  const quest = waits(combined, 'quest');
  const pair = waits(combined, 'relationship');
  const p95 = percentile(blocks, 0.95);
  const max = blocks.length ? Math.max(...blocks) : null;
  const floors = {
    tokens36: { growth: tokens, max: M1_TOKEN_GROWTH_MAX, ok: tokens !== null && tokens <= M1_TOKEN_GROWTH_MAX, from: '36 §Q1 M1' },
    latency36: { growth: latency, max: M1_LATENCY_GROWTH_MAX, ok: latency !== null && latency <= M1_LATENCY_GROWTH_MAX, from: '36 §Q1 M1' },
    tokens37: { growth: tokens, max: M2_TOKEN_GROWTH_MAX, ok: tokens !== null && tokens <= M2_TOKEN_GROWTH_MAX, from: '37 §Floors' },
    latency37: { growth: latency, max: M2_LATENCY_GROWTH_MAX, ok: latency !== null && latency <= M2_LATENCY_GROWTH_MAX, from: '37 §Floors' },
    block37: { p95, max, p95Max: BLOCK_P95_MAX, maxMax: BLOCK_MAX, ok: p95 !== null && max !== null && p95 <= BLOCK_P95_MAX && max <= BLOCK_MAX, from: '37 §Floors' },
    questFairness: { ...quest, maxAllowed: FAIR_MAX_WAIT, ok: quest.over === 0, unit: 'per quest scope key (a quest with one key kept counts as waiting on its other keys: stricter than per quest)' },
    ...(row === '37-S17' ? { pairFairness: { ...pair, maxAllowed: FAIR_MAX_WAIT, ok: pair.over === 0, unit: 'per relationship axis key (stricter than per pair)' } } : {}),
  };
  const incomplete = [
    ...(members < MIN_MEMBERS ? [`a ${members}-member cast, the row needs ${MIN_MEMBERS}`] : []),
    ...(activeQuestKeys < MIN_ACTIVE_QUEST_KEYS ? [`${activeQuestKeys} active quest key(s) in the first read, the row needs >= ${MIN_ACTIVE_QUEST_KEYS} active quests`] : []),
    ...(!cardPulls ? ['no card pull in any read: card pulls must share the reads'] : []),
    ...(!relationshipPulls ? ['no relationship axis in any read'] : []),
    ...(combined.some((read) => read.error) || baseline.some((read) => read.error) ? [`${[...combined, ...baseline].filter((read) => read.error).length} read(s) errored`] : []),
    ...(baseline.length !== combined.length ? ['the baseline and combined arms read different windows'] : []),
    ...(blocks.length < combined.length ? [`${combined.length - blocks.length} block reading(s) missing`] : []),
  ];
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : Object.values(floors).every((floor) => floor.ok) ? 'PASS' : 'FAIL';
  return {
    floor: COMBINED_FLOOR_TEXT[row],
    verdict,
    incomplete,
    reads: combined.length,
    baseline: base,
    combined: both,
    exercised: { members, activeQuestKeys, cardPulls, relationshipPulls },
    floors,
    overflowOrder: { decidedIn: 'B2 (record only here)', reads: overflowOrder(combined) },
  };
}
