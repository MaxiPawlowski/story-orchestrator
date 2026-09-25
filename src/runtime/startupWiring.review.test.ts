/**
 * @jest-environment jsdom
 */
// v2.4 E3 + E5, against the REAL startRuntime: the page's first load unbinds an unadopted branch's
// inherited mirror (E5), and the chat-write and wizard-session evidence reach the runtime only while it
// runs (E3). A narrower harness would prove only that the helpers work, not that startup calls them.

const PARENT_BOOK = "Story Orchestrator - Branch story - chat-a";
const branchMetadata = () => ({
  main_chat: "chat-a",
  integrity: "i-branch",
  world_info: PARENT_BOOK,
  story_orchestrator: {
    version: 4,
    chatId: "chat-a",
    integrity: "i-a",
    selectedStoryId: "branch-story",
    stories: { "branch-story": { storyId: "branch-story", engineState: { activeCheckpointId: "start" }, pinnedStory: { checkpoints: [{ id: "start", name: "The Gate" }] }, extras: { memory: { wiBook: { name: PARENT_BOOK, chatId: "chat-a" } } } } },
  },
});

const refusedSettingsSave = () => ({ requested: true, status: 500, ok: false, timedOut: false, failed: false });
const mockHost = {
  context: { chat: [] as unknown[], chatId: "branch-1", extensionSettings: {} as Record<string, unknown>, chatMetadata: branchMetadata() as Record<string, unknown>, characters: [], groups: [], saveSettingsDebounced: () => {} },
  unbound: [] as string[],
  settingsSave: async () => refusedSettingsSave(),
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  observeSamplerPayloads: () => () => undefined,
  observeWorldInfoScans: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined }),
  loadedEntries: () => [],
  settingsReady: async () => {},
  noteHostSettingsLoaded: () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false }),
  observeNextSettingsSave: () => mockHost.settingsSave(),
  readServerExtensionSettings: async () => null,
  readServerBoundary: async () => null,
  readProfileContextLimit: () => ({ value: 8192, source: "default", reason: "no memory model profile is selected" }),
  countTokens: async (text: string) => Math.ceil(text.length / 4),
  saveOpenChat: async () => ({ ok: true, chatId: mockHost.context.chatId, observed: Promise.resolve({ requested: true, status: 200, ok: true, timedOut: false, failed: false }) }),
  unbindChatLorebook: async (name: string) => {
    if (mockHost.context.chatMetadata.world_info !== name) return { ok: false, reason: "the slot names another book" };
    delete mockHost.context.chatMetadata.world_info;
    mockHost.unbound.push(name);
    return { ok: true, name };
  },
  getContext: () => mockHost.context,
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
  showTextPopup: async () => undefined,
  sendConnectionProfileRequest: async () => ({ ok: true, text: "NO_DELTA", finish: "stop" }),
}));

import { runtimeManager } from "./runtimeManager";
import { setSelectedStoryId } from "./persistence";
import { saveWizardSession } from "./wizardSessions";
import { setGlobalSettings } from "./settingsStore";
import { TurnBridge } from "./turnBridge";
import { callExtractionReply } from "@extraction/client";

const settle = async () => { for (let index = 0; index < 30; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

beforeEach(() => {
  mockHost.context.chatId = "branch-1";
  mockHost.context.chatMetadata = branchMetadata();
  mockHost.context.extensionSettings = {};
  mockHost.unbound = [];
  mockHost.settingsSave = async () => refusedSettingsSave();
});

const heldSettingsSave = () => {
  let answer: () => void = () => {};
  const held = new Promise<ReturnType<typeof refusedSettingsSave>>((resolve) => { answer = () => resolve(refusedSettingsSave()); });
  mockHost.settingsSave = () => held;
  return answer;
};

describe("v2.4 E5: startRuntime's first load", () => {
  it("unbinds the parent's mirror from an unadopted branch it opens on", async () => {
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    stopRuntime();
    expect(mockHost.unbound).toEqual([PARENT_BOOK]);
    expect(mockHost.context.chatMetadata.world_info).toBeUndefined();
    expect((mockHost.context.chatMetadata.story_orchestrator as { chatId: string }).chatId).toBe("chat-a");
  });

  it("control: a chat of its own keeps its binding", async () => {
    const own = branchMetadata();
    delete (own as Record<string, unknown>).main_chat;
    own.story_orchestrator = { version: 4, chatId: "branch-1", integrity: "i-branch", selectedStoryId: null, stories: {} } as never;
    mockHost.context.chatMetadata = own;
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    stopRuntime();
    expect(mockHost.unbound).toEqual([]);
    expect(mockHost.context.chatMetadata.world_info).toBe(PARENT_BOOK);
  });

  it("tells the bridge which chat it loaded, so the first same-chat reload is not a switch", async () => {
    const noteLoaded = jest.spyOn(TurnBridge.prototype, "noteLoaded");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    stopRuntime();
    expect(noteLoaded).toHaveBeenCalledWith({ chatId: "branch-1", integrity: "i-branch" });
    noteLoaded.mockRestore();
  });
});

describe("v2.4 E3: startRuntime routes save evidence", () => {
  it("hands chat writes to the chat save, and stops at stopRuntime", async () => {
    mockHost.context.chatMetadata = {};
    const recordWrite = jest.spyOn(runtimeManager.chatSave, "recordWrite");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    recordWrite.mockClear();
    setSelectedStoryId(null);
    await settle();
    expect(recordWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: "select", chatId: "branch-1" }));
    stopRuntime();
    recordWrite.mockClear();
    setSelectedStoryId(null);
    await settle();
    expect(recordWrite).not.toHaveBeenCalled();
    recordWrite.mockRestore();
  });

  it("journals an unconfirmed wizard session save into the open chat, and stops at stopRuntime", async () => {
    mockHost.context.chatMetadata = {};
    const noteRecap = jest.spyOn(runtimeManager, "noteRecap");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    noteRecap.mockClear();
    await saveWizardSession({ key: "sun-ruins", stage: "provisioning", history: [], questions: [], applied: [], seed: "", updatedAt: "" } as never);
    await settle();
    expect(noteRecap).toHaveBeenCalledWith("wizard session save not confirmed", "wizard session sun-ruins: the settings save answered 500");
    stopRuntime();
    noteRecap.mockClear();
    await saveWizardSession({ key: "sun-ruins", stage: "provisioning", history: [], questions: [], applied: [], seed: "", updatedAt: "" } as never);
    await settle();
    expect(noteRecap).not.toHaveBeenCalled();
    noteRecap.mockRestore();
  });

  it("journals an unconfirmed library or settings-store write into the open chat, and stops at stopRuntime", async () => {
    mockHost.context.chatMetadata = {};
    const noteRecap = jest.spyOn(runtimeManager, "noteRecap");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    noteRecap.mockClear();
    setGlobalSettings({ talk: { enabled: false } });
    await settle();
    expect(noteRecap).toHaveBeenCalledWith("settings save not confirmed", "talk: the settings save answered 500");
    stopRuntime();
    noteRecap.mockClear();
    setGlobalSettings({ talk: { enabled: true } });
    await settle();
    expect(noteRecap).not.toHaveBeenCalled();
    noteRecap.mockRestore();
  });

  it("an import whose settings save fails journals exactly one library-save row", async () => {
    mockHost.context.chatId = "chat-a";
    mockHost.context.chatMetadata = { integrity: "i-a" };
    const noteRecap = jest.spyOn(runtimeManager, "noteRecap");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    const answer = heldSettingsSave();
    const epoch = runtimeManager.getRunContext().sessionEpoch;
    const story = { format: 2, title: "SO Import", description: "d", qualities: [], checkpoints: [{ id: "start", name: "Start", objective: "x", type: "anchor", start: true }], transitions: [], roster: [] };
    expect(await runtimeManager.importStory(JSON.stringify(story))).toBe(true);
    expect(runtimeManager.getRunContext().sessionEpoch).toBeGreaterThan(epoch);
    noteRecap.mockClear();
    answer();
    await settle();
    expect(noteRecap.mock.calls.filter(([summary]) => summary === "library save not confirmed")).toEqual([["library save not confirmed", "“SO Import” v1: the settings save answered 500"]]);
    stopRuntime();
    noteRecap.mockRestore();
  });

  it("control: a settings write whose evidence arrives after a chat switch is not journaled into the new chat", async () => {
    mockHost.context.chatId = "chat-a";
    mockHost.context.chatMetadata = { integrity: "i-a" };
    const noteRecap = jest.spyOn(runtimeManager, "noteRecap");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    const answer = heldSettingsSave();
    noteRecap.mockClear();
    setGlobalSettings({ talk: { enabled: false } });
    mockHost.context.chatId = "chat-b";
    mockHost.context.chatMetadata = { integrity: "i-b" };
    answer();
    await settle();
    expect(noteRecap.mock.calls.filter(([summary]) => summary === "settings save not confirmed")).toEqual([]);
    stopRuntime();
    noteRecap.mockRestore();
  });
});

describe("v2.4 plan 03 live-found fixes: startRuntime's scene-break and rollback wiring", () => {
  type Listener = (audit: unknown, collect?: Array<{ priority: number; reason: string }>) => void;
  let restore = () => {};
  afterEach(() => { restore(); restore = () => {}; });
  const start = async () => {
    const listeners: Listener[] = [];
    const onScene = jest.spyOn(runtimeManager, "onSceneBreakConfirmed").mockImplementation((listener) => { listeners.push(listener as Listener); return () => {}; });
    const attach = jest.spyOn(runtimeManager, "attachScheduler");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    const scheduler = attach.mock.calls.map((call) => call[0]).find(Boolean) as unknown as { schedule: (job: unknown) => void; host: { mutationSettled?: () => Promise<unknown> } };
    const schedule = jest.spyOn(scheduler, "schedule").mockImplementation(() => {});
    restore = () => { stopRuntime(); onScene.mockRestore(); attach.mockRestore(); schedule.mockRestore(); };
    return { listener: listeners[0], schedule, scheduler };
  };
  const audit = { reason: "memorize:window", window: { from: 0, to: 9 }, sceneBreak: { reason: "location" } };

  it("a scene break the memorize backlog collects is handed back to it, not scheduled beside it", async () => {
    const h = await start();
    const collect: Array<{ priority: number; reason: string }> = [];
    h.listener(audit, collect);
    expect(collect.map((job) => job.reason)).toContain("scene-break:location");
    expect(h.schedule).not.toHaveBeenCalled();
  });

  it("control: a scene break outside the backlog is still scheduled", async () => {
    const h = await start();
    h.listener(audit);
    expect(h.schedule).toHaveBeenCalledWith(expect.objectContaining({ priority: 2, reason: "scene-break:location" }));
  });

  it("the scheduler's lapse re-read waits on the manager's rollback", async () => {
    const h = await start();
    expect(h.scheduler.host.mutationSettled?.()).toBe(runtimeManager.rollbackSettled());
  });

  it("an answered model call reaches the running scheduler, so a live host can close its breaker (A6)", async () => {
    const h = await start();
    const noted = jest.spyOn(h.scheduler as unknown as { noteAnswered: (profileId: string, ms: number) => void }, "noteAnswered");
    await callExtractionReply("prompt", { profileId: "artemis", role: "read" });
    expect(noted).toHaveBeenCalledWith("artemis", expect.any(Number));
  });

  it("control: after stopRuntime an answered call reaches no scheduler", async () => {
    const h = await start();
    const noted = jest.spyOn(h.scheduler as unknown as { noteAnswered: (profileId: string, ms: number) => void }, "noteAnswered");
    restore();
    restore = () => {};
    await callExtractionReply("prompt", { profileId: "artemis", role: "read" });
    expect(noted).not.toHaveBeenCalled();
  });
});
