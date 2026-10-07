/**
 * @jest-environment jsdom
 */
jest.mock("@services/STAPI", () => ({
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
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [], groups: [] }),
  registerHostMacro: () => undefined,
  unregisterHostMacro: () => undefined,
  startSaveWatcherSurface: () => () => {},
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
  profileExists: () => false,
}));

jest.mock("@services/stHost/context", () => ({ getContext: () => ({ chatId: "chat-a" }) }));
jest.mock("@services/stHost/events", () => ({ subscribeToHostEvent: () => () => undefined }));

import { RUNTIME_GLOBALS, startRuntime, stopRuntime } from "./index";
import { runtimeManager } from "./runtimeManager";
import { debugResponseFor } from "./modelCallCore";
import { callTimeoutMs } from "@extraction/callBudget";

const soGlobals = () => Object.keys(globalThis).filter((name) => name.startsWith("storyOrchestrator") && Reflect.get(globalThis, name) !== undefined).sort();
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe("the one build ships the harness surface (owner decision 2026-10-07, was v2.5 plan 12 D1/D2)", () => {
  afterEach(() => {
    stopRuntime();
    globalThis.storyOrchestratorDebugExtractionResponse = undefined;
    globalThis.storyOrchestratorDebugCallBudgetScale = undefined;
  });

  it("a started runtime exposes the harness handles beside the interceptor", async () => {
    startRuntime();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(soGlobals()).toEqual(expect.arrayContaining(["storyOrchestratorJudge", "storyOrchestratorLiveSuite", "storyOrchestratorLore", "storyOrchestratorScheduler"]));
    expect(typeof globalThis.talkControlInterceptor).toBe("function");
  });

  it("stopping the runtime takes its handles with it", async () => {
    startRuntime();
    await flush();
    expect(globalThis.storyOrchestratorScheduler).toBeDefined();
    stopRuntime();
    expect(soGlobals().filter((name) => (RUNTIME_GLOBALS as readonly string[]).includes(name))).toEqual([]);
  });

  it("a planted debug response and budget scale are read", () => {
    expect(debugResponseFor("read")).toBeNull();
    const unscaled = callTimeoutMs(512);
    globalThis.storyOrchestratorDebugExtractionResponse = "DELTA planted";
    globalThis.storyOrchestratorDebugCallBudgetScale = 0.01;
    expect(debugResponseFor("read")).toBe("DELTA planted");
    expect(callTimeoutMs(512)).toBeLessThan(unscaled);
  });

  it("control: with nothing planted the model call runs for real and the budget is unscaled", () => {
    expect(debugResponseFor("read")).toBeNull();
    expect(callTimeoutMs(512)).toBe(callTimeoutMs(512, 0));
  });

  it("the settings panel still reaches the judge through the manager", async () => {
    startRuntime();
    await flush();
    expect(runtimeManager.getJudge()).not.toBeNull();
  });

  it("the save watcher publishes its refusal ring while it runs, and removes it on stop", () => {
    jest.isolateModules(() => {
      Reflect.deleteProperty(globalThis, "storyOrchestratorSaveRefusals");
      const { startSaveWatcherSurface } = jest.requireActual("@services/stHost/persistence");
      const stop = startSaveWatcherSurface();
      expect(Reflect.has(globalThis, "storyOrchestratorSaveRefusals")).toBe(true);
      stop();
      expect(Reflect.has(globalThis, "storyOrchestratorSaveRefusals")).toBe(false);
    });
  });
});
