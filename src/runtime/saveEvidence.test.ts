import { recordSaveEvidence, type SaveEvidenceDeps } from "./saveEvidence";
import { createSaveHealth, hasUnsavedChanges, SAVE_PLAYER_TEXT, saveWasLost, type SaveHealth } from "./saveHealth";

// v2.3 plan 06's named gap: "the blocked-save recovery BY READ-BACK (fault injection still to write)".
// `saveHealth.test.ts` covers the pure transitions; this drives the observation itself against a fake
// host, because the case that matters cannot be produced by a healthy one — a write that answers 2xx
// while the server keeps an OLDER state. Nothing else in the system can see that, which is why the
// read-back exists at all.

const at = "2026-09-22T00:00:00.000Z";

const harness = (options: { ok: boolean; status?: number | null; timedOut?: boolean; failed?: boolean; serverHolds: number | null; start?: SaveHealth }) => {
  const writes: SaveHealth[] = [];
  const journaled: Array<{ summary: string; note: string }> = [];
  let health: SaveHealth = options.start ?? createSaveHealth();
  const deps: SaveEvidenceDeps = {
    health: () => health,
    observe: async () => ({ requested: !options.timedOut, status: options.status ?? (options.ok ? 200 : 500), ok: options.ok, timedOut: options.timedOut ?? false, failed: options.failed ?? false }),
    readBack: () => options.serverHolds,
    onWrite: (next) => { writes.push(next); health = next; },
    journal: (summary, note) => journaled.push({ summary, note }),
    now: () => at,
  };
  return { deps, writes, journaled, health: () => health };
};

describe("the save's own evidence (v2.3 plan 06)", () => {
  it("reports nothing when the request succeeded and the server's copy agrees", async () => {
    const h = harness({ ok: true, serverHolds: 12 });
    const result = await recordSaveEvidence(h.deps, 12);
    expect(result).toMatchObject({ unsaved: false, journalSummary: null });
    expect(h.journaled).toEqual([]);
    // `onWrite` runs twice on purpose: once pending, so a long observation is visible while it
    // happens, and once with the verdict.
    expect(h.writes.map((write) => write.pendingBoundary)).toEqual([12, null]);
    expect(h.health()).toMatchObject({ lastAppliedBoundary: 12, consecutiveFailures: 0, lastReason: null });
  });

  it("catches a 2xx write the server did NOT keep, which nothing else can see", async () => {
    const h = harness({ ok: true, serverHolds: 7 });
    const result = await recordSaveEvidence(h.deps, 12);
    expect(result.unsaved).toBe(true);
    expect(result.journalSummary).toMatch(/reported success but the server holds an older state/);
    expect(h.health()).toMatchObject({ pendingBoundary: 12, lastReason: "the server holds an older state", consecutiveFailures: 1 });
    expect(h.journaled).toHaveLength(1);
  });

  it("keeps the pending boundary and counts the failure when the server refused the write", async () => {
    const h = harness({ ok: false, status: 500, serverHolds: 12 });
    const result = await recordSaveEvidence(h.deps, 12);
    expect(result).toMatchObject({ unsaved: true, journalSummary: "save not confirmed" });
    expect(h.health()).toMatchObject({ pendingBoundary: 12, consecutiveFailures: 1, lastReason: "the server answered 500" });
  });

  it("says so when no save request went out at all (a timeout is not a refusal)", async () => {
    const h = harness({ ok: false, timedOut: true, serverHolds: 12 });
    await recordSaveEvidence(h.deps, 12);
    expect(h.health().lastReason).toMatch(/no save request went out/);
    expect(h.journaled[0].note).toMatch(/no save request went out/);
  });

  // The live recipe blocks the chat-save route, which makes the request THROW inside the page rather
  // than answer — and the observation used to resolve only on a response, so the block read as a save
  // that was never attempted. All three verdicts are `unsaved`; only one of the three reasons is true,
  // and the reason is what an author reads as evidence (2026-09-22).
  it("tells a request that never left apart from one that left and failed", async () => {
    const blocked = harness({ ok: false, failed: true, serverHolds: 12 });
    await recordSaveEvidence(blocked.deps, 12);
    expect(blocked.health()).toMatchObject({ pendingBoundary: 12, lastReason: "the save request failed before the server answered" });
    expect(blocked.health().lastReason).not.toMatch(/no save request went out/);
    expect(saveWasLost(blocked.health())).toBe(true);

    const never = harness({ ok: false, timedOut: true, serverHolds: 12 });
    await recordSaveEvidence(never.deps, 12);
    expect(never.health().lastReason).toMatch(/no save request went out/);
  });

  it("does not report an unreadable server copy as a stale one", async () => {
    // Both are "unconfirmed", and they are different findings. The journal note is read by an author
    // as evidence, so it may only state what was observed.
    const h = harness({ ok: true, serverHolds: null });
    const result = await recordSaveEvidence(h.deps, 12);
    expect(result.unsaved).toBe(true);
    expect(result.journalSummary).toMatch(/could not be verified/);
    expect(h.health().lastReason).toMatch(/could not be read/);
    expect(JSON.stringify(h.journaled)).not.toMatch(/older state/);
  });

  it("forgets the streak once a later write is confirmed, and the player's line goes with it", async () => {
    const failed = harness({ ok: false, status: 500, serverHolds: 12 });
    await recordSaveEvidence(failed.deps, 12);
    expect(failed.health().pendingBoundary).toBe(12);
    // A second, confirming save on the same chat: the recovery path a player is promised.
    const recovered = harness({ ok: true, serverHolds: 18, start: failed.health() });
    const result = await recordSaveEvidence(recovered.deps, 18);
    expect(result.unsaved).toBe(false);
    expect(recovered.health()).toMatchObject({ pendingBoundary: null, consecutiveFailures: 0, lastReason: null });
    // `SAVE_PLAYER_TEXT` is what a player reads while `unsaved` is true; asserting it here keeps the
    // wording next to the condition it belongs to, so one cannot change without the other.
    expect(SAVE_PLAYER_TEXT).toMatch(/changes not saved/i);
  });

  // v2.3 plan 05 (C3). The pipeline's reading is deliberately STICKY — "changes not saved, retrying"
  // stays until something verifies — which is right for a status line and wrong for an author's
  // decision: refusing the decision because the read-back was blind refuses work that in fact landed.
  // So the outcome carries the distinction, and the two readings must not collapse into one.
  it("tells a write that was lost apart from one it merely could not verify", async () => {
    const blind = harness({ ok: true, serverHolds: null });
    await recordSaveEvidence(blind.deps, 12);
    expect(blind.health().lastOutcome).toBe("unconfirmed");
    expect(saveWasLost(blind.health())).toBe(false);
    expect(hasUnsavedChanges(blind.health())).toBe(true);

    const stale = harness({ ok: true, serverHolds: 7 });
    await recordSaveEvidence(stale.deps, 12);
    expect(stale.health().lastOutcome).toBe("unsaved");
    expect(saveWasLost(stale.health())).toBe(true);
    expect(hasUnsavedChanges(stale.health())).toBe(true);

    const refused = harness({ ok: false, status: 503, serverHolds: 12 });
    await recordSaveEvidence(refused.deps, 12);
    expect(refused.health().lastOutcome).toBe("unsaved");
    expect(saveWasLost(refused.health())).toBe(true);

    const absent = harness({ ok: false, timedOut: true, serverHolds: 12 });
    await recordSaveEvidence(absent.deps, 12);
    expect(saveWasLost(absent.health())).toBe(true);

    // And it is not sticky: the next confirmed write clears the verdict the same way it clears the line.
    const recovered = harness({ ok: true, serverHolds: 19, start: stale.health() });
    await recordSaveEvidence(recovered.deps, 19);
    expect(recovered.health().lastOutcome).toBe("applied");
    expect(saveWasLost(recovered.health())).toBe(false);
  });
});
