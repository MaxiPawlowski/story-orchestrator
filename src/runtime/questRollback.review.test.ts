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

import { StoryEngine, parseStoryV2OrThrow, questClosedKey, questRewardKey } from "@engine/index";
import { runRollback, type RollbackDeps } from "./rollback";
import type { RollbackKind } from "./narrative";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

const story = parseStoryV2OrThrow({
  format: 2, title: "Quest rollback", description: "Synthetic.", roster: [],
  qualities: [{ key: "paid", type: "bool", source: "extractor", rubric: "Was the debt paid?" }, { key: "coins", type: "int", source: "code", rubric: "Coins." }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
  quests: [{ id: "debt", title: "The debt", kind: "side", steps: [], done_when: { all: [{ q: "paid", op: "==", v: true }] }, reward: { set: { coins: { add: 3 } } } }],
});

const harness = () => {
  const engine = new StoryEngine();
  engine.loadStory(story);
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "paid", v: true, source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
  const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const extras = { memory: { chapters: [] }, extraction: { audits: [] }, judge: { calls: [] }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] } };
  const reapplied: number[] = [];
  const deps = {
    engine, ownership,
    journal: { record: () => undefined, getRecords: () => [] },
    context: () => ({ lastMessageId: 3, chatLength: 4, journal: { boundary: 1, messageId: 3 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined, restoreExpansion: () => 0,
    extras: () => extras as unknown as RuntimeExtras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async (messageId: number) => { reapplied.push(messageId); },
    persist: async () => undefined,
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  return { engine, deps, reapplied };
};

describe("a mutation of the message that finished a quest steps the quest back", () => {
  test.each<RollbackKind>(["swipe", "edit", "delete"])("%s: the latch and the reward roll back, and every host write since is undone through one restore", async (kind) => {
    const h = harness();
    expect(h.engine.serialize().blackboard.values[questClosedKey("debt")]).toBe("done");
    const outcome = await runRollback(h.deps, 4, undefined, kind, 1);
    expect(outcome).toMatchObject({ ok: true, result: "applied" });
    const values = h.engine.serialize().blackboard.values;
    expect(values[questClosedKey("debt")]).toBeUndefined();
    expect(values[questRewardKey("debt")]).toBeUndefined();
    expect(values.coins).toBeUndefined();
    expect(h.reapplied).toEqual([4]);
  });

  test("control: a mutation after the completion leaves the quest done and restores nothing", async () => {
    const h = harness();
    const outcome = await runRollback(h.deps, 6, undefined, "edit", 1);
    expect(outcome).toMatchObject({ ok: true, result: "noop" });
    expect(h.engine.serialize().blackboard.values[questClosedKey("debt")]).toBe("done");
    expect(h.reapplied).toEqual([]);
  });
});
