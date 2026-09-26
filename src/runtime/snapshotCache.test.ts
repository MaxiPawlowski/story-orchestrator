/**
 * @jest-environment jsdom
 */
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  observeSamplerPayloads: () => () => undefined,
  observeWorldInfoScans: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined }),
  loadedEntries: () => [],
  readProfileContextLimit: () => ({ value: 8192, source: "default", reason: "no memory model profile is selected" }),
  countTokens: async (text: string) => Math.ceil(text.length / 4),
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [], groups: [] }),
  registerHostMacro: () => {},
  unregisterHostMacro: () => {},
  subscribeToHostEvents: () => () => {},
  judgeTransport: async () => ({ model: null, answers: null }),
  judgeStatus: async () => null,
  getPlayerName: () => "Max",
  getActiveGroup: () => null,
  getActiveCharacterId: () => null,
  getCharacterNameById: () => null,
  getScannableEntries: async () => [],
  forceActivateEntries: async () => true,
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
  executeSlashCommands: async () => ({ pipe: "" }),
  willAddUserMessage: () => false,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  readPromptBuckets: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: async () => undefined,
}));

import * as builder from "./snapshotBuilder";
import { RuntimeManager } from "./runtimeManager";
import { SnapshotCache } from "./snapshotCache";

const call = { at: "2026-09-26T00:00:00.000Z", boundary: 1, messageId: 1, use: "director", model: "jev", latencyMs: 10, stateChars: 10, questionCount: 1 };

describe("SnapshotCache", () => {
  it("builds once and serves that value until invalidated", () => {
    let n = 0;
    const cache = new SnapshotCache(() => ({ n: ++n }));
    const first = cache.read();
    expect(cache.read()).toBe(first);
    expect(cache.builds).toBe(1);
    cache.invalidate();
    expect(cache.read()).not.toBe(first);
    expect(cache.builds).toBe(2);
  });
});

describe("RuntimeManager snapshot cache", () => {
  afterEach(() => jest.restoreAllMocks());

  it("macros and roots reading the cached snapshot share one build between notifies", () => {
    const manager = new RuntimeManager();
    const build = jest.spyOn(builder, "buildRuntimeSnapshot");
    const first = manager.getCachedSnapshot();
    for (let index = 0; index < 50; index += 1) expect(manager.getCachedSnapshot()).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("control: getSnapshot stays fresh, one build per call", () => {
    const manager = new RuntimeManager();
    const build = jest.spyOn(builder, "buildRuntimeSnapshot");
    manager.getSnapshot();
    manager.getSnapshot();
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("notify invalidates, so the next read is rebuilt", () => {
    const manager = new RuntimeManager();
    const first = manager.getCachedSnapshot();
    manager.notify();
    expect(manager.getCachedSnapshot()).not.toBe(first);
  });

  it("a writer that neither notifies nor persists touches the cache, so its write is visible", () => {
    const manager = new RuntimeManager();
    const before = manager.getCachedSnapshot().judgeMeter.calls;
    manager.recordJudgeCall(call);
    expect(manager.getCachedSnapshot().judgeMeter.calls).toBe(before + 1);
  });

  it("control: without the touch, the cached snapshot would still show the old meter", () => {
    const manager = new RuntimeManager();
    const before = manager.getCachedSnapshot().judgeMeter.calls;
    jest.spyOn(manager, "touch").mockImplementation(() => undefined);
    manager.recordJudgeCall(call);
    expect(manager.getCachedSnapshot().judgeMeter.calls).toBe(before);
    expect(manager.getSnapshot().judgeMeter.calls).toBe(before + 1);
  });
});
