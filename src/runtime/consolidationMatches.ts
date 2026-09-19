import { buildJaccardMatchSets, candidatePairs, DEFAULT_DEDUP_THRESHOLDS, type DedupThresholds, type MatchSets, type MemoryEntry, type RelationLookup } from "@memory/index";
import { buildPairRequest, pairDecision, PAIR_CONCURRENCY, PAIR_MAX_PER_PASS, readPair, type JudgePairRelation } from "@judge/index";
import { DEFAULT_VECTOR_SOURCE, vectorInsert, vectorPurge, vectorQuery } from "@services/STAPI";
import type { JudgeRuntime } from "./judge";

// Candidate generation for consolidation: ST vectors when available, Jaccard otherwise. Moved out of
// the memory coordinator in v2.2 plan 02 so the judged path fits its line budget.
export async function buildMatchSets(group: MemoryEntry[], thresholds: DedupThresholds = DEFAULT_DEDUP_THRESHOLDS): Promise<MatchSets> {
  const collectionId = `so_consol_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  try {
    await vectorInsert(collectionId, group.map((entry, index) => ({ hash: index, text: entry.text, index })), DEFAULT_VECTOR_SOURCE);
    const queryAt = (text: string, threshold: number) => vectorQuery(collectionId, text, group.length, threshold, DEFAULT_VECTOR_SOURCE).then((matches) => new Set(matches.map((match) => match.index)));
    const dup: Set<number>[] = [];
    const sameTopic: Set<number>[] = [];
    for (let i = 0; i < group.length; i += 1) {
      const [dupSameIdx, dupCrossIdx, sameIdx] = await Promise.all([
        queryAt(group[i].text, thresholds.cosineDup),
        queryAt(group[i].text, thresholds.cosineCrossDup),
        queryAt(group[i].text, thresholds.cosineSameTopic),
      ]);
      const dupSet = new Set<number>();
      const sameSet = new Set<number>();
      for (let j = 0; j < group.length; j += 1) {
        if (j === i) continue;
        const sameType = group[j].type === group[i].type;
        if (sameType ? dupSameIdx.has(j) : dupCrossIdx.has(j)) dupSet.add(j);
        else if (sameType && sameIdx.has(j)) sameSet.add(j);
      }
      dup.push(dupSet);
      sameTopic.push(sameSet);
    }
    return { dup, sameTopic };
  } catch (error) {
    console.warn("[Story memory] vector consolidation unavailable, using keyword overlap", error);
    return buildJaccardMatchSets(group, thresholds);
  } finally {
    try {
      await vectorPurge(collectionId);
    } catch {
      /* best effort */
    }
  }
}

// v2.2 plan 02: one judged relation per candidate pair (dup band first, capped per pass). A pair the
// judge does not answer confidently is left out of the lookup, so the walk keeps today's decision.
export async function judgePairRelations(judge: JudgeRuntime, group: MemoryEntry[], matches: MatchSets, todays: MatchSets): Promise<RelationLookup> {
  const pairs = candidatePairs(group, matches).sort((left, right) => Number(right.dup) - Number(left.dup)).slice(0, PAIR_MAX_PER_PASS);
  const decisions = new Map<string, JudgePairRelation>();
  for (let start = 0; start < pairs.length; start += PAIR_CONCURRENCY) {
    await Promise.all(pairs.slice(start, start + PAIR_CONCURRENCY).map(async (pair) => {
      const result = await judge.ask("memoryPairs", buildPairRequest(pair.older.text, pair.newer.text), {
        summarize: (answers): Record<string, number | string> => {
          const read = answers ? readPair(answers) : null;
          return read ? { relation: read.relation, confidence: read.confidence } : {};
        },
      });
      const decision = result.answers ? pairDecision(readPair(result.answers)) : null;
      if (decision) decisions.set(`${pair.older.id}>${pair.newer.id}`, decision);
    }));
  }
  const index = new Map(group.map((entry, position) => [entry.id, position]));
  const today = (olderId: string, newerId: string) => {
    const older = index.get(olderId) ?? -1;
    const newer = index.get(newerId) ?? -1;
    return todays.dup[newer]?.has(older) || todays.sameTopic[newer]?.has(older);
  };
  return (olderId, newerId) => decisions.get(`${olderId}>${newerId}`) ?? (today(olderId, newerId) ? null : "none");
}
