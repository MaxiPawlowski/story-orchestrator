import { buildJaccardMatchSets, candidatePairs, DEFAULT_DEDUP_THRESHOLDS, type DedupThresholds, type MatchSets, type MemoryEntry, type RelationLookup } from "@memory/index";
import { buildPairRequest, pairDecision, PAIR_CONCURRENCY, PAIR_MAX_PER_PASS, PAIR_TIMEOUT_MS, readPair, type JudgePairRelation } from "@judge/index";
import type { JudgeRuntime } from "./judge";
import type { VectorHost } from "./hostPorts";

// Candidate generation for consolidation: ST vectors when available, Jaccard otherwise. Moved out of
// the memory coordinator so the judged path fits its line budget.
export async function buildMatchSets(host: VectorHost, group: MemoryEntry[], thresholds: DedupThresholds = DEFAULT_DEDUP_THRESHOLDS): Promise<MatchSets> {
  // Absence is a fact about the install, not a failure: asking the vectors API anyway
  // costs a probe, an insert and N queries before the same fallback, and logs a warning that reads
  // like a defect. An `error` still goes down that path, because a fault may not repeat.
  if ((await host.capabilityState("vectors")) === "absent") return buildJaccardMatchSets(group, thresholds);
  const collectionId = `so_consol_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  try {
    await host.vectorInsert(collectionId, group.map((entry, index) => ({ hash: index, text: entry.text, index })), host.source);
    const queryAt = (text: string, threshold: number) => host.vectorQuery(collectionId, text, group.length, threshold, host.source).then((matches) => new Set(matches.map((match) => match.index)));
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
      await host.vectorPurge(collectionId);
    } catch {
      /* best effort */
    }
  }
}

// One judged relation per candidate pair (dup band first, capped per pass). A pair the
// judge does not answer confidently is left out of the lookup, so the walk keeps today's decision.
export async function judgePairRelations(judge: JudgeRuntime, group: MemoryEntry[], matches: MatchSets, todays: MatchSets): Promise<RelationLookup> {
  const pairs = candidatePairs(group, matches).sort((left, right) => Number(right.dup) - Number(left.dup)).slice(0, PAIR_MAX_PER_PASS);
  const decisions = new Map<string, JudgePairRelation>();
  for (let start = 0; start < pairs.length; start += PAIR_CONCURRENCY) {
    await Promise.all(pairs.slice(start, start + PAIR_CONCURRENCY).map(async (pair) => {
      const result = await judge.ask("memoryPairs", buildPairRequest(pair.older.text, pair.newer.text), {
        timeoutMs: PAIR_TIMEOUT_MS,
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
