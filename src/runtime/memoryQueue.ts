import {
  CONFLICT_LIMIT, detectConflicts, establishedBands, heldConflictPair, heldContradictions, heldGroup, isEstablished, markConflicted, markContradicted, provenance,
  standsEstablished,
  type ConflictPair, type ConflictWindow, type HeldContradiction, type LedgerBinding, type MatchSets, type MemoryEntry, type SceneConflictValue, type UncertainPair,
} from "@memory/index";
import type { Provenance } from "@memory/provenance";
import { PAIR_JACCARD_FLOOR } from "@judge/policy";
import type { RunGuard } from "./runToken";
import type { MemoryRuntimeState } from "./types";
import type { DecisionRefusal } from "./memoryDecisions";

export type { DecisionRefusal };

const decisions = () => import("./memoryDecisions");

// The reconciliation queue: what two stores disagree about, held until the author
// decides. It lives here rather than in the memory coordinator for the same reason the rollback
// composition does — it spans the entries, the ledger and the blackboard, and the coordinator has a
// line budget. The coordinator keeps the one-line calls.
export interface MemoryQueueDeps {
  getMemory: () => MemoryRuntimeState;
  patch: (next: Partial<MemoryRuntimeState>, touch?: boolean) => void;
  /** The blackboard's value for every bound quality, in the ledger's own vocabulary. */
  boundValues: () => Record<string, { entity: string; field: string; value: string; provenance?: Provenance }>;
  /** The stored scene read's claims, which the ledger or the blackboard can contradict. */
  sceneValues?: () => SceneConflictValue[];
  boundaryStamp: () => number;
  lastMessageId?: () => number;
  updateInjection: () => void;
  /** A disagreement changes what a later canon synthesis would have been built from, so resolving
   *  one marks the canon stale rather than leaving text derived from a losing claim in play. */
  invalidateCanon?: () => void;
  /** Read the span a conflict came from again, rather than whatever the transcript now ends with. */
  reread?: (window: ConflictWindow, reason: string) => Promise<unknown>;
  /** Whether the last save is still unwritten — the plan-06 save evidence, the same
   *  seam `EffectsApplier.withLedger` refuses an effect on. It is the ONE signal that answers "did
   *  this decision reach the chat's stored state": `save()` resolves either way, because ST's
   *  `saveMetadata` catches its own errors (script.js:9412) and `persist` returns rather than throws. */
  unsaved?: () => boolean;
  save: () => Promise<void>;
  run?: () => RunGuard;
  refused?: (refusal: DecisionRefusal | null) => void;
  /** The consolidation bands (ST vectors, else Jaccard). The established-row guard unions Jaccard's with them. Absent means Jaccard. */
  matchSets?: (group: MemoryEntry[]) => Promise<MatchSets>;
}

export function getConflicts(deps: MemoryQueueDeps): ConflictPair[] {
  return deps.getMemory().conflicts;
}

/** The blackboard's envelope for each bound value, keyed `entity|field` — the way a bound conflict
 *  side names itself, so a consumer reading one can say the blackboard is its source. */
export function boundProvenance(values: Record<string, { entity: string; field: string; provenance?: Provenance }>): Record<string, Provenance> {
  return Object.fromEntries(Object.values(values).flatMap((value) => (value.provenance ? [[`${value.entity}|${value.field}`, value.provenance] as const] : [])));
}

/** What the blackboard says, in the ledger's own vocabulary: a bound quality is the authoritative
 *  value for its (entity, field), so a ledger version that disagrees is a real conflict. The
 *  envelope is the blackboard's own — quality key as its input, the value's version as its
 *  revision — so a bound row's validity follows the blackboard rather than a message. */
export function boundValuesFor(
  bindings: LedgerBinding[],
  values: Record<string, unknown>,
  versions: Record<string, number> = {},
): Record<string, { entity: string; field: string; value: string; provenance?: Provenance }> {
  const bound: Record<string, { entity: string; field: string; value: string; provenance?: Provenance }> = {};
  for (const binding of bindings) {
    const value = values[binding.qualityKey];
    if (value === undefined || value === null) continue;
    bound[binding.qualityKey] = {
      entity: binding.entity,
      field: binding.field,
      value: String(value),
      provenance: provenance({
        source: "blackboard",
        messageId: -1,
        boundary: 0,
        pass: "blackboard",
        sourceRevision: versions[binding.qualityKey],
        inputs: [{ store: "blackboard", id: binding.qualityKey }],
      }),
    };
  }
  return bound;
}

// Newest disagreement first, so the pair the pass just found is the one at the top; the queue exists
// to be decided, and a claim that has been waiting since the first scene should not outrank it.
const byNewest = (left: ConflictPair, right: ConflictPair) => right.detectedAt.localeCompare(left.detectedAt);

/** Detect, mark both sides and queue. A conflict is a HARD state: the rows stop steering replies the
 *  moment they are queued, which is what separates this from `contradicted`'s score penalty. */
export function detectMemoryConflicts(deps: MemoryQueueDeps): ConflictPair[] {
  const state = deps.getMemory();
  if (!state.settings.enabled) return [];
  const found = detectConflicts(state.entries, state.ledger, deps.boundValues(), state.resolvedConflicts, deps.sceneValues?.() ?? []);
  const known = new Set(state.conflicts.map((pair) => pair.key));
  const fresh = found.filter((pair) => !known.has(pair.key));
  const queued = [...state.conflicts, ...fresh].sort(byNewest).slice(0, CONFLICT_LIMIT);
  const memoryIds = queued.flatMap((pair) => pair.sides.filter((side) => side.store === "memory" && !side.standing).map((side) => side.id));
  const ledgerIds = queued.flatMap((pair) => pair.sides.filter((side) => side.store === "ledger" && !side.id.startsWith("bound:")).map((side) => side.id));
  const entries = markConflicted(state.entries, memoryIds, (entry) => entry.id);
  const ledger = markConflicted(state.ledger, ledgerIds, (row) => row.id);
  const changed = fresh.length > 0 || entries !== state.entries || ledger !== state.ledger;
  if (changed) deps.patch({ conflicts: queued, entries, ledger }, false);
  return queued;
}

/** Which of these new rows land in an established row's band. A read, not a
 *  write: the bands may cost host calls, and the caller writes after its own ownership check. */
export async function findHeldContradictions(deps: MemoryQueueDeps, candidates: MemoryEntry[]): Promise<HeldContradiction[]> {
  const established = deps.getMemory().entries.filter(standsEstablished);
  if (!deps.getMemory().settings.enabled || !established.length || !candidates.length) return [];
  const group = heldGroup(established, candidates);
  const matches = establishedBands(group, deps.matchSets ? await deps.matchSets(group) : null, PAIR_JACCARD_FLOOR);
  return heldContradictions(established, candidates, matches);
}

/** Queue each held claim with its established row standing, and take the claim out of play. Only
 *  rows still in the store are held: a tier cap may have trimmed a candidate since the read. */
export function holdMemoryContradictions(deps: MemoryQueueDeps, held: HeldContradiction[]): ConflictPair[] {
  const state = deps.getMemory();
  const present = new Set(state.entries.map((entry) => entry.id));
  const known = new Set([...state.resolvedConflicts, ...state.conflicts.map((pair) => pair.key)]);
  const at = new Date().toISOString();
  const fresh = held.filter((pair) => present.has(pair.candidate.id) && present.has(pair.established.id)).map((pair) => heldConflictPair(pair, at)).filter((pair) => !known.has(pair.key));
  if (!fresh.length) return [];
  const conflicts = [...state.conflicts, ...fresh].sort(byNewest).slice(0, CONFLICT_LIMIT);
  deps.patch({ conflicts, entries: markConflicted(state.entries, fresh.map((pair) => pair.sides[1].id), (entry) => entry.id) }, false);
  return fresh;
}

/** Consolidation's undecided pairs. Against an established row the NEWER claim is held, and the
 *  established row is never marked `contradicted`: that flag drops a row from the warden's facts,
 *  and it used to land on the older side, which is the seed. Every other pair keeps today's mark. */
export function settleUncertain(deps: MemoryQueueDeps, uncertain: UncertainPair[]): void {
  if (!uncertain.length) return;
  const byId = new Map(deps.getMemory().entries.map((entry) => [entry.id, entry]));
  const heldOnes = uncertain.filter((pair) => {
    const existing = byId.get(pair.existingId);
    return existing ? isEstablished(existing) : false;
  });
  const soft = uncertain.filter((pair) => !heldOnes.includes(pair));
  if (soft.length) deps.patch({ entries: markContradicted(deps.getMemory(), soft).entries }, false);
  holdMemoryContradictions(deps, heldOnes.flatMap((pair) => {
    const established = byId.get(pair.existingId);
    const candidate = byId.get(pair.candidateId);
    return established && candidate ? [{ established, candidate }] : [];
  }));
}

export class MemoryQueue {
  private refusal: DecisionRefusal | null = null;
  private readonly deps: MemoryQueueDeps;

  constructor(deps: Omit<MemoryQueueDeps, "refused">) {
    this.deps = { ...deps, refused: (refusal) => { this.refusal = refusal; } };
  }

  lastDecisionRefusal(): DecisionRefusal | null { return this.refusal; }
  detectMemoryConflicts(): ConflictPair[] { return detectMemoryConflicts(this.deps); }
  getConflicts(): ConflictPair[] { return getConflicts(this.deps); }
  async resolveMemoryConflict(key: string, keepId: string, lock = false): Promise<boolean> { return (await decisions()).resolveMemoryConflict(this.deps, key, keepId, lock); }
  async dismissMemoryConflict(key: string): Promise<boolean> { return (await decisions()).dismissMemoryConflict(this.deps, key); }
  async rereadConflictWindow(key: string): Promise<boolean> { return (await decisions()).rereadConflictWindow(this.deps, key); }
  /** A quarantined row the author restates: their claim now, not a read of a message that is gone. */
  async reconfirmMemoryEntry(id: string): Promise<boolean> { return (await decisions()).reconfirmMemoryEntry(this.deps, id, new Date().toISOString()); }
  /** The author overrules the judge's drop. One of the queue's own decisions. */
  async storeDroppedEntry(entryId: string): Promise<boolean> { return (await decisions()).storeDroppedEntry(this.deps, entryId, new Date().toISOString()); }
  async excludeMemoryEntry(id: string): Promise<boolean> { return (await decisions()).discardMemoryRow(this.deps, id); }
  findHeld(candidates: MemoryEntry[]): Promise<HeldContradiction[]> { return findHeldContradictions(this.deps, candidates); }
  hold(held: HeldContradiction[]): ConflictPair[] { return holdMemoryContradictions(this.deps, held); }
  settle(uncertain: UncertainPair[]): void { settleUncertain(this.deps, uncertain); }
}
