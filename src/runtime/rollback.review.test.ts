import type { RuntimeExtras } from "./types";
import { runRollback, type RollbackDeps } from "./rollback";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { finding, must } from "../../test/findings/ledger";

// `@judge` reaches the host module graph through its client, which is a top-level-await import jest
// cannot parse. This path only needs the ring-trimming helper.
jest.mock("@judge/index", () => ({
  dropJudgeCallsAfter: (judge: unknown) => judge,
}));
jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

// v2.3 plan 04. A memory pass can write against a message without a gate firing. The engine's
// rollback predicate then says "nothing to restore", but that must not mean "leave every other
// store alone" — the live M3/M4 gate found exactly this after the pure helpers had gone green.

const context = { lastMessageId: 4, chatLength: 5, journal: { boundary: 1, messageId: 4 } };

function harness() {
  // Only the slices this path touches. `createExtras` reaches the host module graph, which is a
  // top-level-await import jest cannot parse.
  const extras = {
    extraction: { audits: [] as Array<{ id: string; window: { from: number; to: number } }> },
    judge: { calls: [], scene: null },
    lore: { fired: [{ messageId: 2, entries: [] }, { messageId: 3, entries: [] }] },
    tension: { levels: [], smoothed: null, history: [{ messageId: 2, level: "calm", smoothed: 0.1 }, { messageId: 4, level: "tense", smoothed: 0.5 }] },
  } as unknown as RuntimeExtras;
  extras.extraction.audits = [
    { id: "old", window: { from: 0, to: 2 } },
    { id: "new", window: { from: 0, to: 3 } },
  ] as unknown as RuntimeExtras["extraction"]["audits"];
  const rollbackFromMessage = jest.fn();
  const persist = jest.fn(async () => undefined);
  const notify = jest.fn();
  const revalidateExpansion = jest.fn();
  const deps = {
    engine: {
      shouldRollbackFromMessage: () => false,
      boundaryBeforeMessage: () => 0,
      serialize: () => ({ boundary: 7 }),
      clampToChat: () => false,
      discardPendingFrom: jest.fn(() => []),
      ensureActiveCheckpoint: () => null,
    },
    journal: {},
    context: () => context,
    memory: { rollbackFromMessage, updateInjection: jest.fn() },
    stagecraft: { revertAppliedSince: jest.fn() },
    pacing: { replayCommitted: jest.fn(), updateSteering: jest.fn() },
    revalidateExpansion,
    restoreExpansion: jest.fn(() => 0),
    extras: () => extras,
    refreshRequirements: jest.fn(),
    reapplyCheckpoint: jest.fn(),
    persist,
    notify,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: jest.fn(),
    onApplied: jest.fn(),
  } as unknown as RollbackDeps;
  return { deps, extras, rollbackFromMessage, persist, notify, revalidateExpansion };
}

describe("cross-store rollback without an engine transition", () => {
  it("still reverses memory and quarantines extraction at the mutation point", async () => {
    const h = harness();
    await expect(runRollback(h.deps, 3)).resolves.toEqual({ ok: true, result: "noop" });
    expect(h.rollbackFromMessage).toHaveBeenCalledWith(3, 7);
    expect(h.extras.extraction.audits.map((audit) => audit.id)).toEqual(["old"]);
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.deps.notices.rollbackUnavailable).toBeNull();
    // The expansion basis is the blackboard the applied path restored; a mutation that never moved
    // the engine leaves it alone, so the no-op must NOT revalidate (it would rebuild the merged story
    // for nothing).
    expect(h.revalidateExpansion).not.toHaveBeenCalled();
  });

  it("drops the persisted lore activations and tension history of the mutated message and later (v2.6 plan 08)", async () => {
    const h = harness();
    await runRollback(h.deps, 3);
    expect(h.extras.lore.fired.map((record) => record.messageId)).toEqual([2]);
    expect(h.extras.tension.history.map((row) => row.messageId)).toEqual([2]);
  });

  it("drops queued writes whose read reached the mutation, on the path that restores nothing (v2.4 plan 01 T1 live)", async () => {
    const h = harness();
    await runRollback(h.deps, 3);
    expect((h.deps.engine as unknown as { discardPendingFrom: jest.Mock }).discardPendingFrom).toHaveBeenCalledWith(3);
  });

  it("reports an edit past the retained history even when the engine never acted on it", async () => {
    // E1 does not depend on the engine having a transition to restore: the history that would reach
    // the edit is gone, and that is what the player has to be told (found live, J6.9).
    const h = harness();
    (h.deps.engine as unknown as { boundaryBeforeMessage: () => null }).boundaryBeforeMessage = () => null;
    (h.deps.engine as unknown as { historyFrom: () => { boundary: number; messageId: number } }).historyFrom = () => ({ boundary: 6, messageId: 11 });
    (h.deps.journal as unknown as { record: () => void }).record = jest.fn();
    await expect(runRollback(h.deps, 0)).resolves.toEqual({ ok: false, reason: "history-unavailable", oldest: { boundary: 6, messageId: 11 } });
    expect(h.deps.notices.rollbackUnavailable).toMatchObject({ messageId: 0, oldest: { boundary: 6, messageId: 11 } });
    expect(h.rollbackFromMessage).toHaveBeenCalledWith(0, 7);
  });
});

describe("V4: a mutation with no message id", () => {
  it("rewinds nothing, even where the engine would read the id as 'from the start'", async () => {
    const h = harness();
    const rollbackTo = jest.fn();
    Object.assign(h.deps.engine, { shouldRollbackFromMessage: () => true, rollbackTo });
    await expect(runRollback(h.deps, Number.NaN)).resolves.toEqual({ ok: true, result: "noop" });
    expect(rollbackTo).not.toHaveBeenCalled();
    expect(h.rollbackFromMessage).not.toHaveBeenCalled();
    expect(h.extras.extraction.audits).toHaveLength(2);
  });
});

describe("V11: an engine that cannot restore is never answered with silence", () => {
  it("a boundary whose snapshot is gone gets the E1 notice, a journal line, the quarantine and the stagecraft revert", async () => {
    const h = harness();
    const record = jest.fn();
    const revertAppliedSince = jest.fn();
    Object.assign(h.deps.engine, { boundaryBeforeMessage: () => 3, shouldRollbackFromMessage: () => true, rollbackTo: () => ({ ok: false, reason: "history-unavailable", oldest: { boundary: 5, messageId: 9 } }), activeCheckpoint: { name: "The Gate" } });
    Object.assign(h.deps.journal, { record });
    Object.assign(h.deps.stagecraft, { revertAppliedSince });
    await expect(runRollback(h.deps, 3)).resolves.toEqual({ ok: false, reason: "history-unavailable", oldest: { boundary: 5, messageId: 9 } });
    expect(h.deps.notices.rollbackUnavailable).toMatchObject({ messageId: 3, checkpointName: "The Gate", oldest: { boundary: 5, messageId: 9 } });
    expect(record).toHaveBeenCalledWith("story", "edit past the retained history", expect.anything(), expect.stringContaining("message 3"));
    expect(h.rollbackFromMessage).toHaveBeenCalledWith(3, 7);
    expect(revertAppliedSince).toHaveBeenCalledWith(3);
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("an edit the engine had nothing to roll back for still reverts the curator writes made from it", async () => {
    const h = harness();
    const revertAppliedSince = jest.fn();
    Object.assign(h.deps.stagecraft, { revertAppliedSince });
    await runRollback(h.deps, 3);
    expect(revertAppliedSince).toHaveBeenCalledWith(3);
    expect(h.revalidateExpansion).not.toHaveBeenCalled();
  });
});

describe("E1, asserted on the runtime and not on an object the test built", () => {
  const stationary = () => parseStoryV2OrThrow({
    format: 2, id: "history-review", title: "History review", description: "Long-running rollback fixture",
    qualities: [{ key: "counter", type: "int", source: "extractor", rubric: "Latest counter?" }],
    checkpoints: [{ id: "start", name: "Start", objective: "Wait", type: "anchor", start: true }],
    transitions: [], roster: [],
  });
  const longHistory = () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(stationary());
    for (let i = 0; i < 205; i += 1) {
      engine.enqueue({ source: "extractor", blackboardVersionSum: i, turnRange: { from: i, to: i }, deltas: [{ q: "counter", v: i, source: "extractor" }] });
      engine.commitBoundary({ lastMessageId: i, chatLength: i + 1 });
    }
    return engine;
  };

  finding("E1", async () => {
    const h = harness();
    const record = jest.fn();
    Object.assign(h.deps, { engine: longHistory() });
    Object.assign(h.deps.journal, { record });
    const outcome = await runRollback(h.deps, 0);
    must(
      !outcome.ok && outcome.reason === "history-unavailable",
      `an edit past the retained history returned ${JSON.stringify(outcome)} instead of an explicit history-unavailable outcome, so the caller cannot tell "nothing to undo" from "the history is gone" and the player is told nothing`,
    );
    must(h.deps.notices.rollbackUnavailable?.messageId === 0, "the rollback reported history-unavailable but set no notice, so the player is told nothing");
    must(record.mock.calls.some((call) => call[1] === "edit past the retained history"), "the unavailable rollback left no journal line, so the author cannot see why the story did not move");
    must(h.rollbackFromMessage.mock.calls.length === 1, "what the edit invalidated was kept in memory");
  });
});

describe("v2.4 plan 02 §10: every runRollback leaves its outcome on the notices", () => {
  it("records noop, history-unavailable and a missing id in order, each with a rising seq", async () => {
    const h = harness();
    await runRollback(h.deps, 3);
    expect(h.deps.notices.lastOutcome).toMatchObject({ seq: 1, result: "noop", fromMessage: 3 });
    (h.deps.engine as unknown as { boundaryBeforeMessage: () => null }).boundaryBeforeMessage = () => null;
    (h.deps.engine as unknown as { historyFrom: () => { boundary: number; messageId: number } }).historyFrom = () => ({ boundary: 6, messageId: 11 });
    (h.deps.journal as unknown as { record: () => void }).record = jest.fn();
    await runRollback(h.deps, 1);
    expect(h.deps.notices.lastOutcome).toMatchObject({ seq: 2, result: "history-unavailable", fromMessage: 1, reason: "oldest restorable boundary 6 (message 11)" });
    await runRollback(h.deps, Number.NaN);
    expect(h.deps.notices.lastOutcome).toMatchObject({ seq: 3, result: "noop", fromMessage: null, reason: "no usable message id" });
  });

  it("records an applied rollback with the message it started from", async () => {
    const h = harness();
    Object.assign(h.deps.engine, { shouldRollbackFromMessage: () => true, rollbackTo: () => ({ ok: true, result: "applied" }), activeCheckpoint: { name: "The Gate" } });
    await expect(runRollback(h.deps, 2)).resolves.toEqual({ ok: true, result: "applied" });
    expect(h.deps.notices.lastOutcome).toMatchObject({ seq: 1, result: "applied", fromMessage: 2 });
    expect(h.deps.notices.lastOutcome).not.toHaveProperty("reason");
  });
});

describe("T0 finding 5: the step-back notice is about a step back, and names its cause", () => {
  const applied = (before: string, after: string) => {
    const h = harness();
    const engine = h.deps.engine as unknown as Record<string, unknown>;
    let active = { id: before, name: before, player_name: `The ${before}` };
    Object.assign(engine, {
      shouldRollbackFromMessage: () => true,
      rollbackTo: () => { active = { id: after, name: after, player_name: `The ${after}` }; return { ok: true, result: "applied" }; },
      serialize: () => ({ boundary: 7, checkpointStartedMessageId: 0 }),
    });
    Object.defineProperty(engine, "activeCheckpoint", { get: () => active });
    return h;
  };

  it("records the mutation kind on the notice", async () => {
    const h = applied("road", "hall");
    await runRollback(h.deps, 3, undefined, "swipe");
    expect(h.deps.notices.lastRollback).toMatchObject({ playerName: "The hall", kind: "swipe" });
  });

  it("raises no notice when the rollback left the checkpoint where it was", async () => {
    const h = applied("hall", "hall");
    await runRollback(h.deps, 3, undefined, "delete");
    expect(h.deps.notices.lastRollback).toBeNull();
  });
});
