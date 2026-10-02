import { playerSaveNotice, SAVE_PLAYER_TEXT, createSaveHealth, hasUnsavedChanges, markPending, markSettled, saveWasLost, verifySaved } from "./saveHealth";

// v2.3 plan 06 (save evidence). `saveMetadata` catches its own errors and returns normally, so the
// only honest evidence is the request's own outcome and what the server holds afterwards. These are
// the cases that decide whether a player is told "not saved".

describe("save health", () => {
  const at = "2026-09-22T00:00:00.000Z";

  it("clears the pending boundary when a save is observed to land", () => {
    const pending = markPending(createSaveHealth(), 7);
    expect(hasUnsavedChanges(pending)).toBe(true);
    const settled = markSettled(pending, 7, "applied", null, at);
    expect(settled.pendingBoundary).toBeNull();
    expect(settled.lastAppliedBoundary).toBe(7);
    expect(hasUnsavedChanges(settled)).toBe(false);
  });

  // The important case: a write that did NOT land must keep saying so. Clearing the pending boundary
  // on a failure is how "changes not saved" would look recovered after one failed attempt.
  it("keeps the pending boundary and counts the failure when a save does not land", () => {
    const pending = markPending(createSaveHealth(), 9);
    const failed = markSettled(pending, 9, "unconfirmed", "no request went out", at);
    expect(failed.pendingBoundary).toBe(9);
    expect(failed.consecutiveFailures).toBe(1);
    expect(failed.lastReason).toBe("no request went out");
    expect(hasUnsavedChanges(failed)).toBe(true);

    const again = markSettled(failed, 9, "unconfirmed", "503", at);
    expect(again.consecutiveFailures).toBe(2);
    expect(again.pendingBoundary).toBe(9);
  });

  it("forgets the streak once a later save lands", () => {
    const failed = markSettled(markPending(createSaveHealth(), 4), 4, "unconfirmed", "offline", at);
    const recovered = markSettled(failed, 4, "applied", null, at);
    expect(recovered.consecutiveFailures).toBe(0);
    expect(recovered.lastReason).toBeNull();
  });

  // v2.3 plan 05 (C3). Two readings of one streak: the pipeline's line stays up until something
  // verifies (sticky, right for a status), while a caller that must decide whether to REFUSE work can
  // only act on the one that is evidence. `unsaved` is that one; `unconfirmed` is not.
  it("records the verdict, and only `unsaved` counts as a lost write", () => {
    expect(saveWasLost(createSaveHealth())).toBe(false);
    expect(saveWasLost(markSettled(markPending(createSaveHealth(), 4), 4, "applied", null, at))).toBe(false);
    expect(saveWasLost(markSettled(markPending(createSaveHealth(), 4), 4, "unconfirmed", "the server's copy of this chat could not be read", at))).toBe(false);
    const lost = markSettled(markPending(createSaveHealth(), 4), 4, "unsaved", "the server answered 503", at);
    expect(saveWasLost(lost)).toBe(true);
    // Both keep the pending boundary and count the failure: the distinction does not weaken the line.
    expect(hasUnsavedChanges(lost)).toBe(true);
    expect(lost.consecutiveFailures).toBe(1);
  });
});

describe("read-back", () => {
  it("says unconfirmed when the server holds nothing for this chat", () => {
    expect(verifySaved(null, createSaveHealth())).toBe("unconfirmed");
  });

  it("says applied while the stored boundary is at or ahead of what we confirmed writing", () => {
    const health = { ...markPending(createSaveHealth(), 5), lastAppliedBoundary: 5 };
    expect(verifySaved(5, health)).toBe("applied");
    expect(verifySaved(6, health)).toBe("applied");
  });

  // The case a swallow-everything save path cannot report by itself: the call returned, the server
  // holds an OLDER boundary, so the write reported success and did not land.
  it("says unconfirmed when the server holds a boundary BEHIND what we believe we wrote", () => {
    const health = { ...markPending(createSaveHealth(), 5), lastAppliedBoundary: 5 };
    expect(verifySaved(3, health)).toBe("unconfirmed");
  });

  it("has nothing to verify before the first confirmed write", () => {
    expect(verifySaved(0, createSaveHealth())).toBe("applied");
  });
});

describe("T3-4: the player is told only of a lost save", () => {
  const at = "2026-10-02T02:45:49.309Z";
  it("a save in flight, or one the read-back could not confirm, says nothing to the player", () => {
    expect(playerSaveNotice(markPending(createSaveHealth(), 30))).toBeNull();
    expect(playerSaveNotice(markSettled(markPending(createSaveHealth(), 30), 30, "unconfirmed", "the server's copy of this chat could not be read", at))).toBeNull();
  });
  it("a lost write keeps the player line until a save lands", () => {
    const lost = markSettled(markPending(createSaveHealth(), 30), 30, "unsaved", "no save request went out", at);
    expect(playerSaveNotice(lost)).toBe(SAVE_PLAYER_TEXT);
    expect(playerSaveNotice(markSettled(lost, 30, "applied", null, at))).toBeNull();
  });
});
