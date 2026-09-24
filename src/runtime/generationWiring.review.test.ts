/**
 * @jest-environment jsdom
 */
// v2.4 plan 01 T6: the wiring in runtime/index.ts, driven through the REAL startRuntime. Every block
// that belongs to "this reply" (the drafted member's private block, the nudge, the warden note) used
// to be cleared on every GENERATION_ENDED/STOPPED, including a nested quiet run's and another
// extension's `{source}` emit. They now follow the outermost loud generation.

const mockWired = new Map<string, (...args: unknown[]) => unknown>();

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [{}, {}, {}, {}], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [], groups: [] }),
  registerHostMacro: () => {},
  unregisterHostMacro: () => {},
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    if (entries.some((entry) => entry.eventName === "GENERATION_STARTED")) {
      for (const entry of entries) mockWired.set(entry.eventName, entry.handler);
    }
    return () => mockWired.clear();
  },
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
  showTextPopup: async () => undefined,
  noteHostSettingsLoaded: () => {},
}));

import { runtimeManager } from "./runtimeManager";

const emit = async (name: string, ...args: unknown[]) => { await mockWired.get(name)?.(...args); };

describe("runtime/index.ts generation wiring (v2.4 plan 01 T6)", () => {
  let spies: Record<string, jest.SpyInstance>;

  beforeEach(async () => {
    const { startRuntime } = await import("./index");
    startRuntime();
    spies = {
      started: jest.spyOn(runtimeManager, "onGenerationStarted").mockImplementation(() => {}),
      capture: jest.spyOn(runtimeManager, "capturePayload").mockImplementation(() => null as never),
      clear: jest.spyOn(runtimeManager, "clearPrivateInjection").mockImplementation(() => {}),
      nudge: jest.spyOn(runtimeManager, "clearCopilotNudge").mockImplementation(() => {}),
      drafted: jest.spyOn(runtimeManager, "onMemberDrafted").mockImplementation(() => {}),
      commit: jest.spyOn(runtimeManager, "commitContinuityNote").mockImplementation(() => {}),
    };
  });

  afterEach(async () => {
    const { stopRuntime } = await import("./index");
    stopRuntime();
    jest.restoreAllMocks();
  });

  it("a nested quiet run's ENDED re-applies the drafted member's block instead of clearing it; the render closes", async () => {
    await emit("GENERATION_STARTED", "normal", {}, false);
    expect(spies.started).toHaveBeenCalledTimes(1);
    expect(spies.capture).toHaveBeenCalledTimes(1);
    await emit("GROUP_MEMBER_DRAFTED", 2);
    expect(spies.drafted).toHaveBeenCalledTimes(1);
    await emit("GENERATION_STARTED", "quiet", { force_chid: 2 }, false);
    expect(spies.started).toHaveBeenLastCalledWith("quiet");
    expect(spies.capture).toHaveBeenCalledTimes(1);
    await emit("GENERATION_ENDED", 4);
    expect(spies.clear).toHaveBeenCalledTimes(1);
    expect(spies.nudge).not.toHaveBeenCalled();
    expect(spies.commit).not.toHaveBeenCalled();
    expect(spies.drafted).toHaveBeenCalledTimes(2);
    expect(spies.drafted).toHaveBeenLastCalledWith(2);
    expect(spies.clear.mock.invocationCallOrder[0]).toBeLessThan(spies.drafted.mock.invocationCallOrder[1]);
    await emit("MESSAGE_RECEIVED", 4, "normal");
    expect(spies.clear).toHaveBeenCalledTimes(2);
    expect(spies.nudge).toHaveBeenCalledTimes(1);
    expect(spies.commit).toHaveBeenCalledWith(true);
  });

  it("another extension's {source} STARTED/ENDED/STOPPED touch nothing", async () => {
    await emit("GENERATION_STARTED", "normal", {}, false);
    const payload = { source: "guided-generations" };
    await emit("GENERATION_STARTED", payload);
    await emit("GENERATION_ENDED", payload);
    await emit("GENERATION_STOPPED", payload);
    expect(spies.started).toHaveBeenCalledTimes(1);
    expect(spies.clear).not.toHaveBeenCalled();
    expect(spies.commit).not.toHaveBeenCalled();
  });

  it("STOPPED closes the outermost without spending the note", async () => {
    await emit("GENERATION_STARTED", "normal", {}, false);
    await emit("GENERATION_STOPPED");
    expect(spies.clear).toHaveBeenCalledTimes(1);
    expect(spies.commit).toHaveBeenCalledWith(false);
  });
});
