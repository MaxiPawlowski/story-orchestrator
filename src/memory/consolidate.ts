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

export function consolidateTier(entries: MemoryEntry[], matches: MatchSets): ConsolidationResult {
  const result: ConsolidationResult = { droppedIds: [], supersededPairs: [], confirmedIds: [], uncertain: [] };
  const normalized = entries.map((entry) => normalize(entry.text));
  const order = entries.map((_, index) => index).sort((a, b) => entries[a].createdAt - entries[b].createdAt);
  const kept: number[] = [];
  const retired = new Set<number>();
  const confirmed = new Set<string>();

  for (const i of order) {
    const entry = entries[i];
    const hasMarker = hasStateChangeMarker(entry.text);
    let isDuplicate = false;
    let confirmedId: string | null = null;
    let supersededIdx = -1;
    let uncertainIdx = -1;

    for (const j of kept) {
      if (retired.has(j)) continue;
      const inDup = matches.dup[i].has(j);
      const inSameTopic = matches.sameTopic[i].has(j);
      if (!inDup && !inSameTopic) continue;
      const sameType = entries[j].type === entry.type;
      const identical = normalized[i] === normalized[j];

      if (inDup && sameType && !identical && !entries[j].pinned) {
        if (hasMarker) supersededIdx = supersededIdx === -1 ? j : supersededIdx;
        else uncertainIdx = uncertainIdx === -1 ? j : uncertainIdx;
      } else if (inDup) {
        isDuplicate = true;
        confirmedId = entries[j].id;
        break;
      } else if (inSameTopic && sameType && !entries[j].pinned) {
        if (hasMarker) supersededIdx = supersededIdx === -1 ? j : supersededIdx;
        else uncertainIdx = uncertainIdx === -1 ? j : uncertainIdx;
      }
    }

    if (isDuplicate && !entry.pinned) {
      result.droppedIds.push(entry.id);
      if (confirmedId) confirmed.add(confirmedId);
      continue;
    }
    if (supersededIdx !== -1) {
      retired.add(supersededIdx);
      result.supersededPairs.push({ loserId: entries[supersededIdx].id, winnerId: entry.id });
    } else if (uncertainIdx !== -1) {
      result.uncertain.push({ candidateId: entry.id, existingId: entries[uncertainIdx].id });
    }
    kept.push(i);
  }

  result.confirmedIds = [...confirmed];
  return result;
}

export function applyConsolidation(state: MemoryStoreState, result: ConsolidationResult): MemoryStoreState {
  const dropped = new Set(result.droppedIds);
  const superseded = new Map(result.supersededPairs.map((pair) => [pair.loserId, pair.winnerId]));
  const confirmed = new Set(result.confirmedIds);
  const entries = state.entries
    .filter((entry) => entry.pinned || !dropped.has(entry.id))
    .map((entry) => {
      let next = entry;
      const winner = superseded.get(entry.id);
      if (winner && !entry.pinned) next = { ...next, supersededBy: winner };
      if (confirmed.has(entry.id)) next = { ...next, recallCount: next.recallCount + 1, contradicted: false };
      return next;
    });
  return { ...state, entries };
}
