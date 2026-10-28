import { executeSlashCommands, getActiveGroup } from "@services/STAPI";
import { RuntimeManager } from "./runtimeManager";
import { installPersonaHost, type PersonaHost } from "./playerSetupPort";
import type { PersonaRead } from "./playerSetup";

const mockExtensionPrompts: Record<string, { value: string; depth: number }> = {};
const mockContext = {
  chat: [] as Array<{ mes: string; name?: string; is_user?: boolean; is_system?: boolean }>,
  chatId: "chat-1" as string | undefined,
  groupId: "group-a" as string | null,
  name1: "Max",
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveSettingsDebounced: jest.fn(),
};
const mockTrigger: { during: () => void } = { during: () => undefined };

jest.mock("@services/STAPI", () => {
  const executeSlashCommands = jest.fn(async (command: string) => {
    const sendas = /^\/sendas name="([^"]+)" raw=false "(.*)"$/.exec(command);
    if (sendas) mockContext.chat.push({ mes: sendas[2], name: sendas[1] });
    const voice = /^voice (\d+)$/.exec(command);
    if (voice) {
      mockTrigger.during();
      mockContext.chat.push({ mes: "generated", name: ["Narrator", "Mara"][Number(voice[1])] });
    }
    return true;
  });
  return {
  executeSlashCommands,
  startGroupVoiceAt: jest.fn(async (position: number) => { await executeSlashCommands(`voice ${position}`); return { ok: true }; }),
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  settingsAreLoaded: () => true,
  saveSettingsSoon: () => ({ ok: true, queued: true }),
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => mockContext,
  saveOpenChat: async () => { await mockContext.saveMetadata(); return { ok: true as const, chatId: "" }; },
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
  setGroupMembersDisabled: jest.fn(async () => ({ ok: true })),
  getActiveGroup: jest.fn(() => ({ id: "group-a", members: [], disabled_members: [] })),
  resolveGroupMemberId: jest.fn((name: string) => (["Narrator", "Mara"].includes(name) ? name.toLowerCase() : null)),
  groupMemberPosition: jest.fn((name: string) => (name === "Mara" ? { ok: true, position: 1 } : name === "Narrator" ? { ok: true, position: 0 } : { ok: false, reason: "not here" })),
  watchHostChatMove: () => () => undefined,
  guardHostStream: () => ({ halt: () => false, release: () => undefined }),
  isHostGenerating: () => false,
  stopHostGeneration: () => undefined,
  getCharacterNameById: jest.fn(() => undefined),
  readInjectedPromptBlocks: () => Object.entries(mockExtensionPrompts).map(([key, entry]) => ({ key, depth: entry.depth, role: 0, value: entry.value })),
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  listPersonas: () => ["Max"],
  showTextPopup: jest.fn(async () => undefined),
  showConfirmPopup: jest.fn(async () => true),
  };
});

const host: PersonaHost = {
  read: (): PersonaRead => ({
    avatarId: "max.png", name: mockContext.name1, description: "", descriptionSent: true, lockedAvatarId: null,
    personas: [{ avatarId: "max.png", name: "Max" }], canCreate: true,
  }),
  select: async (avatarId) => ({ ok: true, avatarId }),
  lock: async () => ({ ok: true, avatarId: "max.png" }),
  create: async () => ({ ok: true, avatarId: "max.png" }),
};

const OPENER = { member: "Narrator", trigger: "onEnter", kind: "scripted", new_chat_only: true, text: "The road opens." };
const ENTER = { member: "Narrator", trigger: "onEnter", kind: "scripted", text: "A cart rattles past." };
const HOOK = { member: "Mara", trigger: "onEnter", kind: "llm", new_chat_only: true, ask_player: true, after_member: "Narrator" };

const storyJson = (replies: unknown[], over: Record<string, unknown> = {}) => JSON.stringify({
  id: "road", title: "The Road", description: "D",
  qualities: [{ key: "found_key", type: "bool", source: "extractor", rubric: "Did they find the key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Look around.", type: "anchor", start: true, effects: { npc_replies: replies } },
    { id: "door", name: "Door", objective: "Open it.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "door", priority: 1, gate: { q: "found_key", op: "==", v: true } }],
  roster: [{ id: "narrator", name: "Narrator" }, { id: "mara", name: "Mara" }],
  ...over,
});

const PLAYER = { role: "a hired courier", summary: "You carry a sealed letter.", assumes: ["can ride"] };

const spoken = () => (executeSlashCommands as jest.Mock).mock.calls.map(([command]) => String(command))
  .filter((command) => command.startsWith("/sendas") || command.startsWith("voice "))
  .map((command) => (command.startsWith("voice ") ? `trigger ${command.split(" ").at(-1)}` : /raw=false "(.*)"$/.exec(command)?.[1] ?? command));

const guidance = () => mockExtensionPrompts.story_orchestrator_guidance?.value ?? "";

let release: () => void = () => undefined;

describe("v3.0 19 P2: the opening hook", () => {
  beforeEach(() => {
    mockContext.chat = [];
    mockContext.chatId = "chat-1";
    mockContext.groupId = "group-a";
    mockContext.chatMetadata = {};
    mockContext.extensionSettings = {};
    mockTrigger.during = () => undefined;
    (executeSlashCommands as jest.Mock).mockClear();
    (getActiveGroup as jest.Mock).mockReturnValue({ id: "group-a", members: [], disabled_members: [] });
    Object.keys(mockExtensionPrompts).forEach((key) => { delete mockExtensionPrompts[key]; });
    release();
    release = installPersonaHost(host);
  });
  afterAll(() => release());

  it("posts after the opener and the start beat's other entering lines, once, with its one-shot direction", async () => {
    const manager = new RuntimeManager();
    let during = "";
    mockTrigger.during = () => {
      (manager as unknown as { pacing: { draftGuidance: (id: string) => void } }).pacing.draftGuidance("mara");
      during = guidance();
    };
    await manager.importStory(storyJson([OPENER, HOOK, ENTER]));
    expect(spoken()).toEqual(["The road opens.", "A cart rattles past.", "trigger 1"]);
    expect(during).toContain("Direction for Mara only, this reply: Turn to {{user}} in your own voice");
    expect(guidance()).not.toContain("this reply");
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(spoken()).toHaveLength(3);
  });

  it("the ordering bug: while the identity step is pending nothing posts; settling it posts opener, entering line, then hook", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson([OPENER, ENTER, HOOK], { player: PLAYER }));
    expect(manager.getSnapshot().playerSetup?.pending).toBe(true);
    expect(spoken()).toEqual([]);
    await manager.playerSetup.choose({ choice: "keep" });
    expect(spoken()).toEqual(["The road opens.", "A cart rattles past.", "trigger 1"]);
  });

  it("control: without a hook, a start beat with an opener still posts opener then entering line after identity settles", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson([OPENER, ENTER], { player: PLAYER }));
    expect(spoken()).toEqual([]);
    await manager.playerSetup.choose({ choice: "keep" });
    expect(spoken()).toEqual(["The road opens.", "A cart rattles past."]);
  });

  it("is skipped while its member is switched off in the group", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ id: "group-a", members: [], disabled_members: ["mara"] });
    const manager = new RuntimeManager();
    await manager.importStory(storyJson([OPENER, HOOK]));
    expect(spoken()).toEqual(["The road opens."]);
  });

  it("needs a fresh chat: a chat that already holds lines gets no opener and no hook", async () => {
    mockContext.chat = [{ mes: "An earlier greeting.", name: "Narrator" }];
    const manager = new RuntimeManager();
    await manager.importStory(storyJson([OPENER, HOOK]));
    expect(spoken()).toEqual([]);
  });

  it("after_member holds the hook when the line before it is not that member's", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson([{ ...OPENER, member: "Mara" }, HOOK]));
    expect(spoken()).toEqual(["The road opens."]);
  });

  it("every scripted opener posts, in order, before the hook", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson([OPENER, { ...OPENER, text: "Rain starts." }, HOOK]));
    expect(spoken()).toEqual(["The road opens.", "Rain starts.", "trigger 1"]);
  });

  it("an opener that ends on a question to the player never defers the start beat's own lines or the hook", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson([{ ...OPENER, text: "\"Max, are you awake?\"" }, ENTER, HOOK]));
    expect(spoken()).toEqual(["\\\"Max, are you awake?\\\"", "A cart rattles past.", "trigger 1"]);
    expect((manager as unknown as { extras: { deferredOpener?: unknown } }).extras.deferredOpener).toBeUndefined();
  });

  it("records the hook as a cued line, so a swipe of it is regenerated with the same direction", async () => {
    const manager = new RuntimeManager();
    const pacing = (manager as unknown as { pacing: { draftGuidance: (id: string) => void } }).pacing;
    await manager.importStory(storyJson([OPENER, HOOK]));
    const extras = (manager as unknown as { extras: { cuedLines?: Array<{ messageId: number; member: string; text: string }> } }).extras;
    expect(extras.cuedLines).toEqual([{ messageId: 1, member: "Mara", text: expect.stringContaining("Turn to {{user}}") }]);
    manager.cueSwipe("swipe", 1);
    pacing.draftGuidance("mara");
    expect(guidance()).toContain("Direction for Mara only, this reply: Turn to {{user}}");
    manager.clearPrivateInjection();
    expect(guidance()).not.toContain("this reply");
    manager.cueSwipe("normal", 1);
    pacing.draftGuidance("mara");
    expect(guidance()).not.toContain("this reply");
  });

  it("a chapter-opening hook: an ask_player entering line fires after the entering narrator line on a transition", async () => {
    const manager = new RuntimeManager();
    const raw = JSON.parse(storyJson([OPENER]));
    raw.checkpoints[1].effects = { npc_replies: [{ ...ENTER, text: "The door groans." }, { member: "Mara", trigger: "onEnter", kind: "llm", ask_player: true, after_member: "narrator" }] };
    await manager.importStory(JSON.stringify(raw));
    (executeSlashCommands as jest.Mock).mockClear();
    await manager.activateCheckpoint("door");
    expect(spoken()).toEqual(["The door groans.", "trigger 1"]);
  });
});
