import { isLive, withOverride, withValidity, type Provenance } from "./provenance";
import { ledgerKey } from "./ledger";
import { hasStateChangeMarker } from "./similarity";
import { buildJaccardMatchSets, type MatchSets } from "./consolidate";
import { polarityMatchSets } from "./polarity";
import type { LedgerEntry, MemoryEntry } from "./types";

// Two stores can both hold a claim about the same thing and disagree. The soft
// signal that existed (`entry.contradicted`, a score penalty) is something a strong entry outweighs,
// so a character could be corrected toward the losing side. A conflict is therefore a HARD state:
// both records are marked `conflicted`, every consumer excludes them, and the author resolves it in
// the reconciliation queue.
export const CONFLICT_LIMIT = 40;

export interface ConflictSide {
  store: "memory" | "ledger" | "scene";
  id: string;
  label: string;
  /** The message the claim was read from, so the queue can ask the read to look at it again. */
  messageId?: number;
  /** How sure the record itself was. Blackboard bound values have none (the author's
   *  own edit) and say so by leaving it out. */
  confidence?: number;
  provenance?: Provenance;
  /** The established side of a held claim. It keeps steering while the pair waits. */
  standing?: true;
}

export interface ConflictWindow {
  from: number;
  to: number;
}

export interface ConflictPair {
  /** Stable identity, so a resolved pair does not re-queue on the next pass. */
  key: string;
  sides: [ConflictSide, ConflictSide];
  /** Where the disagreement was found. Both sides are already conflicted. */
  detectedAt: string;
  /** The span the two claims were read from, so "re-read the window" reads THAT, not the newest. */
  window: ConflictWindow | null;
}

export interface SceneConflictValue {
  field: "location" | "time";
  value: string;
  confidence?: number;
  messageId?: number;
  provenance?: Provenance;
}

/** What a stored scene read claims, in the same shape a ledger row or a blackboard value is. Fields
 *  the read did not answer are simply absent — an unanswered question is not a disagreement. */
export function sceneConflictValues(record: {
  messageId: number;
  provenance?: Provenance;
  location?: { value: string; confidence: number };
  time?: { value: string; confidence: number };
} | null | undefined): SceneConflictValue[] {
  if (!record) return [];
  return (["location", "time"] as const).flatMap((field) => {
    const read = record[field];
    if (!read?.value) return [];
    return [{ field, value: read.value, confidence: read.confidence, messageId: record.messageId, ...(record.provenance ? { provenance: record.provenance } : {}) }];
  });
}

export const sceneConflictKey = (field: string) => `scene:${field.trim().toLowerCase()}`;

export const sceneFieldsInConflict = (conflicts: ReadonlyArray<{ sides: ReadonlyArray<{ store: string; id: string }> }> | undefined): Set<string> =>
  new Set((conflicts ?? []).flatMap((pair) => pair.sides).filter((side) => side.store === "scene").map((side) => side.id.replace(/^scene:/, "")));

const sideOf = (record: { id: string; messageId?: number; confidence?: number; provenance?: Provenance }, store: ConflictSide["store"], label: string): ConflictSide => ({
  store,
  id: record.id,
  label,
  ...(typeof record.messageId === "number" ? { messageId: record.messageId } : {}),
  ...(typeof record.confidence === "number" ? { confidence: record.confidence } : {}),
  ...(record.provenance ? { provenance: record.provenance } : {}),
});

// The span the pair's claims came from: oldest source message to newest. A side with no message
// cannot place the conflict in the transcript, and the caller falls back to reading the newest
// window — the honest answer when nothing names a span.
export function conflictWindow(pair: Pick<ConflictPair, "sides">): ConflictWindow | null {
  const ids = pair.sides.flatMap((side) => (!side.standing && typeof side.messageId === "number" ? [side.messageId] : []));
  if (!ids.length) return null;
  return { from: Math.min(...ids), to: Math.max(...ids) };
}

export function conflictWindowOf(conflicts: ConflictPair[], key: string): ConflictWindow | null {
  const pair = conflicts.find((candidate) => candidate.key === key);
  return pair ? conflictWindow(pair) : null;
}

/** The newest live version of each ledger key, which is the row that speaks for it. */
export function liveLedgerRows(entries: LedgerEntry[]): LedgerEntry[] {
  const newest = new Map<string, LedgerEntry>();
  entries.forEach((entry) => {
    if (entry.provenance && entry.provenance.validity !== "live") return;
    const key = ledgerKey(entry.entity, entry.field);
    const held = newest.get(key);
    if (!held || (entry.messageId ?? -1) >= (held.messageId ?? -1)) newest.set(key, entry);
  });
  return [...newest.values()];
}

const normalizeValue = (value: string) => value.trim().toLowerCase();
const mentions = (text: string, token: string) => text.toLowerCase().includes(token.toLowerCase());

// The candidate pairs a fact forms with the ledger: its own evidence text, and the words the two
// claims actually share. A lexical measure is what the same-topic band is built from
// (`jaccardSimilarity`), so the queue's candidate search uses the same shape: token overlap over the
// words long enough to carry meaning. It is deliberately generous — a pair it over-includes is
// decided by `claimsDifferentValue`, while a pair it under-includes is a disagreement nobody sees.
const stopWords = new Set([
  "the",
  "and",
  "with",
  "that",
  "this",
  "from",
  "into",
  "over",
  "under",
  "her",
  "his",
  "its",
  "their",
  "they",
  "she",
  "him",
  "was",
  "were",
  "has",
  "had",
  "have",
  "not",
  "but",
  "for",
  "are",
  "been",
  "than",
  "then",
  "when",
  "while",
]);
const contentTokens = (text: string) => [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3 && !stopWords.has(token)))];

function sameTopic(fact: MemoryEntry, row: LedgerEntry, bound?: { field: string; value: string }): boolean {
  const factTokens = contentTokens(fact.text);
  // The entity is the subject: the fact has to touch it, by name or by one of its own words. Without
  // this a claim about "the condition of the road" is queued against Mara's condition, because the
  // only thing the two share is a word — and a word is not an entity.
  const names = [row.entity, ...fact.entities];
  const about = names.some((entity) => mentions(fact.text, entity) || contentTokens(entity).some((token) => factTokens.includes(token)));
  if (!about) return false;
  const known = [row.field, row.value, ...(bound ? [bound.field, bound.value] : [])];
  return factTokens.some((token) => known.flatMap(contentTokens).includes(token));
}

/** The fact and the ledger row disagree: the row's value appears nowhere in the fact's claim. */
function claimsDifferentValue(fact: MemoryEntry, row: LedgerEntry, bound?: { field: string; value: string }): boolean {
  if (mentions(fact.text, row.value)) return false;
  return bound ? !mentions(fact.text, bound.value) : true;
}

// Ledger against blackboard: the same (entity, field) speaking in two values. `boundValues` carries
// the quality's own provenance where the caller has it, so a queued conflict can say who wrote each
// side; a bound claim the author has not touched keeps the blackboard as its source.
export function detectConflicts(
  entries: MemoryEntry[],
  ledger: LedgerEntry[],
  boundValues: Record<string, { entity: string; field: string; value: string; provenance?: Provenance }>,
  resolved: string[] = [],
  scene: SceneConflictValue[] = [],
  at = new Date().toISOString(),
): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  const already = new Set(resolved);
  const push = (pair: Omit<ConflictPair, "detectedAt" | "window">) => {
    const full = { ...pair, detectedAt: at, window: null };
    pairs.push({ ...full, window: conflictWindow(full) });
  };
  const liveLedger = liveLedgerRows(ledger).filter((row) => !(row.provenance && row.provenance.validity !== "live"));

  for (const row of liveLedger) {
    const bound = Object.values(boundValues).find((candidate) => ledgerKey(candidate.entity, candidate.field) === ledgerKey(row.entity, row.field));
    if (!bound) continue;
    if (normalizeValue(bound.value) === normalizeValue(row.value)) continue;
    const key = `bound:${ledgerKey(row.entity, row.field)}`;
    if (already.has(key)) continue;
    push({
      key,
      sides: [
        sideOf(row, "ledger", `${row.entity} ${row.field} = ${row.value} (ledger)`),
        {
          store: "ledger",
          id: `bound:${row.entity}:${row.field}`,
          label: `${bound.entity} ${bound.field} = ${bound.value} (blackboard)`,
          ...(bound.provenance ? { provenance: bound.provenance } : {})
        },
      ],
    });
  }

  for (const entry of entries) {
    if (entry.provenance && entry.provenance.validity !== "live") continue;
    if (entry.supersededBy || entry.foldedInto) continue;
    for (const row of liveLedger) {
      const bound = Object.values(boundValues).find((candidate) => ledgerKey(candidate.entity, candidate.field) === ledgerKey(row.entity, row.field));
      if (!sameTopic(entry, row, bound)) continue;
      if (!claimsDifferentValue(entry, row, bound)) continue;
      // One claim can only name the row's field: a fact that never mentions it is not a disagreement
      // about it, and treating it as one would queue the whole tier. The field or its value has to be
      // somewhere in the fact for the pair to be about the same thing.
      if (!mentions(entry.text, row.field) && !contentTokens(entry.text).some((token) => contentTokens(row.field).includes(token))) continue;
      const key = `fact:${entry.id}:${ledgerKey(row.entity, row.field)}`;
      if (already.has(key)) continue;
      push({ key, sides: [sideOf(entry, "memory", entry.text), sideOf(row, "ledger", `${row.entity} ${row.field} = ${row.value}`)] });
    }
  }

  for (const read of scene) {
    const bound = Object.values(boundValues).find((candidate) => String(candidate.field ?? "").toLowerCase() === read.field);
    const row = liveLedger.find((candidate) => normalizeValue(candidate.field) === read.field);
    const key = sceneConflictKey(read.field);
    if (already.has(key)) continue;
    if (row && normalizeValue(row.value) !== normalizeValue(read.value)) {
      push({
        key,
        sides: [
          sideOf(row, "ledger", `${row.entity} ${row.field} = ${row.value} (ledger)`),
          {
            store: "scene",
            id: `scene:${read.field}`,
            label: `scene ${read.field} = ${read.value}`,
            ...(read.messageId === undefined ? {} : { messageId: read.messageId }),
            ...(read.confidence === undefined ? {} : { confidence: read.confidence }),
            ...(read.provenance ? { provenance: read.provenance } : {})
          },
        ],
      });
      continue;
    }
    if (bound && normalizeValue(bound.value) !== normalizeValue(read.value)) {
      push({
        key,
        sides: [
          { store: "ledger", id: `bound:${bound.entity}:${bound.field}`, label: `${bound.entity} ${bound.field} = ${bound.value} (blackboard)` },
          {
            store: "scene",
            id: `scene:${read.field}`,
            label: `scene ${read.field} = ${read.value}`,
            ...(read.messageId === undefined ? {} : { messageId: read.messageId }),
            ...(read.confidence === undefined ? {} : { confidence: read.confidence }),
            ...(read.provenance ? { provenance: read.provenance } : {})
          },
        ],
      });
    }
  }
  return pairs;
}

/** Both sides of a queued conflict stop steering replies until the author resolves it. A store
 *  nothing matched is returned UNCHANGED, so a pass that found nothing is still a no-op and the
 *  write-edge census keeps seeing silence where there is nothing to write. */
export function markConflicted<T extends { provenance: Provenance }>(records: T[], ids: string[], idOf: (record: T) => string): T[] {
  const wanted = new Set(ids);
  if (!records.some((record) => wanted.has(idOf(record)))) return records;
  return records.map((record) => (wanted.has(idOf(record)) ? { ...record, ...withValidity(record, "conflicted") } : record));
}

// A row the story has settled: locked as canon, decided by the author, or written
// by the author. A pin is retention, not truth, so a pinned extracted row is not settled. A new claim in its band is HELD — queued with the established row standing — instead of
// joining the live facts on its own. "In its band" is the consolidation bands (vectors, else
// Jaccard), which cannot tell a contradiction from an agreeing paraphrase: both are held, and an
// agreeing one loses nothing because the established row already says it. Below the band, a claim of
// opposite polarity (an explicit negator on one side only) about the same subject is held too; a
// contradiction worded with too little overlap and no negator is not seen at all.
export const isEstablished = (entry: MemoryEntry): boolean => Boolean(entry.locked || entry.provenance?.override || entry.provenance?.source === "author");

export const standsEstablished = (entry: MemoryEntry): boolean => isEstablished(entry) && isLive(entry) && !entry.supersededBy && !entry.foldedInto;

export interface HeldContradiction {
  established: MemoryEntry;
  candidate: MemoryEntry;
}

/** The group the bands are built over: established rows first, then the candidates. Every row reads
 *  as one type, because the same-topic band only pairs rows of the same type, and whether a claim
 *  contradicts a settled fact does not depend on the extractor calling it a fact or an event. */
export const heldGroup = (established: MemoryEntry[], candidates: MemoryEntry[]): MemoryEntry[] =>
  [...established, ...candidates].map((entry) => ({ ...entry, type: "fact" as const }));

export function unionMatchSets(left: MatchSets, right: MatchSets): MatchSets {
  const merge = (a: Set<number>[], b: Set<number>[]) => Array.from({ length: Math.max(a.length, b.length) }, (_, index) => new Set([...(a[index] ?? []), ...(b[index] ?? [])]));
  return { dup: merge(left.dup, right.dup), sameTopic: merge(left.sameTopic, right.sameTopic) };
}

/** The bands that guard an ESTABLISHED row are the vectors
 *  bands OR the Jaccard bands. Measured on lane 2, "the bridge is gone" vs "the bridge is intact" sat at
 *  cosine 0.410 / 0.359 (under the 0.55 same-topic band) and at Jaccard 0.533 / 0.571 (over its 0.4
 *  band): a sentence embedding barely moves on polarity, so vectors alone stored the claim live. The
 *  union only widens the hold on settled rows; ordinary consolidation keeps its single source. The
 *  polarity screen joins it here and nowhere else. */
export const establishedBands = (group: MemoryEntry[], vectors: MatchSets | null, subjectFloor: number): MatchSets => {
  const overlap = unionMatchSets(buildJaccardMatchSets(group), polarityMatchSets(group, subjectFloor));
  return vectors ? unionMatchSets(vectors, overlap) : overlap;
};

/** Below a lock, a candidate carrying a state-change marker is an UPDATE that consolidation may
 *  supersede the row with, exactly as it would today. A lock is truth: every candidate in its band is held. */
export function heldContradictions(established: MemoryEntry[], candidates: MemoryEntry[], matches: MatchSets): HeldContradiction[] {
  const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();
  return candidates.flatMap((candidate, offset) => {
    const at = established.length + offset;
    return established.flatMap((row, index) => {
      if (!matches.dup[at]?.has(index) && !matches.sameTopic[at]?.has(index)) return [];
      if (same(row.text, candidate.text)) return [];
      if (!row.locked && hasStateChangeMarker(candidate.text)) return [];
      return [{ established: row, candidate }];
    });
  });
}

export const heldConflictKey = (pair: HeldContradiction) => `held:${pair.established.id}>${pair.candidate.id}`;

export function heldConflictPair(pair: HeldContradiction, at: string): ConflictPair {
  const sides: [ConflictSide, ConflictSide] = [{ ...sideOf(pair.established, "memory", pair.established.text), standing: true }, sideOf(pair.candidate, "memory", pair.candidate.text)];
  return { key: heldConflictKey(pair), sides, detectedAt: at, window: conflictWindow({ sides }) };
}

export interface ConflictResolution {
  /** The record the author kept. */
  keep: string;
  /** The record that loses. It is superseded rather than deleted, so a rollback can still restore it. */
  drop: string;
  at: string;
  boundary: number;
  /** "Lock as canon" is one decision, not two — the kept row and its lock are written
   *  together, so a failure cannot leave a resolved pair with an unlocked winner. */
  lock?: boolean;
}

/** Resolving keeps one side and supersedes the other, both carrying the author's override so a
 *  later pass can see that a human decided this. */
export function resolveConflict(entries: MemoryEntry[], resolution: ConflictResolution): MemoryEntry[] {
  return entries.map((entry) => {
    if (entry.id === resolution.keep) return {
      ...entry,
      ...withOverride(entry, "reconciled", resolution.at, resolution.boundary),
      contradicted: false,
      ...(resolution.lock ? { locked: true, pinned: true } : {})
    };
    if (entry.id === resolution.drop) return { ...entry, supersededBy: resolution.keep, ...withOverride(entry, "reconciled", resolution.at, resolution.boundary) };
    return entry;
  });
}
