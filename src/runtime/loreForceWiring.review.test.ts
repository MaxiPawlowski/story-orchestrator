/**
 * @jest-environment jsdom
 */
// v2.4 plan 05 T12c, measured live (forced-pick case 2, 2026-09-25: a foreign DRY checkWorldInfo at
// GENERATION_AFTER_COMMANDS lost the non-send pick in 4 runs of 4). Every checkWorldInfo ends in
// resetExternalEffects (05-H7), so a force placed at GENERATION_STARTED dies at any dry scan between
// it and the real one. The non-send force now happens in our generate interceptor, which ST runs
// after GAC and never on a dry run (05-H14). MESSAGE_SENT already fires after GAC, so it is unchanged.

const mockWired = new Map<string, (...args: unknown[]) => unknown>();
const mockHost = { addsUserMessage: false };

jest.mock("@services/STAPI", () => ({
  listConnectionProfiles: () => [],
  settingsAreLoaded: () => true,
  observeSamplerPayloads: () => () => undefined,
  installScanGating: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined, scans: () => 0 }),
  onGroupEdited: () => () => undefined,
  installStoryLoreScan: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined }),
  loadScanLorebook: async () => null,
  listGlobalLorebooks: () => [],
  deactivateGlobalLorebook: async () => ({ ok: true, name: "" }),
  observeWorldInfoScans: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined }),
  loadedEntries: () => [],
  readProfileContextLimit: () => ({ value: 8192, source: "default", reason: "no memory model profile is selected" }),
  countTokens: async (text: string) => Math.ceil(text.length / 4),
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ groupId: "g-test", chat: [{}, {}, {}, {}], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [], groups: [] }),
  registerHostMacro: () => {},
  unregisterHostMacro: () => {},
  startSaveWatcherSurface: () => () => {},
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    if (entries.some((entry) => entry.eventName === "GENERATION_STARTED")) {
      for (const entry of entries) mockWired.set(entry.eventName, entry.handler);
    }
    return () => mockWired.clear();
  },
  judgeTransport: async () => ({ model: null, answers: null }),
  judgeStatus: async () => null,
  getPlayerName: () => "Max",
  getActiveGroup: () => ({ id: "g-test", members: [], disabled_members: [] }),
  getActiveCharacterId: () => null,
  getCharacterNameById: () => null,
  getScannableEntries: async () => [],
  forceActivateEntries: async () => true,
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
  executeSlashCommands: async () => ({ pipe: "" }),
  willAddUserMessage: () => mockHost.addsUserMessage,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  readPromptBuckets: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: async () => undefined,
  noteHostSettingsLoaded: () => {},
}));

import { runtimeManager } from "./runtimeManager";
import { TalkController } from "./talkControl";

const emit = async (name: string, ...args: unknown[]) => { await mockWired.get(name)?.(...args); };
const intercept = async (type: string, abort: (immediate: boolean) => void = () => undefined) => {
  await (globalThis.talkControlInterceptor as (chat: unknown[], size: number, abort: (immediate: boolean) => void, type: string) => Promise<void>)([], 8192, abort, type);
};

describe("runtime/index.ts lore force point (v2.4 plan 05 T12c)", () => {
  let select: jest.SpyInstance;

  beforeEach(async () => {
    mockHost.addsUserMessage = false;
    const { startRuntime } = await import("./index");
    startRuntime();
    jest.spyOn(runtimeManager, "onGenerationStarted").mockImplementation(() => {});
    jest.spyOn(runtimeManager, "capturePayload").mockImplementation(() => null as never);
    const selector = globalThis.storyOrchestratorLore!.selector;
    jest.spyOn(selector, "active").mockReturnValue(true);
    select = jest.spyOn(selector, "select").mockResolvedValue(null);
  });

  afterEach(async () => {
    await emit("GENERATION_ENDED");
    const { stopRuntime } = await import("./index");
    stopRuntime();
    jest.restoreAllMocks();
  });

  it("a non-send generation forces from the interceptor, after GAC, not at GENERATION_STARTED", async () => {
    await emit("GENERATION_STARTED", "normal", { force_chid: 2 }, false);
    expect(select).not.toHaveBeenCalled();
    await emit("GENERATION_AFTER_COMMANDS", "normal", { force_chid: 2 }, false);
    expect(select).not.toHaveBeenCalled();
    await intercept("normal");
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("GENERATION_STARTED", "normal");
  });

  it("the send path is unchanged: MESSAGE_SENT forces, the interceptor does not force again", async () => {
    mockHost.addsUserMessage = true;
    await emit("GENERATION_STARTED", "normal", {}, false);
    await emit("MESSAGE_SENT", 5);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("MESSAGE_SENT", undefined);
    await intercept("normal");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("a quiet run's interceptor inside the loud one neither forces nor consumes the loud run's force", async () => {
    await emit("GENERATION_STARTED", "normal", { force_chid: 2 }, false);
    await emit("GENERATION_STARTED", "quiet", { quiet_prompt: "x" }, false);
    await intercept("quiet");
    expect(select).not.toHaveBeenCalled();
    await intercept("normal");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("forces once per generation: a second interceptor call without a new STARTED forces nothing", async () => {
    await emit("GENERATION_STARTED", "normal", { force_chid: 2 }, false);
    await intercept("normal");
    await intercept("normal");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("a generation talk control aborts (another member is drafted instead) forces nothing", async () => {
    jest.spyOn(TalkController.prototype, "intercept").mockImplementation(async (abort) => { abort(true); });
    const abort = jest.fn();
    await emit("GENERATION_STARTED", "normal", {}, false);
    await intercept("normal", abort);
    expect(abort).toHaveBeenCalledWith(true);
    expect(select).not.toHaveBeenCalled();
  });

  it("an arm left by a generation that never reached its interceptor does not force in the next send generation", async () => {
    await emit("GENERATION_STARTED", "normal", { force_chid: 2 }, false);
    mockHost.addsUserMessage = true;
    await emit("GENERATION_STARTED", "normal", {}, false);
    await emit("MESSAGE_SENT", 5);
    await intercept("normal");
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("MESSAGE_SENT", undefined);
  });

  it("control: a dry run arms nothing, so its interceptor-free path never forces", async () => {
    await emit("GENERATION_STARTED", "normal", {}, true);
    await intercept("normal");
    expect(select).not.toHaveBeenCalled();
  });
});
