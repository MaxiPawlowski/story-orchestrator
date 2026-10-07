jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: () => ({ chat: [] }),
}));
jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

import { runRollback, type RollbackDeps } from "./rollback";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

type Path = "noop" | "applied" | "unavailable";
type Pause = "stagecraft" | "reapply" | "persist";

const harness = (path: Path, pauseAt: Pause | null) => {
  const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const extras = { memory: { chapters: [] }, extraction: { audits: [] }, judge: { calls: [] }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] } } as unknown as RuntimeExtras;
  const calls: string[] = [];
  const switchChat = () => { context.chatId = "chat-b"; context.sessionEpoch = 2; };
  const step = (name: Pause) => async () => { calls.push(name); if (pauseAt === name) switchChat(); };
  const notices = { lastRollback: null, rollbackUnavailable: null };
  const deps = {
    engine: {
      shouldRollbackFromMessage: () => path === "applied",
      boundaryBeforeMessage: () => (path === "unavailable" ? null : 0),
      historyFrom: () => ({ boundary: 3, messageId: 4 }),
      rollbackTo: () => ({ ok: true, result: "applied" }),
      ensureActiveCheckpoint: () => null,
      activeCheckpoint: { id: "cp1", name: "One" },
      serialize: () => ({ boundary: 7, checkpointStartedMessageId: 0 }),
      clampToChat: () => false,
      discardPendingFrom: () => [],
    },
    journal: { record: () => calls.push("journal"), getRecords: () => [] },
    ownership,
    context: () => ({ lastMessageId: 9, chatLength: 10, journal: { boundary: 1, messageId: 9 } }),
    memory: { rollbackFromMessage: () => calls.push("memory"), updateInjection: () => calls.push("injection") },
    stagecraft: { revertAppliedSince: step("stagecraft") },
    pacing: { replayCommitted: () => calls.push("replay"), updateSteering: () => calls.push("steering") },
    revalidateExpansion: () => undefined,
    restoreExpansion: () => 0,
    extras: () => extras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: step("reapply"),
    persist: step("persist"),
    notify: () => calls.push("notify"),
    notices,
    setStatus: () => calls.push("status"),
    onApplied: () => calls.push("applied"),
  } as unknown as RollbackDeps;
  return { deps, calls, notices };
};

describe("finding 2: a rollback re-checks its chat after every await, so a chat switch mid-rollback writes nothing into the next chat", () => {
  it("noop path: a switch during the curator revert stops before the injection, the save and the notify", async () => {
    const h = harness("noop", "stagecraft");
    expect(await runRollback(h.deps, 5)).toEqual({ ok: true, result: "noop" });
    expect(h.calls).toEqual(["memory", "stagecraft"]);
  });

  it("noop path: a switch during the save stops before the notify", async () => {
    const h = harness("noop", "persist");
    await runRollback(h.deps, 5);
    expect(h.calls).toEqual(["memory", "stagecraft", "injection", "persist"]);
  });

  it("applied path: a switch during the curator revert stops before pacing, the re-apply and the save", async () => {
    const h = harness("applied", "stagecraft");
    expect(await runRollback(h.deps, 5)).toEqual({ ok: true, result: "noop" });
    expect(h.calls).toEqual(["memory", "stagecraft"]);
  });

  it("applied path: a switch during the checkpoint re-apply stops before steering, injection and the save", async () => {
    const h = harness("applied", "reapply");
    await runRollback(h.deps, 5);
    expect(h.calls).toEqual(["memory", "stagecraft", "replay", "reapply"]);
  });

  it("applied path: a switch during the save stops before the notices, the listeners and the notify", async () => {
    const h = harness("applied", "persist");
    await runRollback(h.deps, 5);
    expect(h.calls).toEqual(["memory", "stagecraft", "replay", "reapply", "steering", "injection", "persist"]);
  });

  it("history-unavailable path: a switch during the curator revert sets no notice and saves nothing", async () => {
    const h = harness("unavailable", "stagecraft");
    expect(await runRollback(h.deps, 5)).toEqual({ ok: true, result: "noop" });
    expect(h.calls).toEqual(["memory", "stagecraft"]);
    expect(h.notices.rollbackUnavailable).toBeNull();
  });

  it("history-unavailable path: a switch during the save stops before the notify", async () => {
    const h = harness("unavailable", "persist");
    await runRollback(h.deps, 5);
    expect(h.calls).toEqual(["memory", "stagecraft", "journal", "injection", "persist"]);
  });

  it("controls: with the chat unchanged every path runs to the end", async () => {
    const noop = harness("noop", null);
    await runRollback(noop.deps, 5);
    expect(noop.calls).toEqual(["memory", "stagecraft", "injection", "persist", "notify"]);
    const applied = harness("applied", null);
    expect(await runRollback(applied.deps, 5)).toEqual({ ok: true, result: "applied" });
    expect(applied.calls).toEqual(["memory", "stagecraft", "replay", "reapply", "steering", "injection", "persist", "applied", "notify"]);
    const unavailable = harness("unavailable", null);
    expect(await runRollback(unavailable.deps, 5)).toMatchObject({ ok: false, reason: "history-unavailable" });
    expect(unavailable.calls).toEqual(["memory", "stagecraft", "journal", "injection", "persist", "notify"]);
  });
});
