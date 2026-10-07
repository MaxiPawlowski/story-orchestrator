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

import { chapterKit } from "./chapterPort";
import { runRollback, type RollbackDeps } from "./rollback";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

const harness = () => {
  const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const chatA = { memory: { chapters: [{ id: "c#1" }] }, extraction: { audits: [] }, judge: { calls: [] }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] } };
  const chatB = { ...chatA, memory: { chapters: [] } };
  let extras = chatA as unknown as RuntimeExtras;
  const calls: string[] = [];
  const deps = {
    engine: {
      shouldRollbackFromMessage: () => false, boundaryBeforeMessage: () => 0, serialize: () => ({ boundary: 7 }), clampToChat: () => false, discardPendingFrom: () => [],
    },
    journal: { record: () => calls.push("journal"), getRecords: () => [] },
    ownership,
    context: () => ({ lastMessageId: 9, chatLength: 10, journal: { boundary: 1, messageId: 9 } }),
    memory: { rollbackFromMessage: () => calls.push("memory"), updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => { calls.push("stagecraft"); } },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined, restoreExpansion: () => 0,
    extras: () => extras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => { calls.push("persist"); },
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  const switchChat = () => { context.chatId = "chat-b"; extras = chatB as unknown as RuntimeExtras; };
  return { deps, calls, switchChat };
};

describe("CR-E7: a rollback that has to load the chapter kit first re-checks the chat it started in", () => {
  it("a chat switch during the kit load writes nothing into the chat that is open afterwards", async () => {
    expect(chapterKit()).toBeNull();
    const h = harness();
    const pending = runRollback(h.deps, 5, { summary: "edited", note: "n" } as never);
    h.switchChat();
    expect(await pending).toEqual({ ok: true, result: "noop" });
    expect(h.calls).toEqual([]);
  });

  it("control: with the chat unchanged the same rollback quarantines and persists, model-call rows included (CR-E14)", async () => {
    const h = harness();
    const extras = h.deps.extras();
    extras.modelCalls = [{ messageId: 3 }, { messageId: 5 }, {}] as RuntimeExtras["modelCalls"];
    await runRollback(h.deps, 5, { summary: "edited", note: "n" } as never);
    expect(h.calls).toEqual(["journal", "memory", "stagecraft", "persist"]);
    expect(extras.modelCalls).toEqual([{ messageId: 3 }, {}]);
  });
});
