import type { RuntimeExtras } from "./types";
import { runRollback, type RollbackDeps } from "./rollback";

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
  } as unknown as RuntimeExtras;
  extras.extraction.audits = [
    { id: "old", window: { from: 0, to: 2 } },
    { id: "new", window: { from: 0, to: 3 } },
  ] as unknown as RuntimeExtras["extraction"]["audits"];
  const rollbackFromMessage = jest.fn();
  const persist = jest.fn(async () => undefined);
  const notify = jest.fn();
  const dropReadsAfter = jest.fn(async () => undefined);
  const revalidateExpansion = jest.fn();
  const deps = {
    engine: {
      shouldRollbackFromMessage: () => false,
      boundaryBeforeMessage: () => 0,
      serialize: () => ({ boundary: 7 }),
    },
    journal: {},
    context: () => context,
    memory: { rollbackFromMessage, updateInjection: jest.fn() },
    stagecraft: { revertAppliedSince: jest.fn() },
    pacing: { replayCommitted: jest.fn(), updateSteering: jest.fn() },
    revalidateExpansion,
    extras: () => extras,
    refreshRequirements: jest.fn(),
    reapplyCheckpoint: jest.fn(),
    dropReadsAfter,
    persist,
    notify,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: jest.fn(),
    onApplied: jest.fn(),
  } as unknown as RollbackDeps;
  return { deps, extras, rollbackFromMessage, persist, notify, dropReadsAfter, revalidateExpansion };
}

describe("cross-store rollback without an engine transition", () => {
  it("still reverses memory and quarantines extraction at the mutation point", async () => {
    const h = harness();
    await expect(runRollback(h.deps, 3)).resolves.toEqual({ ok: true, result: "noop" });
    expect(h.rollbackFromMessage).toHaveBeenCalledWith(3, 7);
    expect(h.extras.extraction.audits.map((audit) => audit.id)).toEqual(["old"]);
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.dropReadsAfter).toHaveBeenCalledWith(3);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.deps.notices.rollbackUnavailable).toBeNull();
    // The expansion basis is the blackboard the applied path restored; a mutation that never moved
    // the engine leaves it alone, so the no-op must NOT revalidate (it would rebuild the merged story
    // for nothing).
    expect(h.revalidateExpansion).not.toHaveBeenCalled();
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
