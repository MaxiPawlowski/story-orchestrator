/**
 * @jest-environment jsdom
 */
const macros = new Map<string, number>();
const surface = { started: 0, stopped: 0 };
const hostSubscriptions = { open: 0 };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  observeSamplerPayloads: () => () => undefined,
  installScanGating: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined, scans: () => 0 }),
  observeWorldInfoScans: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined }),
  loadedEntries: () => [],
  readProfileContextLimit: () => ({ value: 8192, source: "default", reason: "no memory model profile is selected" }),
  countTokens: async (text: string) => Math.ceil(text.length / 4),
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [], groups: [] }),
  registerHostMacro: (key: string) => { macros.set(key, (macros.get(key) ?? 0) + 1); },
  unregisterHostMacro: (key: string) => { macros.delete(key); },
  subscribeToHostEvents: () => { hostSubscriptions.open += 1; return () => { hostSubscriptions.open -= 1; }; },
  startSaveWatcherSurface: () => { surface.started += 1; return () => { surface.stopped += 1; }; },
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

import { RUNTIME_GLOBALS, runtimeManager, startRuntime, stopRuntime } from "./index";

const soGlobals = () => Object.keys(globalThis).filter((name) => name.startsWith("storyOrchestrator") && Reflect.get(globalThis, name) !== undefined);

describe("stopRuntime", () => {
  afterEach(() => stopRuntime());

  it("control: a started runtime holds host macros and storyOrchestrator globals", async () => {
    startRuntime();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(macros.size).toBeGreaterThan(10);
    expect(macros.has("story_title")).toBe(true);
    expect(soGlobals()).toEqual(expect.arrayContaining(["storyOrchestratorScheduler", "storyOrchestratorJudge", "storyOrchestratorLore"]));
  });

  it("unregisters every macro it registered and leaves no storyOrchestrator global", () => {
    startRuntime();
    stopRuntime();
    expect([...macros.keys()]).toEqual([]);
    expect(soGlobals()).toEqual([]);
    for (const name of RUNTIME_GLOBALS) expect(Reflect.has(globalThis, name)).toBe(false);
    expect(typeof globalThis.talkControlInterceptor).toBe("function");
  });

  it("a dev handle that loads after stop is not published", async () => {
    startRuntime();
    stopRuntime();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(soGlobals()).toEqual([]);
  });

  it("disposes the save watcher's surface it started (E4: the dev refusal ring and the fetch wrap)", () => {
    const before = { ...surface };
    startRuntime();
    expect(surface.started).toBe(before.started + 1);
    stopRuntime();
    expect(surface.stopped).toBe(before.stopped + 1);
  });

  it("stops a tool-turn probe that was left running (E4: its patches and host listeners)", async () => {
    const original = runtimeManager.onGenerationStarted;
    startRuntime();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const probe = globalThis.storyOrchestratorToolTurnProbe;
    expect(probe).toBeDefined();
    const open = hostSubscriptions.open;
    probe?.start();
    expect(runtimeManager.onGenerationStarted).not.toBe(original);
    expect(hostSubscriptions.open).toBe(open + 1);
    stopRuntime();
    expect(runtimeManager.onGenerationStarted).toBe(original);
    expect(hostSubscriptions.open).toBeLessThanOrEqual(open);
  });

  it("a start after stop registers each macro once again", () => {
    startRuntime();
    stopRuntime();
    startRuntime();
    expect(macros.get("story_title")).toBe(1);
    expect([...macros.values()].every((count) => count === 1)).toBe(true);
  });
});
