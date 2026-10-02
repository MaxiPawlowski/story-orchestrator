// ST's `saveMetadata` swallows its own errors, so "the call returned"
// is not evidence that anything was written. What this module decides is the honest reading of the
// two things that ARE evidence: whether the save request went out and what it answered, and whether
// the metadata the server holds agrees with what this chat believes it wrote.

import type { SaveHealth, SaveOutcome } from "./types";

export const SAVE_PLAYER_TEXT = "changes not saved yet — they go with the next save";

export type { SaveHealth, SaveOutcome };

export const createSaveHealth = (): SaveHealth => ({ lastAppliedBoundary: null, pendingBoundary: null, lastOutcome: null, consecutiveFailures: 0, lastReason: null, lastFailureAt: null });

export function markPending(health: SaveHealth, boundary: number): SaveHealth {
  return { ...health, pendingBoundary: boundary };
}

export function markSettled(health: SaveHealth, boundary: number, outcome: SaveOutcome, reason: string | null, at: string): SaveHealth {
  if (outcome === "applied") {
    return { ...health, lastAppliedBoundary: boundary, pendingBoundary: null, lastOutcome: outcome, consecutiveFailures: 0, lastReason: null };
  }
  return {
    ...health,
    // The pending write is KEPT: the boundary is still unwritten, so the pipeline must keep saying so
    // until something actually lands — clearing it here is how a failed save would look recovered.
    pendingBoundary: health.pendingBoundary ?? boundary,
    lastOutcome: outcome,
    consecutiveFailures: health.consecutiveFailures + 1,
    lastReason: reason,
    lastFailureAt: at,
  };
}

/**
 * The read-back: ST's own view of this chat's metadata against the boundary this chat last confirmed
 * writing. A stored boundary BEHIND what we believe was saved means the write reported success and
 * did not land — the one case a swallow-everything save path cannot tell us about by itself.
 */
export function verifySaved(stored: number | null, health: SaveHealth): SaveOutcome {
  if (stored === null) return "unconfirmed";
  if (health.lastAppliedBoundary === null) return "applied";
  return stored >= health.lastAppliedBoundary ? "applied" : "unconfirmed";
}

export const hasUnsavedChanges = (health: SaveHealth): boolean => health.pendingBoundary !== null;

/**
 * The narrow reading of the same evidence: was the LAST save observed to fail? A request
 * that never went out, one answered outside 2xx, or a read-back that shows the server holding an
 * OLDER boundary is evidence a write was lost. A read-back that could not say anything is NOT — the
 * two are different findings, and a caller that refuses work on "could not confirm" refuses work it
 * simply could not verify (the pipeline's `hasUnsavedChanges` is the sticky reading, and stays one).
 */
export const saveWasLost = (health: SaveHealth): boolean => health.lastOutcome === "unsaved";

export const playerSaveNotice = (health: SaveHealth): string | null => (hasUnsavedChanges(health) && saveWasLost(health) ? SAVE_PLAYER_TEXT : null);
