import { SAVE_PLAYER_TEXT, markPending, markSettled, verifySaved, type SaveHealth } from "./saveHealth";

// v2.3 plan 06 (save evidence). One observed save: the request that follows is correlated with its
// HTTP status, and the server's own view of this chat is compared with what the chat believes it
// wrote. It lives here rather than in the manager's persist because that method is the chokepoint
// every coordinator ends at — the budget a second orchestration would spend there is the reason the
// coordinators exist at all.

export interface SaveObservation {
  requested: boolean;
  status: number | null;
  ok: boolean;
  timedOut: boolean;
  /** The request LEFT and never got an answer — a blocked or aborted route, a dead connection. It is
   *  not a timeout (`requested` is true) and it is not a refusal (`status` is null), and the two must
   *  not share a reason: a save reported as "never sent" sends an author looking for a scheduler that
   *  did fire (2026-09-22). */
  failed: boolean;
  /** Why the save does not count for the chat it was asked for (v2.4 plan 02: the open chat changed first). */
  lost?: string;
}

export interface SaveEvidenceDeps {
  /** The health as it stands now, so the observation continues the streak rather than restarting it. */
  health: () => SaveHealth;
  observe: () => Promise<SaveObservation>;
  /** The boundary the server's own copy of this chat holds, or null when it cannot be read. */
  readBack: () => Promise<number | null>;
  onWrite: (health: SaveHealth) => void;
  journal: (summary: string, note: string) => void;
  now: () => string;
}

export interface SaveEvidenceResult {
  health: SaveHealth;
  /** True when the boundary this chat believes it wrote is not what the server holds. */
  unsaved: boolean;
  journalSummary: string | null;
}

/**
 * Observe the write, then READ BACK. The observation answers "did the request reach the server"; the
 * read-back answers "does the server hold what we wrote" — the one a save path that swallows its own
 * errors cannot give, and the one the player-facing line is based on.
 */
export async function recordSaveEvidence(deps: SaveEvidenceDeps, boundary: number): Promise<SaveEvidenceResult> {
  const health = deps.health();
  deps.onWrite(markPending(health, boundary));
  const observation = await deps.observe();
  const reason = observation.ok ? null
    : observation.lost ? observation.lost
    : observation.timedOut ? "no save request went out"
      : observation.failed ? "the save request failed before the server answered"
        : `the server answered ${String(observation.status)}`;
  let settled = markSettled(health, boundary, observation.ok ? "applied" : "unsaved", reason, deps.now());
  let summary: string | null = null;
  if (observation.ok) {
    // The request answered 2xx and the server does not hold what we wrote — either an OLDER boundary
    // (the write reported success and did not land; nothing else in this system can see that) or one
    // this page could not read at all. The two are NOT the same finding, and the journal note is read
    // by an author as evidence, so it may only state what was observed: "could not be read" is not
    // "the server holds an older state" (2026-09-22). Nor is it evidence of a lost write, which is
    // what the outcome carries: `unconfirmed` keeps the player line, `unsaved` says a write is gone.
    const stored = health.lastOutcome === "applied" ? boundary : await deps.readBack();
    if (verifySaved(stored, settled) === "unconfirmed") {
      const unreadable = stored === null;
      settled = markSettled(settled, boundary, unreadable ? "unconfirmed" : "unsaved", unreadable ? "the server's copy of this chat could not be read" : "the server holds an older state", deps.now());
      summary = unreadable ? "save could not be verified by reading the server's copy" : "save reported success but the server holds an older state";
    }
  } else if (reason) {
    summary = "save not confirmed";
  }
  deps.onWrite(settled);
  if (summary) deps.journal(summary, settled.lastReason ?? reason ?? `in memory ${boundary}`);
  return { health: settled, unsaved: settled.pendingBoundary !== null, journalSummary: summary };
}

export { SAVE_PLAYER_TEXT };
