import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import type { RuntimeSnapshot } from "./types";

interface Row { name: string; is_user: boolean; mes: string; send_date?: string }

const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
const chats: Record<string, { chat: Row[]; metadata: Record<string, unknown> }> = {};
const saveGate = { held: null as Promise<void> | null };
const mockContext = {
  chat: [] as Row[],
  groupId: "g-test", chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  getContext: () => mockContext,
  saveOpenChat: async () => { if (saveGate.held) await saveGate.held; return { ok: true as const, chatId: String(mockContext.chatId ?? "") }; },
  setStoryExtensionPrompt: () => undefined,
  clearStoryExtensionPrompt: () => undefined,
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  disableWIEntry: jest.fn(async () => ({ ok: true, changed: false })),
  enableWIEntry: jest.fn(async () => ({ ok: true, changed: false })),
  lorebookExists: () => false,
  upsertWIEntry: jest.fn(async () => "created"),
  ensureLorebook: jest.fn(async (name: string) => ({ name, created: false })),
  loadLorebook: jest.fn(async () => ({ name: "mirror", entries: {} })),
  bindChatLorebook: jest.fn(() => "bound"),
  unbindChatLorebook: jest.fn(async (name: string) => ({ ok: true, name })),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => undefined),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => ({ ok: true, group: "g1" })),
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: jest.fn(async () => ({ requested: true, status: 200, ok: true, timedOut: false })),
  readServerBoundary: async () => null,
  readAppliedPreset: () => null,
  getActiveGroup: () => null,
  resolveGroupMemberId: () => null,
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(() => ({ close: () => undefined })),
  showConfirmPopup: jest.fn(async () => true),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHandlers.set(entry.eventName, entry.handler);
    return () => mockHandlers.clear();
  },
}));

const story = {
  format: 2,
  id: "switch-story",
  title: "Adolion: The Adventurer's Road",
  description: "Two chats of one story, one played as the author.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "guild-hall", name: "The Guild Hall", objective: "Take the job.", type: "anchor", start: true },
    { id: "road", name: "The Road North", objective: "Ride north.", type: "anchor" },
  ],
  transitions: [{ from: "guild-hall", to: "road", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const settle = async () => { for (let index = 0; index < 30; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const open = (id: string) => {
  chats[id] = chats[id] ?? { chat: [{ name: "Narrator", is_user: false, mes: "greeting", send_date: "t0" }], metadata: { integrity: `i-${id}` } };
  mockContext.chatId = id;
  mockContext.chat = chats[id].chat;
  mockContext.chatMetadata = chats[id].metadata;
};
const switchTo = async (id: string) => { open(id); await mockHandlers.get("CHAT_CHANGED")?.(); await settle(); };

const authorOnly = (snapshot: RuntimeSnapshot) => snapshot.ready && snapshot.ui.authorView;

async function twoChats() {
  const manager = new RuntimeManager();
  new TurnBridge(manager, manager.chatSave).start();
  open("chat-b");
  await mockHandlers.get("CHAT_CHANGED")?.();
  await settle();
  await manager.importStory(JSON.stringify(story));
  await settle();
  await switchTo("chat-a");
  await manager.selectStory("switch-story");
  manager.setUiSettings({ authorView: true });
  await settle();
  expect(manager.getSnapshot()).toMatchObject({ ready: true, ui: { authorView: true } });
  return manager;
}

jest.setTimeout(30000);

beforeEach(() => {
  mockHandlers.clear();
  for (const id of Object.keys(chats)) delete chats[id];
  saveGate.held = null;
  mockContext.extensionSettings = {};
});

describe("T4-4-2 finding 1: after a chat switch the UI renders the open chat, never the previous one (x-leak-B-after-switch.json)", () => {
  it("leaving an Author-view chat for a player chat publishes no author snapshot while the story loads, and the open chat's own once it is in", async () => {
    const manager = await twoChats();
    let rendered = manager.getCachedSnapshot();
    const renders: RuntimeSnapshot[] = [];
    manager.subscribe(() => { rendered = manager.getCachedSnapshot(); renders.push(rendered); });
    let release: () => void = () => undefined;
    saveGate.held = new Promise<void>((resolve) => { release = resolve; });
    open("chat-b");
    const changed = mockHandlers.get("CHAT_CHANGED")?.();
    expect(authorOnly(rendered)).toBe(false);
    await settle();
    expect(manager.getSnapshot().ui.authorView).toBe(false);
    expect(rendered).toMatchObject({ ready: true, ui: { authorView: false } });
    release();
    saveGate.held = null;
    await changed;
    await settle();
    expect(renders.some(authorOnly)).toBe(false);
    expect(rendered).toMatchObject({ ready: true, storyId: "switch-story", ui: { authorView: false } });
  });

  it("control: coming back to the Author-view chat shows its author view again once its story is in", async () => {
    const manager = await twoChats();
    await switchTo("chat-b");
    expect(manager.getCachedSnapshot().ui.authorView).toBe(false);
    await switchTo("chat-a");
    expect(manager.getCachedSnapshot()).toMatchObject({ ready: true, ui: { authorView: true } });
  });

  it("while the previous chat's story is still loaded for another chat the published snapshot is not ready and carries none of its state", async () => {
    const manager = await twoChats();
    open("chat-b");
    manager.touch();
    const published = manager.getCachedSnapshot();
    expect(published).toMatchObject({ ready: false, storyId: null, ui: { authorView: false } });
    expect(manager.getSnapshot()).toMatchObject({ ready: true, ui: { authorView: true } });
  });
});
