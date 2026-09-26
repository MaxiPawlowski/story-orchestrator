import { hasStateChangeMarker, jaccardSimilarity } from "./similarity";
import type { MemoryEntry, MemoryStoreState } from "./types";

export interface DedupThresholds {
  cosineDup: number;
  cosineCrossDup: number;
  cosineSameTopic: number;
  jaccardDup: number;
  jaccardCrossDup: number;
  jaccardSameTopic: number;
}

export const DEFAULT_DEDUP_THRESHOLDS: DedupThresholds = {
  cosineDup: 0.82,
  cosineCrossDup: 0.88,
  cosineSameTopic: 0.55,
  jaccardDup: 0.65,
  jaccardCrossDup: 0.75,
  jaccardSameTopic: 0.4,
};

export const CONSOLIDATION_MIN_GROUP = 8;

export interface MatchSets {
  dup: Set<number>[];
  sameTopic: Set<number>[];
}

export interface ConsolidationResult {
  droppedIds: string[];
  supersededPairs: Array<{ loserId: string; winnerId: string }>;
  confirmedIds: string[];
  uncertain: Array<{ candidateId: string; existingId: string }>;
}

const normalize = (text: string) => text.trim().toLowerCase();

export function buildJaccardMatchSets(entries: MemoryEntry[], thresholds: DedupThresholds = DEFAULT_DEDUP_THRESHOLDS): MatchSets {
  const dup: Set<number>[] = entries.map(() => new Set<number>());
  const sameTopic: Set<number>[] = entries.map(() => new Set<number>());
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = 0; j < entries.length; j += 1) {
      if (i === j) continue;
      const score = jaccardSimilarity(entries[i].text, entries[j].text);
      const sameType = entries[i].type === entries[j].type;
      const dupThreshold = sameType ? thresholds.jaccardDup : thresholds.jaccardCrossDup;
      if (score >= dupThreshold) dup[i].add(j);
      else if (sameType && score >= thresholds.jaccardSameTopic) sameTopic[i].add(j);
    }
  }
  return { dup, sameTopic };
}

interface PairWalk {
  isDuplicate: boolean;
  confirmedId: string | null;
  supersededIdx: number;
  uncertainIdx: number;
}

interface PairInput {
  entries: MemoryEntry[];
  normalized: string[];
  walk: PairWalk;
  i: number;
  j: number;
  inDup: boolean;
  inSameTopic: boolean;
  hasMarker: boolean;
}

type PairStep = "next" | "stop";
type PairDecision = (pair: PairInput) => PairStep;

const noteSupersede = (walk: PairWalk, j: number) => { if (walk.supersededIdx === -1) walk.supersededIdx = j; };
const noteUncertain = (walk: PairWalk, j: number) => { if (walk.uncertainIdx === -1) walk.uncertainIdx = j; };
const noteChange = (walk: PairWalk, j: number, hasMarker: boolean) => (hasMarker ? noteSupersede(walk, j) : noteUncertain(walk, j));

// Pin is retention, not truth. A pinned predecessor is superseded like any other; only a lock freezes
// it, and a locked row sends its candidate to the queue instead.
const heuristicPair: PairDecision = ({ entries, normalized, walk, i, j, inDup, inSameTopic, hasMarker }) => {
  const sameType = entries[j].type === entries[i].type;
  const identical = normalized[i] === normalized[j];
  if (entries[j].locked) {
    noteUncertain(walk, j);
    return "next";
  }
  if (inDup && sameType && !identical && !entries[j].supersededBy) {
    noteChange(walk, j, hasMarker);
  } else if (inDup) {
    walk.isDuplicate = true;
    walk.confirmedId = entries[j].id;
    return "stop";
  } else if (inSameTopic && sameType) {
    noteChange(walk, j, hasMarker);
  }
  return "next";
};

const walkTier = (entries: MemoryEntry[], matches: MatchSets, decide: PairDecision, result: ConsolidationResult) => {
  const normalized = entries.map((entry) => normalize(entry.text));
  const order = entries.map((_, index) => index).sort((a, b) => entries[a].createdAt - entries[b].createdAt);
  const kept: number[] = [];
  const retired = new Set<number>();
  const confirmed = new Set<string>();
  for (const i of order) {
    const entry = entries[i];
    const walk: PairWalk = { isDuplicate: false, confirmedId: null, supersededIdx: -1, uncertainIdx: -1 };
    const hasMarker = hasStateChangeMarker(entry.text);
    for (const j of kept) {
      if (retired.has(j)) continue;
      const inDup = matches.dup[i].has(j);
      const inSameTopic = matches.sameTopic[i].has(j);
      if (!inDup && !inSameTopic) continue;
      if (decide({ entries, normalized, walk, i, j, inDup, inSameTopic, hasMarker }) === "stop") break;
    }
    if (walk.isDuplicate && !entry.pinned) {
      result.droppedIds.push(entry.id);
      if (walk.confirmedId) confirmed.add(walk.confirmedId);
      continue;
    }
    if (walk.supersededIdx !== -1) {
      retired.add(walk.supersededIdx);
      result.supersededPairs.push({ loserId: entries[walk.supersededIdx].id, winnerId: entry.id });
    } else if (walk.uncertainIdx !== -1) {
      result.uncertain.push({ candidateId: entry.id, existingId: entries[walk.uncertainIdx].id });
    }
    kept.push(i);
  }
  result.confirmedIds = [...confirmed];
};

export function consolidateTier(entries: MemoryEntry[], matches: MatchSets): ConsolidationResult {
  const result: ConsolidationResult = { droppedIds: [], supersededPairs: [], confirmedIds: [], uncertain: [] };
  walkTier(entries, matches, heuristicPair, result);
  return result;
}

export function applyConsolidation(state: MemoryStoreState, result: ConsolidationResult, at: { messageId: number; boundary?: number }): MemoryStoreState {
  const dropped = new Set(result.droppedIds);
  const superseded = new Map(result.supersededPairs.map((pair) => [pair.loserId, pair.winnerId]));
  const confirmed = new Set(result.confirmedIds);
  const entries = state.entries
    .filter((entry) => entry.pinned || !dropped.has(entry.id))
    .map((entry) => {
      let next = entry;
      const winner = superseded.get(entry.id);
      // First link wins. Re-retiring an already-retired entry would overwrite the
      // provenance of the link that is already there, and a rollback could then never restore the
      // state the cut saw: the property test in `rollbackReplay.property.test.ts` found exactly that.
      if (winner && !entry.locked && !entry.supersededBy) next = { ...next, supersededBy: winner, supersededAt: at };
      if (confirmed.has(entry.id)) next = { ...next, recallCount: next.recallCount + 1, contradicted: false, confirmedAt: [...(next.confirmedAt ?? []), at] };
      return next;
    });
  return { ...state, entries };
}

export type PairRelation = "duplicate" | "update" | "distinct" | "unrelated";
export type RelationLookup = (olderId: string, newerId: string) => PairRelation | "none" | null;

export interface JudgedConsolidationResult extends ConsolidationResult {
  clearedIds: string[];
}

// The same oldest-first walk as consolidateTier, but a judged relation decides each candidate pair. A pair
// the lookup cannot answer (null) falls back to exactly the heuristic decision consolidateTier would have
// made; "none" means the pair is only a candidate because the judge's wider net surfaced it, so without an
// answer it is left alone.
const judgedPair = (relationOf: RelationLookup, cleared: Set<string>): PairDecision => (pair) => {
  const { entries, walk, i, j } = pair;
  const relation = relationOf(entries[j].id, entries[i].id);
  if (relation === "none") return "next";
  if (relation === "duplicate") {
    walk.isDuplicate = true;
    walk.confirmedId = entries[j].id;
    return "stop";
  }
  if (relation === "update") {
    // A locked row cannot be superseded, so its candidate becomes a SURFACED conflict instead of a
    // silent loss: the reconciliation queue is where an author decides.
    if (entries[j].locked) noteUncertain(walk, j);
    else noteSupersede(walk, j);
    return "next";
  }
  if (relation === "distinct" || relation === "unrelated") {
    if (entries[j].contradicted) cleared.add(entries[j].id);
    return "next";
  }
  return heuristicPair(pair);
};

export function consolidateTierJudged(entries: MemoryEntry[], matches: MatchSets, relationOf: RelationLookup): JudgedConsolidationResult {
  const result: JudgedConsolidationResult = { droppedIds: [], supersededPairs: [], confirmedIds: [], uncertain: [], clearedIds: [] };
  const cleared = new Set<string>();
  walkTier(entries, matches, judgedPair(relationOf, cleared), result);
  result.clearedIds = [...cleared].filter((id) => !result.uncertain.some((pair) => pair.existingId === id));
  return result;
}

// The candidate pairs consolidateTierJudged will visit, in walk order: what the judge must answer.
export function candidatePairs(entries: MemoryEntry[], matches: MatchSets): Array<{ older: MemoryEntry; newer: MemoryEntry; dup: boolean }> {
  const order = entries.map((_, index) => index).sort((a, b) => entries[a].createdAt - entries[b].createdAt);
  const pairs: Array<{ older: MemoryEntry; newer: MemoryEntry; dup: boolean }> = [];
  order.forEach((i, position) => {
    order.slice(0, position).forEach((j) => {
      const dup = matches.dup[i].has(j);
      if (dup || matches.sameTopic[i].has(j)) pairs.push({ older: entries[j], newer: entries[i], dup });
    });
  });
  return pairs;
}
