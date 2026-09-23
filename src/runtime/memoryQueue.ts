import { addMemoryEntries, CONFLICT_LIMIT, conflictWindowOf, detectConflicts, markConflicted, provenance, resolveConflict, withOverride, type ConflictPair, type ConflictWindow, type LedgerBinding, type SceneConflictValue } from "@memory/index";
import type { Provenance, Provenanced } from "@memory/provenance";
import type { MemoryRuntimeState } from "./types";

// v2.3 plan 05 (C3). The reconciliation queue: what two stores disagree about, held until the author
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
  updateInjection: () => void;
  /** A disagreement changes what a later canon synthesis would have been built from, so resolving
   *  one marks the canon stale rather than leaving text derived from a losing claim in play. */
  invalidateCanon?: () => void;
  /** Read the span a conflict came from again, rather than whatever the transcript now ends with. */
  reread?: (window: ConflictWindow, reason: string) => Promise<unknown>;
  /** v2.3 plan 05: whether the last save is still unwritten — the plan-06 save evidence, the same
   *  seam `EffectsApplier.withLedger` refuses an effect on. It is the ONE signal that answers "did
   *  this decision reach the chat's stored state": `save()` resolves either way, because ST's
   *  `saveMetadata` catches its own errors (script.js:9412) and `persist` returns rather than throws. */
  unsaved?: () => boolean;
  save: () => Promise<void>;
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
export function boundValuesFor(bindings: LedgerBinding[], values: Record<string, unknown>, versions: Record<string, number> = {}): Record<string, { entity: string; field: string; value: string; provenance?: Provenance }> {
  const bound: Record<string, { entity: string; field: string; value: string; provenance?: Provenance }> = {};
  for (const binding of bindings) {
    const value = values[binding.qualityKey];
    if (value === undefined || value === null) continue;
    bound[binding.qualityKey] = {
      entity: binding.entity,
      field: binding.field,
      value: String(value),
      provenance: provenance({ source: "blackboard", messageId: -1, boundary: 0, pass: "blackboard", sourceRevision: versions[binding.qualityKey], inputs: [{ store: "blackboard", id: binding.qualityKey }] }),
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
  const memoryIds = queued.flatMap((pair) => pair.sides.filter((side) => side.store === "memory").map((side) => side.id));
  const ledgerIds = queued.flatMap((pair) => pair.sides.filter((side) => side.store === "ledger" && !side.id.startsWith("bound:")).map((side) => side.id));
  const entries = markConflicted(state.entries, memoryIds, (entry) => entry.id);
  const ledger = markConflicted(state.ledger, ledgerIds, (row) => row.id);
  const changed = fresh.length > 0 || entries !== state.entries || ledger !== state.ledger;
  if (changed) deps.patch({ conflicts: queued, entries, ledger }, false);
  return queued;
}

/** Both sides were conflicted; neither may steer until the author says which one is true. */
function unmark<T extends Provenanced>(rows: T[], ids: Set<string>, idOf: (row: T) => string): T[] {
  return rows.map((row) => (ids.has(idOf(row)) && row.provenance?.validity === "conflicted" ? { ...row, provenance: { ...row.provenance, validity: "live" as const } } : row));
}

/**
 * Every decision below is ONE event: applied in memory, then written to the chat. The applied half is
 * immediate and the written half is not, and ST's save path reports neither — `saveMetadata` catches
 * its own errors (script.js:9412) and `persist` returns early rather than throwing — so an awaited
 * `save()` resolves whether or not anything landed, and a `catch` around it is unreachable for the
 * failure it names. The signal that IS evidence is the plan-06 save evidence, read through `unsaved`.
 *
 * A decision that did not land is put back. The alternative is the shape this whole guard exists for:
 * a session that has retired a claim it will not remember retiring, a drawer that shows the pair
 * settled, and a next pass that rebuilds the pair from the stored state and asks again.
 *
 * `restore` names exactly the keys this decision patched — including the canon when the caller's
 * `before` invalidates it — so putting one back cannot undo an unrelated write.
 */
async function commitDecision(deps: MemoryQueueDeps, next: Partial<MemoryRuntimeState>, restore: Partial<MemoryRuntimeState>, before?: () => void): Promise<boolean> {
  deps.patch(next, false);
  before?.();
  deps.updateInjection();
  let failure: unknown = null;
  let landed = true;
  try {
    await deps.save();
  } catch (error) {
    failure = error;
    landed = false;
  }
  if (landed && deps.unsaved?.()) landed = false;
  if (landed) return true;
  console.warn("[Story Orchestrator] the author's decision did not reach the chat's stored state; putting it back", failure ?? "");
  deps.patch(restore, false);
  deps.updateInjection();
  return false;
}

/** The author leaves the disagreement standing but stops being asked about it. This is the one
 *  queue action that puts both rows back in play, so the copy says so: a dismissed pair is live
 *  again, and the next pass will not re-queue the same key. */
export async function dismissMemoryConflict(deps: MemoryQueueDeps, key: string): Promise<boolean> {
  const state = deps.getMemory();
  const pair = state.conflicts.find((candidate) => candidate.key === key);
  if (!pair) return false;
  const ids = new Set(pair.sides.map((side) => side.id));
  return commitDecision(deps, {
    entries: unmark(state.entries, ids, (entry) => entry.id),
    ledger: unmark(state.ledger, ids, (row) => row.id),
    conflicts: state.conflicts.filter((candidate) => candidate.key !== key),
    resolvedConflicts: [...state.resolvedConflicts, key].slice(-CONFLICT_LIMIT),
  }, { entries: state.entries, ledger: state.ledger, conflicts: state.conflicts, resolvedConflicts: state.resolvedConflicts });
}

/** The author keeps one side. The key is remembered as decided so the next pass does not re-queue
 *  it, and both rows carry the override so a later reader can see that a human chose.
 *
 *  `lock` is applied in the same patch as the resolution: "Lock as canon" is one decision, and two
 *  awaited calls would be able to leave the pair resolved with an unlocked winner if the second one
 *  never ran. The write is the other half of that same decision (`commitDecision`). */
export async function resolveMemoryConflict(deps: MemoryQueueDeps, key: string, keepId: string, lock = false): Promise<boolean> {
  const state = deps.getMemory();
  const pair = state.conflicts.find((candidate) => candidate.key === key);
  if (!pair) return false;
  const dropped = pair.sides.find((side) => side.id !== keepId);
  const boundary = deps.boundaryStamp();
  const at = new Date().toISOString();
  const lockMemory = lock && !keepId.startsWith("bound:");
  // Keeping the blackboard side is a decision about the ledger row that disagreed with it: the row is
  // superseded by the bound key rather than merged, so the blackboard stays the single writer.
  const entries = keepMemoryAdjustment(state, keepId, dropped?.id, at, boundary, lockMemory);
  return commitDecision(deps, {
    entries,
    ledger: state.ledger.map((row) => (dropped && row.id === dropped.id ? { ...row, ...withOverride(row, "reconciled", at, boundary) } : row)),
    conflicts: state.conflicts.filter((candidate) => candidate.key !== key),
    resolvedConflicts: [...state.resolvedConflicts, key].slice(-CONFLICT_LIMIT),
  }, { entries: state.entries, ledger: state.ledger, conflicts: state.conflicts, resolvedConflicts: state.resolvedConflicts, canon: state.canon }, () => deps.invalidateCanon?.());
}

// The author's decision, applied to the memory store when the side they kept is a FACT. Keeping the
// blackboard side instead supersedes the ledger row that disagreed with it (done by the caller) and
// leaves the fact alone, because the blackboard is the single writer of a bound field.
function keepMemoryAdjustment(state: MemoryRuntimeState, keepId: string, droppedId: string | undefined, at: string, boundary: number, lock: boolean) {
  if (keepId.startsWith("bound:")) return state.entries;
  return resolveConflict(state.entries, { keep: keepId, drop: droppedId && !droppedId.startsWith("bound:") ? droppedId : keepId, at, boundary, lock });
}

/** The span the conflict's claims came from, so the re-read asks about those messages instead of
 *  once more reading whatever the transcript now ends with. A conflict whose sides name no message
 *  has no span to ask about, and the caller's read falls back to the newest window.
 *
 *  The read's own verdict is the answer: `runNow` returns `false` when it cannot read at all, and a
 *  re-read that did nothing must not be reported as one that happened. */
export async function rereadConflictWindow(deps: MemoryQueueDeps, key: string): Promise<boolean> {
  if (!deps.reread) return false;
  const asked = deps.reread(conflictWindowOf(deps.getMemory().conflicts, key) ?? { from: -1, to: -1 }, "conflict-reread");
  return (await asked) !== false;
}

// --- the other author decisions about a memory row (v2.3 plan 05) --------------------------
//
// "Store anyway", "reconfirm" and "lock" are the same conversation as the queue — a human saying a
// claim is true — so they live here rather than spending the coordinator's line budget on three
// one-line patch shapes.

/** The author overrules the judge's drop. This is an override, not a re-read: the row says a human
 *  decided it, so no later pass treats it as an extractor claim it may supersede. */
export async function storeDroppedEntry(deps: MemoryQueueDeps, entryId: string, at: string): Promise<boolean> {
  const state = deps.getMemory();
  const drop = state.verifyDrops.find((item) => item.entry.id === entryId);
  if (!drop) return false;
  const kept = { ...drop.entry, confidence: drop.p, ...withOverride(drop.entry, "verify-drop", at, deps.boundaryStamp()) };
  const written = addMemoryEntries({ ...state, writeLog: [] }, [kept], { from: drop.entry.messageId ?? 0, to: drop.entry.messageId ?? 0 });
  return commitDecision(deps, { verifyDrops: state.verifyDrops.filter((item) => item !== drop), entries: written.state.entries }, { verifyDrops: state.verifyDrops, entries: state.entries });
}

/** A quarantined row the author restates: their claim now, not a read of a message that is gone.
 *  It is ONE decision across both stores that hold knowledge: a private epistemic row quarantined by
 *  a rollback is the same conversation as a public fact, and `activeEpistemic` promised the author
 *  could reconfirm it — which nothing did until 2026-09-22, so a rolled-back `[hiding]` fact was
 *  gone for good and the promise lived only in a comment. */
export async function reconfirmMemoryEntry(deps: MemoryQueueDeps, id: string, at: string): Promise<boolean> {
  const state = deps.getMemory();
  const boundary = deps.boundaryStamp();
  if (state.entries.some((entry) => entry.id === id)) {
    return commitDecision(deps, { entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...withOverride(entry, "reconfirm", at, boundary) } : entry)) }, { entries: state.entries });
  }
  if (state.epistemic.some((entry) => entry.id === id)) {
    return commitDecision(deps, { epistemic: state.epistemic.map((entry) => (entry.id === id ? { ...entry, ...withOverride(entry, "reconfirm", at, boundary) } : entry)) }, { epistemic: state.epistemic });
  }
  if (state.ledger.some((entry) => entry.id === id)) {
    return commitDecision(deps, { ledger: state.ledger.map((entry) => (entry.id === id ? { ...entry, ...withOverride(entry, "reconfirm", at, boundary) } : entry)) }, { ledger: state.ledger });
  }
  return false;
}
