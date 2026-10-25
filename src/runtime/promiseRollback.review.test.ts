import { testOwnership } from "../../test/findings/testOwnership";
import type { RuntimeExtras } from "./types";
import { runRollback, type RollbackDeps } from "./rollback";
import type { PromiseRow } from "@memory/promises/types";

jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

const span = (messageId: number, isUser: boolean) => ({ chatId: "c", messageId, revision: { swipeId: null, hash: "h" }, speaker: isUser ? "Rin" : "Mara", isUser, span: [0, 4] as [number, number] });

const row = (id: string, madeAt: number, keptAt?: number): PromiseRow => ({
  id, promisee: "mara", quote: "I promise", source: span(madeAt, true), madeAt: { boundary: 1 },
  events: keptAt === undefined ? [] : [{ eventId: `${id}-kept`, kind: "kept", quote: "done", source: span(keptAt, false), at: { boundary: 2 } }],
});

function harness(rows: PromiseRow[], engineMoves = false, rolled: "applied" | "noop" = "applied") {
  const extras = { extraction: { audits: [] }, judge: { calls: [], meter: {} }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] }, promises: { rows } } as unknown as RuntimeExtras;
  const deps = {
    ownership: testOwnership(),
    engine: {
      shouldRollbackFromMessage: () => engineMoves, boundaryBeforeMessage: () => 0, serialize: () => ({ boundary: 7, checkpointStartedMessageId: 0 }),
      clampToChat: () => false, discardPendingFrom: () => [], rollbackTo: () => ({ ok: true, result: rolled }), ensureActiveCheckpoint: () => null, activeCheckpoint: null,
    },
    journal: { record: () => undefined },
    context: () => ({ lastMessageId: 9, chatLength: 10, journal: { boundary: 1, messageId: 9 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined, restoreExpansion: () => 0,
    extras: () => extras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  return { deps, extras };
}

describe("plan 47 rollback check: promise writes roll back on every mutation path (SC1 fit)", () => {
  it("a swipe whose only change is a promise write (no engine move) still drops it", async () => {
    const h = harness([row("p1", 2), row("p2", 6)]);
    await runRollback(h.deps, 6);
    expect(h.extras.promises?.rows.map((entry) => entry.id)).toEqual(["p1"]);
  });

  it("a rollback past a closure reopens the promise", async () => {
    const h = harness([row("p1", 2, 8)]);
    await runRollback(h.deps, 8);
    expect(h.extras.promises?.rows[0]?.events).toEqual([]);
  });

  it("the engine-move path drops them the same way", async () => {
    const h = harness([row("p1", 2, 5), row("p2", 6)], true);
    await runRollback(h.deps, 5);
    expect(h.extras.promises?.rows).toEqual([{ ...row("p1", 2) }]);
  });

  it("a delete the engine already stepped back for (a prior delete in the same burst) still drops the kept event", async () => {
    const h = harness([row("p1", 2, 10)], true, "noop");
    await runRollback(h.deps, 10);
    expect(h.extras.promises?.rows[0]?.events).toEqual([]);
  });
});
