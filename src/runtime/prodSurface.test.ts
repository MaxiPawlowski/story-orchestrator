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
  registerHostMacro: () => undefined,
  unregisterHostMacro: () => undefined,
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

import { startRuntime, stopRuntime } from "./index";
import { runtimeManager } from "./runtimeManager";
import { debugResponseFor } from "./modelCallCore";
import { callTimeoutMs } from "@extraction/callBudget";

const soGlobals = () => Object.keys(globalThis).filter((name) => name.startsWith("storyOrchestrator") && Reflect.get(globalThis, name) !== undefined).sort();
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe("the prod flavour exposes no debug surface (v2.5 plan 12 D1/D2)", () => {
  afterEach(() => {
    stopRuntime();
    globalThis.__SO_DEV__ = true;
    globalThis.storyOrchestratorDebugExtractionResponse = undefined;
    globalThis.storyOrchestratorDebugCallBudgetScale = undefined;
  });

  it("prod: a started runtime holds no storyOrchestrator global, only the interceptor", async () => {
    globalThis.__SO_DEV__ = false;
    startRuntime();
    await flush();
    expect(soGlobals()).toEqual([]);
    expect(typeof globalThis.talkControlInterceptor).toBe("function");
  });

  it("control: the dev flavour exposes the harness handles", async () => {
    globalThis.__SO_DEV__ = true;
    startRuntime();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(soGlobals()).toEqual(expect.arrayContaining(["storyOrchestratorJudge", "storyOrchestratorLiveSuite", "storyOrchestratorLore", "storyOrchestratorScheduler"]));
  });

  it("prod: a planted debug response and budget scale are ignored", () => {
    globalThis.storyOrchestratorDebugExtractionResponse = "DELTA planted";
    globalThis.storyOrchestratorDebugCallBudgetScale = 0.01;
    globalThis.__SO_DEV__ = false;
    expect(debugResponseFor("read")).toBeNull();
    expect(callTimeoutMs(512)).toBe(callTimeoutMs(512, 0));
    const prod = callTimeoutMs(512);
    globalThis.__SO_DEV__ = true;
    expect(debugResponseFor("read")).toBe("DELTA planted");
    expect(callTimeoutMs(512)).toBeLessThan(prod);
  });

  it("the settings panel reaches the judge through the manager, not a global", async () => {
    globalThis.__SO_DEV__ = false;
    startRuntime();
    await flush();
    expect(runtimeManager.getJudge()).not.toBeNull();
    expect(globalThis.storyOrchestratorJudge).toBeUndefined();
  });

  it("prod: the save watcher does not publish its refusal ring", () => {
    jest.isolateModules(() => {
      globalThis.__SO_DEV__ = false;
      Reflect.deleteProperty(globalThis, "storyOrchestratorSaveRefusals");
      jest.requireActual("@services/stHost/persistence");
      expect(Reflect.has(globalThis, "storyOrchestratorSaveRefusals")).toBe(false);
    });
    jest.isolateModules(() => {
      globalThis.__SO_DEV__ = true;
      jest.requireActual("@services/stHost/persistence");
      expect(Reflect.has(globalThis, "storyOrchestratorSaveRefusals")).toBe(true);
    });
  });
});
