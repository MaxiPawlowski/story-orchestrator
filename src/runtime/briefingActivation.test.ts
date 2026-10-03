import { getActiveGroup } from "@services/STAPI";
import { RuntimeManager } from "./runtimeManager";
import { activationPanes, briefingDue, ACTIVATION_STEPS } from "./briefing";
import { setGlobalSettings } from "./settingsStore";
import type { StoryOrchestratorMetadataBlob } from "./types";

const mockExtensionPrompts: Record<string, { value: string; depth: number }> = {};
const mockContext = {
  chat: [] as Array<{ mes: string }>,
  chatId: "chat-1" as string | undefined,
  groupId: "group-a" as string | null,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveSettingsDebounced: jest.fn(),
};

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
  getActiveGroup: jest.fn(() => ({ members: [] })),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: jest.fn(() => undefined),
  readInjectedPromptBlocks: () => Object.entries(mockExtensionPrompts).map(([key, entry]) => ({ key, depth: entry.depth, role: 0, value: entry.value })),
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(async () => undefined),
  showConfirmPopup: jest.fn(async () => true),
}));

const BRIEFING = { title: "Before the road", sections: [{ heading: "Who you are", text: "A courier." }], tone: "Grim." };

const storyJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  format: 2, id: "road", version: 1, title: "The Road", description: "AUTHOR: the courier is the heir.",
  player_intro: "You carry a letter.",
  qualities: [{ key: "found_key", type: "bool", source: "extractor", rubric: "Did they find the key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Look around.", type: "anchor", start: true, guidance: "Keep it tense." },
    { id: "door", name: "Door", objective: "Open it.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "door", priority: 1, gate: { q: "found_key", op: "==", v: true } }],
  roster: [],
  briefing: BRIEFING,
  ...over,
});

const blob = () => mockContext.chatMetadata.story_orchestrator as unknown as StoryOrchestratorMetadataBlob;
const pending = (manager: RuntimeManager) => manager.getSnapshot().briefing?.pending ?? false;

const reset = () => {
  mockContext.chat = [];
  mockContext.chatId = "chat-1";
  mockContext.groupId = "group-a";
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  (getActiveGroup as jest.Mock).mockReturnValue({ members: [] });
  Object.keys(mockExtensionPrompts).forEach((key) => { delete mockExtensionPrompts[key]; });
};

describe("v2.7 05 activation sequence", () => {
  beforeEach(reset);

  it("orders the panes Before you start, identity, briefing, and the opener is never a pane", () => {
    expect(ACTIVATION_STEPS).toEqual(["chat", "story", "before-you-start", "identity", "briefing", "opener"]);
    expect(activationPanes({ blocks: 2, briefing: true, identity: true })).toEqual(["before-you-start", "identity", "briefing"]);
    expect(activationPanes({ blocks: 0, briefing: true })).toEqual(["briefing"]);
    expect(activationPanes({ blocks: 1, briefing: false })).toEqual(["before-you-start"]);
    expect(activationPanes({ blocks: 0, briefing: false })).toEqual([]);
  });

  it("opens on a new chat in a bound group, once: closing it is saved with the chat and a reopen does not show it", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    mockContext.extensionSettings["story-orchestrator"].groupStories = { "group-a": "road" };
    mockContext.chatId = "chat-2";
    mockContext.chatMetadata = {};
    await manager.loadSelectedFromChat();
    const state = manager.getSnapshot().briefing;
    expect(state).toMatchObject({ storyId: "road", pending: true, enabled: true, view: { title: "Before the road", tone: "Grim.", source: "authored" } });
    expect(briefingDue(state, 0)).toBe(true);
    manager.setUiSettings({ briefingSeen: true });
    expect(pending(manager)).toBe(false);
    expect(blob().stories.road.extras?.briefing).toEqual({ seen: true });

    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(reopened.getSnapshot().storyId).toBe("road");
    expect(pending(reopened)).toBe(false);
  });

  it("select opens it, a rollback does not bring it back, Restart does", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    expect(pending(manager)).toBe(true);
    manager.setUiSettings({ briefingSeen: true });
    mockContext.chat = [{ mes: "hello" }, { mes: "reply" }];
    await manager.commitBoundary();
    await manager.rollbackFromMessage(0);
    expect(pending(manager)).toBe(false);
    expect(await manager.restartStory(true)).toBe(true);
    expect(pending(manager)).toBe(true);
  });

  it("a story update keeps it closed; a chat that was playing before this shipped is not interrupted", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    manager.setUiSettings({ briefingSeen: true });
    await manager.importStory(storyJson({ version: 2, briefing: { ...BRIEFING, title: "Rewritten" } }));
    await manager.applyStoryUpdate();
    expect(manager.getSnapshot().briefing?.view?.title).toBe("Rewritten");
    expect(pending(manager)).toBe(false);

    delete (blob().stories.road.extras as { briefing?: unknown }).briefing;
    const older = new RuntimeManager();
    await older.loadSelectedFromChat();
    expect(older.getSnapshot().storyId).toBe("road");
    expect(pending(older)).toBe(false);
  });

  it("controls: a one-on-one chat (no story loads there, v2.7 03), and the Display switch off, open nothing on their own", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue(null);
    mockContext.groupId = null;
    const solo = new RuntimeManager();
    await solo.importStory(storyJson());
    expect(solo.getSnapshot().briefing ?? null).toBeNull();
    expect(pending(solo)).toBe(false);
    expect(briefingDue(solo.getSnapshot().briefing, 0)).toBe(false);

    reset();
    setGlobalSettings({ display: { briefing: false } });
    const off = new RuntimeManager();
    await off.importStory(storyJson());
    const state = off.getSnapshot().briefing;
    expect(state).toMatchObject({ pending: true, enabled: false });
    expect(briefingDue(state, 0)).toBe(false);
    expect(briefingDue(state, 1)).toBe(true);
  });

  it("falls back to player_intro and never to the description", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ briefing: undefined }));
    const view = manager.getSnapshot().briefing?.view;
    expect(view).toMatchObject({ source: "intro", sections: [{ text: "You carry a letter." }] });
    expect(JSON.stringify(manager.getSnapshot().briefing)).not.toContain("AUTHOR:");
  });

  it("payload invariance: the briefing, its display switch and closing it change nothing the model is sent", async () => {
    const injected = () => JSON.stringify(Object.entries(mockExtensionPrompts).sort(([left], [right]) => left.localeCompare(right)));
    const without = new RuntimeManager();
    await without.importStory(storyJson({ briefing: undefined, player_intro: undefined }));
    const baseline = injected();
    expect(baseline).toContain("Keep it tense.");

    reset();
    const withBriefing = new RuntimeManager();
    await withBriefing.importStory(storyJson());
    expect(injected()).toBe(baseline);
    withBriefing.setUiSettings({ briefingSeen: true });
    expect(injected()).toBe(baseline);

    reset();
    setGlobalSettings({ display: { briefing: false } });
    const switchedOff = new RuntimeManager();
    await switchedOff.importStory(storyJson());
    expect(injected()).toBe(baseline);
    expect(injected()).not.toContain("Before the road");
    expect(injected()).not.toContain("A courier.");
  });
});
