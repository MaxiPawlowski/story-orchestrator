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

import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { runRollback, type RollbackDeps } from "./rollback";
import type { RollbackKind } from "./narrative";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

const story = parseStoryV2OrThrow({
  format: 2, title: "Living rollback", description: "Synthetic.", roster: [],
  qualities: [{ key: "seen", type: "bool", source: "extractor", rubric: "Was it seen?" }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
});

const harness = (opBoundaries: number[], wired = true) => {
  const engine = new StoryEngine();
  engine.loadStory(story);
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
  const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const extras = { memory: { chapters: [] }, extraction: { audits: [] }, judge: { calls: [] }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] } };
  const restored: number[] = [];
  const deps = {
    engine, ownership,
    journal: { record: () => undefined, getRecords: () => [] },
    context: () => ({ lastMessageId: 3, chatLength: 4, journal: { boundary: 1, messageId: 3 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined, restoreExpansion: () => 0,
    restoreLiving: (boundary: number) => { restored.push(boundary); },
    ...(wired ? { livingMovedAfter: (boundary: number) => opBoundaries.some((op) => op > boundary) } : {}),
    extras: () => extras as unknown as RuntimeExtras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  return { engine, deps, restored };
};

describe("a mutation of the reply whose boundary applied a living director change undoes the change, though no transition fired", () => {
  test.each<RollbackKind>(["swipe", "edit", "delete"])("%s: the engine steps back and the living ops after that boundary are dropped", async (kind) => {
    const h = harness([2]);
    const outcome = await runRollback(h.deps, 4, undefined, kind, 1);
    expect(outcome).toMatchObject({ ok: true, result: "applied" });
    expect(h.engine.serialize().boundary).toBe(1);
    expect(h.restored).toEqual([1]);
  });

  test("negative control: without the living check the same swipe is a noop and the branch stays", async () => {
    const h = harness([2], false);
    const outcome = await runRollback(h.deps, 4, undefined, "swipe", 1);
    expect(outcome).toMatchObject({ ok: true, result: "noop" });
    expect(h.restored).toEqual([]);
  });

  test("control: a living op at or before the restored boundary leaves the mutation a noop", async () => {
    const h = harness([1]);
    const outcome = await runRollback(h.deps, 4, undefined, "swipe", 1);
    expect(outcome).toMatchObject({ ok: true, result: "noop" });
    expect(h.engine.serialize().boundary).toBe(2);
    expect(h.restored).toEqual([]);
  });
});
