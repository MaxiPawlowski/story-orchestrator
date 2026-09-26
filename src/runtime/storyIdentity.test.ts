import { RuntimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";
import { listStoryRecords } from "./storyLibrary";
import type { StoryOrchestratorMetadataBlob } from "./types";

const mockExtensionPrompts: Record<string, { value: string; depth: number }> = {};
const mockContext = {
  chat: [] as Array<{ mes: string }>,
  chatId: "chat-1",
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveSettingsDebounced: jest.fn(),
};

let confirmAnswer = true;

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => mockContext,
  saveOpenChat: async () => { await (mockContext).saveMetadata?.(); return { ok: true as const, chatId: "" }; },
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => { mockExtensionPrompts[key] = { value: text, depth }; },
  clearStoryExtensionPrompt: (key: string) => { delete mockExtensionPrompts[key]; },
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => undefined),
  enableWIEntry: jest.fn(async () => undefined),
  upsertWIEntry: jest.fn(async () => "created"),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => undefined),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  getActiveGroup: jest.fn(() => null),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: jest.fn(() => undefined),
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(async () => undefined),
  showConfirmPopup: jest.fn(async () => confirmAnswer),
}));

const storyJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  format: 2,
  id: "sun-ruins",
  version: 1,
  title: "Quest for the Sun Ruins",
  description: "A desert expedition.",
  qualities: [{ key: "found_key", type: "bool", source: "extractor", rubric: "Did they find the key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Look around.", type: "anchor", start: true },
    { id: "door", name: "Door", objective: "Open it.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "door", priority: 1, gate: { q: "found_key", op: "==", v: true } }],
  roster: [],
  ...over,
});

const blob = () => mockContext.chatMetadata.story_orchestrator as unknown as StoryOrchestratorMetadataBlob;

const reset = () => {
  mockContext.chat = [];
  mockContext.chatId = "chat-1";
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  confirmAnswer = true;
  Object.keys(mockExtensionPrompts).forEach((key) => { delete mockExtensionPrompts[key]; });
};

describe("story identity", () => {
  beforeEach(reset);

  it("keys the library and the chat by the authored id, keeping the hash for integrity", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    const snapshot = manager.getSnapshot();
    expect(snapshot.storyId).toBe("sun-ruins");
    expect(snapshot.storyHash).toMatch(/^v2-/);
    expect(Object.keys(blob().stories)).toEqual(["sun-ruins"]);
    expect(blob().selectedStoryId).toBe("sun-ruins");
    expect(listStoryRecords()[0]).toMatchObject({ id: "sun-ruins", version: 1 });
  });

  it("an id-less story takes its title's slug, written into the stored copy", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ id: undefined }));
    expect(manager.getSnapshot().storyId).toBe("quest-for-the-sun-ruins");
    expect(listStoryRecords()[0].raw.id).toBe("quest-for-the-sun-ruins");
  });

  it("A7: the same id-less story imported twice is one record, and edited content is that record at version+1", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ id: undefined }));
    await manager.importStory(storyJson({ id: undefined }));
    expect(listStoryRecords().map((record) => [record.id, record.version])).toEqual([["quest-for-the-sun-ruins", 1]]);
    await manager.importStory(storyJson({ id: undefined, description: "Rewritten." }));
    expect(listStoryRecords().map((record) => [record.id, record.version])).toEqual([["quest-for-the-sun-ruins", 2]]);
  });

  it("control: a different title is a second record, and an id-carrying import keeps its id", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ id: undefined }));
    await manager.importStory(storyJson({ id: undefined, title: "Another Road" }));
    await manager.importStory(storyJson());
    expect(listStoryRecords().map((record) => record.id).sort()).toEqual(["another-road", "quest-for-the-sun-ruins", "sun-ruins"]);
  });

  it("rejects a malformed id instead of silently rewriting it", async () => {
    const manager = new RuntimeManager();
    expect(await manager.importStory(storyJson({ id: "Not A Slug!" }))).toBe(false);
    expect(manager.getSnapshot().validationErrors[0].path).toBe("id");
  });

  it("updates the library record in place when the same id is re-imported, bumping the version", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    await manager.importStory(storyJson({ description: "Rewritten." }));
    const records = listStoryRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "sun-ruins", version: 2, description: "Rewritten." });
  });

  it("pins the story into the chat and hydrates the pinned copy on re-select", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    await manager.setQuality("found_key", "true");
    await manager.commitBoundary();
    const advanced = manager.getSnapshot();
    expect(advanced.activeCheckpointId).toBe("door");
    expect(blob().stories["sun-ruins"].pinnedStory).toBeTruthy();

    await manager.selectStory("sun-ruins");
    expect(manager.getSnapshot().activeCheckpointId).toBe("door");
    expect(manager.getSnapshot().boundary).toBe(advanced.boundary);
  });

  it("keeps playing from the pinned copy after the library record is deleted", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    await manager.setQuality("found_key", "true");
    await manager.commitBoundary();

    expect(await manager.removeStory("sun-ruins")).toBe(true);
    expect(listStoryRecords()).toHaveLength(0);

    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(reopened.getSnapshot().storyId).toBe("sun-ruins");
    expect(reopened.getSnapshot().activeCheckpointId).toBe("door");
    expect(reopened.getSnapshot().storyIdentity).toMatchObject({ pinned: true, libraryVersion: null });
  });

  it("does not push a library edit into a chat that already pinned the story", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    await manager.importStory(storyJson({ description: "Rewritten." }));

    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(reopened.getSnapshot().storyDescription).toBe("A desert expedition.");
    expect(reopened.getSnapshot().storyIdentity).toMatchObject({ playedVersion: 1, libraryVersion: 2, drifted: true });
  });

  it("restart clears progress and re-pins the latest library version", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    await manager.setQuality("found_key", "true");
    await manager.commitBoundary();
    await manager.importStory(storyJson({ description: "Rewritten." }));

    const playing = new RuntimeManager();
    await playing.loadSelectedFromChat();
    expect(playing.getSnapshot().activeCheckpointId).toBe("door");

    expect(await playing.restartStory()).toBe(true);
    expect(playing.getSnapshot().activeCheckpointId).toBe("start");
    expect(playing.getSnapshot().storyDescription).toBe("Rewritten.");
    expect(playing.getSnapshot().storyIdentity).toMatchObject({ playedVersion: 2, drifted: false });
  });

  it("restart does nothing when the confirm is declined", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    await manager.setQuality("found_key", "true");
    await manager.commitBoundary();
    confirmAnswer = false;
    expect(await manager.restartStory()).toBe(false);
    expect(manager.getSnapshot().activeCheckpointId).toBe("door");
  });
});

describe("settings homes", () => {
  beforeEach(reset);

  it("defaults extraction to enabled so a configured install plays immediately", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    expect(manager.getSnapshot().extraction.settings.enabled).toBe(true);
  });

  it("writes install-wide settings to the global store, not the chat", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    manager.setExtractionSettings({ profileId: "profile-1", cadence: 4 });
    manager.setUiSettings({ hudEnabled: false, authorView: true });

    expect(getGlobalSettings().extraction).toMatchObject({ profileId: "profile-1", cadence: 4 });
    expect(getGlobalSettings().display.hudEnabled).toBe(false);

    const persisted = blob().stories["sun-ruins"].extras;
    expect(persisted.extraction.settings).toBeUndefined();
    expect(persisted.ui).toEqual({ authorView: true });
    expect(persisted.memory.settings).toBeUndefined();
  });

  it("a new chat inherits the install profile", async () => {
    const first = new RuntimeManager();
    await first.importStory(storyJson());
    first.setExtractionSettings({ profileId: "profile-1" });

    mockContext.chatMetadata = {};
    mockContext.chatId = "chat-2";
    const second = new RuntimeManager();
    await second.selectStory("sun-ruins");
    expect(second.getSnapshot().extraction.settings).toMatchObject({ enabled: true, profileId: "profile-1" });
  });

  it("keeps author view and the shape override per chat", async () => {
    const first = new RuntimeManager();
    await first.importStory(storyJson());
    first.setUiSettings({ authorView: true });
    first.setPacingSettings({ shapeOverride: "three_act" });
    expect(first.getSnapshot().ui.authorView).toBe(true);

    mockContext.chatMetadata = {};
    mockContext.chatId = "chat-2";
    const second = new RuntimeManager();
    await second.selectStory("sun-ruins");
    expect(second.getSnapshot().ui.authorView).toBe(false);
    expect(second.getSnapshot().pacing.shapeOverride).toBeNull();
  });

  it("a chat's per-chat settings are ignored: the install's settings win and are not rewritten", async () => {
    const first = new RuntimeManager();
    await first.importStory(storyJson());
    const extras = blob().stories["sun-ruins"].extras as unknown as Record<string, Record<string, unknown>>;
    extras.extraction = { ...extras.extraction, settings: { enabled: true, profileId: "chat-profile", cadence: 7, reconciliationMultiplier: 2, stabilityLag: 1 } };
    extras.ui = { authorView: true, announceTransitions: false, hudEnabled: false };
    const install = JSON.stringify(getGlobalSettings());

    const second = new RuntimeManager();
    await second.selectStory("sun-ruins");
    expect(second.getSnapshot().extraction.settings).toMatchObject({ profileId: null, cadence: 3 });
    expect(second.getSnapshot().ui).toMatchObject({ authorView: true, announceTransitions: true, hudEnabled: true });
    expect(JSON.stringify(getGlobalSettings())).toBe(install);
  });
});
