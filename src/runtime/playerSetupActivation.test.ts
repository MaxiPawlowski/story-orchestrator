import { executeSlashCommands, getActiveGroup } from "@services/STAPI";
import { RuntimeManager } from "./runtimeManager";
import { createdPersonaDescription } from "@engine/player";
import { setGlobalSettings } from "./settingsStore";
import { installPersonaHost, type PersonaHost } from "./playerSetupPort";
import type { PersonaRead } from "./playerSetup";
import type { StoryOrchestratorMetadataBlob } from "./types";

const mockExtensionPrompts: Record<string, { value: string; depth: number }> = {};
const mockContext = {
  chat: [] as Array<{ mes: string; is_user?: boolean }>,
  chatId: "chat-1" as string | undefined,
  groupId: "group-a" as string | null,
  name1: "Max",
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
  executeSlashCommands: jest.fn(async (command: string) => {
    if (command.startsWith("/sendas")) mockContext.chat.push({ mes: "posted" });
    return true;
  }),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  getActiveGroup: jest.fn(() => ({ members: [] })),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: jest.fn(() => undefined),
  readInjectedPromptBlocks: () => Object.entries(mockExtensionPrompts).map(([key, entry]) => ({ key, depth: entry.depth, role: 0, value: entry.value })),
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  listPersonas: () => mockPersonas.personas.map((entry) => entry.name),
  showTextPopup: jest.fn(async () => undefined),
  showConfirmPopup: jest.fn(async () => true),
}));

const mockPersonas = {
  avatarId: "max.png" as string | null,
  personas: [{ avatarId: "max.png", name: "Max" }, { avatarId: "mara.png", name: "Mara" }],
  description: "",
  locked: null as string | null,
};

const writes: string[] = [];

const host: PersonaHost = {
  read: (): PersonaRead => ({
    avatarId: mockPersonas.avatarId, name: mockContext.name1, description: mockPersonas.description, descriptionSent: true, lockedAvatarId: mockPersonas.locked,
    personas: mockPersonas.personas, canCreate: true,
  }),
  select: async (avatarId) => {
    writes.push(`select ${avatarId}`);
    mockPersonas.avatarId = avatarId;
    mockContext.name1 = mockPersonas.personas.find((entry) => entry.avatarId === avatarId)?.name ?? "";
    return { ok: true, avatarId };
  },
  lock: async () => {
    writes.push(`lock ${mockPersonas.avatarId}`);
    mockPersonas.locked = mockPersonas.avatarId;
    return { ok: true, avatarId: mockPersonas.avatarId ?? "" };
  },
  create: async ({ name, description, title }) => {
    const avatarId = `${name.toLowerCase()}.png`;
    writes.push(`create ${name} | ${title} | ${description}`);
    mockPersonas.personas = [...mockPersonas.personas, { avatarId, name }];
    return { ok: true, avatarId };
  },
};

const OPENER = { member: "Narrator", trigger: "onEnter", kind: "scripted", new_chat_only: true, text: "The road opens." };

const storyJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  format: 2, id: "road", title: "The Road", description: "D",
  qualities: [{ key: "found_key", type: "bool", source: "extractor", rubric: "Did they find the key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Look around.", type: "anchor", start: true, effects: { npc_replies: [OPENER] } },
    { id: "door", name: "Door", objective: "Open it.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "door", priority: 1, gate: { q: "found_key", op: "==", v: true } }],
  roster: [],
  ...over,
});

const PLAYER = { role: "a hired courier", summary: "You carry a sealed letter.", assumes: ["can ride"] };

const sendas = () => (executeSlashCommands as jest.Mock).mock.calls.filter(([command]) => String(command).startsWith("/sendas")).length;
const blob = () => mockContext.chatMetadata.story_orchestrator as unknown as StoryOrchestratorMetadataBlob;

let release: () => void = () => undefined;

const reset = () => {
  mockContext.chat = [];
  mockContext.chatId = "chat-1";
  mockContext.groupId = "group-a";
  mockContext.name1 = "Max";
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  Object.assign(mockPersonas, { avatarId: "max.png", personas: [{ avatarId: "max.png", name: "Max" }, { avatarId: "mara.png", name: "Mara" }], description: "", locked: null });
  writes.length = 0;
  (getActiveGroup as jest.Mock).mockReturnValue({ members: [] });
  Object.keys(mockExtensionPrompts).forEach((key) => { delete mockExtensionPrompts[key]; });
  release();
  release = installPersonaHost(host);
};

describe("v2.7 34 activation: readiness, identity, briefing, opener", () => {
  beforeEach(reset);
  afterAll(() => release());

  it("a story without a player block locks the current persona silently and the opener posts in the same load", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    expect(writes).toEqual(["lock max.png"]);
    expect(manager.getSnapshot().playerSetup).toMatchObject({ pending: false, needsPane: false, record: { choice: "skip", avatarId: "max.png", locked: true } });
    expect(sendas()).toBe(1);
  });

  it("selectStory with a player block holds the opener until the identity step resolves, then posts it once", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    expect(manager.getSnapshot().playerSetup).toMatchObject({ pending: true, needsPane: true, player: { role: "a hired courier" } });
    expect(writes).toEqual([]);
    expect(sendas()).toBe(0);
    const chosen = await manager.playerSetup.choose({ choice: "pick", avatarId: "mara.png" });
    expect(chosen).toMatchObject({ ok: true, choice: "pick", avatarId: "mara.png", name: "Mara", locked: true });
    expect(writes).toEqual(["select mara.png", "lock mara.png"]);
    expect(sendas()).toBe(1);
    expect(blob().stories.road.extras?.playerSetup).toMatchObject({ pending: false, storyId: "road", choice: "pick" });
  });

  it("a new chat in a bound group runs the same order: Before you start and identity, then the opener", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    mockContext.extensionSettings["story-orchestrator"].groupStories = { "group-a": "road" };
    mockContext.chatId = "chat-2";
    mockContext.chatMetadata = {};
    mockContext.chat = [];
    (executeSlashCommands as jest.Mock).mockClear();
    await manager.loadSelectedFromChat();
    expect(manager.getSnapshot().playerSetup?.pending).toBe(true);
    expect(sendas()).toBe(0);
    await manager.playerSetup.choose({ choice: "skip" });
    expect(sendas()).toBe(1);
    expect(mockPersonas.locked).toBe("max.png");
  });

  it("with the identity question switched off (the harness default) a player story auto-skips, still locks, and the opener posts", async () => {
    setGlobalSettings({ display: { playerSetup: false, briefing: false } });
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    expect(writes).toEqual(["lock max.png"]);
    expect(manager.getSnapshot().playerSetup).toMatchObject({ pending: false, needsPane: false, record: { choice: "skip" } });
    expect(sendas()).toBe(1);
    setGlobalSettings({ display: { playerSetup: true, briefing: true } });
  });

  it("briefings off: the identity pane is still due and still locks", async () => {
    setGlobalSettings({ display: { briefing: false } });
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    expect(manager.getSnapshot().briefing?.enabled).toBe(false);
    expect(manager.getSnapshot().playerSetup).toMatchObject({ pending: true, needsPane: true });
    await manager.playerSetup.choose({ choice: "keep" });
    expect(mockPersonas.locked).toBe("max.png");
    setGlobalSettings({ display: { briefing: true } });
  });

  it("a fixed name holds readiness and the opener until a persona with that name is locked", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: { ...PLAYER, name: { mode: "fixed", value: "Mara" } } }));
    expect(manager.getSnapshot().requirements).toMatchObject({ ready: false, missingFixedName: "Mara" });
    expect(manager.getSnapshot().playerSetup?.personas).toEqual([{ avatarId: "mara.png", name: "Mara" }]);
    await manager.playerSetup.choose({ choice: "keep" });
    expect(sendas()).toBe(0);
    await manager.playerSetup.choose({ choice: "pick", avatarId: "mara.png" });
    expect(manager.getSnapshot().requirements.ready).toBe(true);
    expect(sendas()).toBe(1);
  });

  it("create adds a marked persona whose description starts with the canonical line, then selects and locks it", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: { ...PLAYER, suggested_description: "Tall, quiet." } }));
    const description = createdPersonaDescription(manager.getSnapshot().playerSetup?.player ?? undefined);
    expect(description).toBe("In this story, {{user}} is a hired courier: You carry a sealed letter.\n\nTall, quiet.");
    await manager.playerSetup.choose({ choice: "create", name: "Rook", description });
    expect(writes).toEqual([`create Rook | Story: The Road | ${description}`, "select rook.png", "lock rook.png"]);
    expect(blob().stories.road.extras?.playerSetup).toMatchObject({ choice: "create", avatarId: "rook.png", createdHash: expect.any(String) });
  });

  it("rollback and reopen keep the setup; Restart re-offers it and writes a new lock", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    await manager.playerSetup.choose({ choice: "keep" });
    mockContext.chat = [{ mes: "posted" }, { mes: "hi", is_user: true }, { mes: "reply" }];
    await manager.commitBoundary();
    await manager.rollbackFromMessage(1);
    expect(manager.getSnapshot().playerSetup?.pending).toBe(false);

    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(reopened.getSnapshot().playerSetup).toMatchObject({ pending: false, lockedName: "Max", beforeFirstMessage: false });

    writes.length = 0;
    expect(await reopened.restartStory(true)).toBe(true);
    expect(reopened.getSnapshot().playerSetup?.pending).toBe(true);
    await reopened.playerSetup.choose({ choice: "pick", avatarId: "mara.png" });
    expect(writes).toEqual(["select mara.png", "lock mara.png"]);
  });

  it("a chat that played before this shipped is not interrupted: no record, nothing due", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    delete (blob().stories.road.extras as { playerSetup?: unknown }).playerSetup;
    const older = new RuntimeManager();
    await older.loadSelectedFromChat();
    expect(older.getSnapshot().playerSetup).toMatchObject({ pending: false, record: null });
  });

  it("a mid-story switch is reported and Switch back restores the locked persona", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    await manager.playerSetup.choose({ choice: "keep" });
    mockPersonas.avatarId = "mara.png";
    mockContext.name1 = "Mara";
    expect(manager.getSnapshot().playerSetup).toMatchObject({ switched: true, lockedName: "Max", current: { name: "Mara" } });
    expect((await manager.playerSetup.switchBack()).ok).toBe(true);
    expect(manager.getSnapshot().playerSetup?.switched).toBe(false);
  });

  it("control: a one-on-one chat loads no story, so no pane and no lock", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue(null);
    mockContext.groupId = null;
    const solo = new RuntimeManager();
    await solo.importStory(storyJson({ player: PLAYER }));
    expect(solo.getSnapshot().playerSetup ?? null).toBeNull();
    expect(writes).toEqual([]);
    expect(mockPersonas.locked).toBeNull();
  });

  const refusing = (reason = "the chat did not take the persona lock"): PersonaHost => ({ ...host, lock: async () => { writes.push("lock refused"); return { ok: false, reason }; } });
  const useHost = (next: PersonaHost | null) => {
    release();
    release = next ? installPersonaHost(next) : () => undefined;
  };

  it("Sol finding 4: a refused lock keeps identity pending, holds the opener, says why, and survives a reload", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    useHost(refusing());
    const outcome = await manager.playerSetup.choose({ choice: "pick", avatarId: "mara.png" });
    expect(outcome).toEqual({ ok: false, reason: "the chat did not take the persona lock" });
    expect(sendas()).toBe(0);
    expect(manager.getSnapshot().playerSetup).toMatchObject({ pending: true, record: { pending: true, choice: "pick", avatarId: "mara.png", locked: false, lockFailed: "the chat did not take the persona lock" } });
    expect(blob().stories.road.extras?.playerSetup).toMatchObject({ pending: true, lockFailed: "the chat did not take the persona lock" });
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(reopened.getSnapshot().playerSetup).toMatchObject({ pending: true, record: { lockFailed: "the chat did not take the persona lock" } });
    expect(sendas()).toBe(0);
  });

  it("Sol finding 4: Try again re-selects the chosen persona, locks it, and only then posts the opener", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    useHost(refusing());
    await manager.playerSetup.choose({ choice: "pick", avatarId: "mara.png" });
    mockPersonas.avatarId = "max.png";
    useHost(host);
    writes.length = 0;
    const retried = await manager.playerSetup.choose({ choice: "retry" });
    expect(retried).toMatchObject({ ok: true, choice: "pick", avatarId: "mara.png", locked: true });
    expect(writes).toEqual(["select mara.png", "lock mara.png"]);
    expect(manager.getSnapshot().playerSetup?.record).not.toHaveProperty("lockFailed");
    expect(sendas()).toBe(1);
  });

  it("Sol finding 4: the player may start without the lock, but only after being told, and it is recorded as unlocked", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    expect((await manager.playerSetup.choose({ choice: "unlocked" })).ok).toBe(false);
    useHost(refusing());
    await manager.playerSetup.choose({ choice: "keep" });
    expect(sendas()).toBe(0);
    const started = await manager.playerSetup.choose({ choice: "unlocked" });
    expect(started).toMatchObject({ ok: true, pending: false, locked: false, choice: "keep" });
    expect(started.ok && "lockFailed" in started).toBe(false);
    expect(sendas()).toBe(1);
  });

  it("Sol finding 4: with no persona host a pane-less story stays pending instead of starting unlocked, and a reload with the host retries", async () => {
    useHost(null);
    const manager = new RuntimeManager();
    await manager.importStory(storyJson());
    expect(manager.getSnapshot().playerSetup).toMatchObject({ pending: true, needsPane: false, record: { lockFailed: "SillyTavern's personas are not reachable from here" } });
    expect(sendas()).toBe(0);
    useHost(host);
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(writes).toEqual(["lock max.png"]);
    expect(reopened.getSnapshot().playerSetup).toMatchObject({ pending: false, record: { locked: true } });
    expect(sendas()).toBe(1);
  });

  it("Sol finding 5: a chat switch during the persona switch never locks, and the other chat's metadata is untouched", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    const other: Record<string, unknown> = { untouched: true };
    const stHostLike: PersonaHost = {
      ...host,
      select: async (avatarId, owns) => {
        mockContext.chatId = "elsewhere";
        mockContext.chatMetadata = other;
        await manager.loadSelectedFromChat();
        if (!owns()) return { ok: false, reason: "lapsed" };
        mockPersonas.avatarId = avatarId;
        return { ok: true, avatarId };
      },
      lock: async (owns) => {
        if (!owns()) return { ok: false, reason: "lapsed" };
        mockContext.chatMetadata.persona = mockPersonas.avatarId;
        writes.push(`lock ${mockPersonas.avatarId}`);
        return { ok: true, avatarId: mockPersonas.avatarId ?? "" };
      },
    };
    useHost(stHostLike);
    const outcome = await manager.playerSetup.choose({ choice: "pick", avatarId: "mara.png" });
    expect(outcome.ok).toBe(false);
    expect(other).not.toHaveProperty("persona");
    expect(other).toMatchObject({ untouched: true, story_orchestrator: { chatId: "elsewhere", stories: {} } });
    expect(writes.filter((entry) => entry.startsWith("lock"))).toEqual([]);
    expect(mockPersonas.avatarId).toBe("max.png");
  });

  it("B0-live F12: closing the start page after Keep never re-records the settled choice as skip", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    await manager.playerSetup.choose({ choice: "keep" });
    writes.length = 0;
    const late = await manager.playerSetup.choose({ choice: "skip" });
    expect(late).toEqual({ ok: false, reason: "the identity step is already settled" });
    expect(writes).toEqual([]);
    expect(manager.getSnapshot().playerSetup?.record).toMatchObject({ pending: false, choice: "keep", locked: true });
    expect(sendas()).toBe(1);
  });

  it("B0-live F12: closing the start page after Start without keeping it never retries the lock", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    useHost(refusing());
    await manager.playerSetup.choose({ choice: "pick", avatarId: "mara.png" });
    await manager.playerSetup.choose({ choice: "unlocked" });
    writes.length = 0;
    expect(await manager.playerSetup.choose({ choice: "retry" })).toEqual({ ok: false, reason: "the identity step is already settled" });
    expect(writes).toEqual([]);
    expect(manager.getSnapshot().playerSetup?.record).toMatchObject({ pending: false, locked: false, choice: "pick" });
    expect(manager.getSnapshot().playerSetup?.record).not.toHaveProperty("lockFailed");
    expect(sendas()).toBe(1);
  });

  it("control: a pending step still takes skip and retry", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    expect(await manager.playerSetup.choose({ choice: "skip" })).toMatchObject({ ok: true, choice: "skip", locked: true });
    expect(sendas()).toBe(1);
  });

  it("control: a choice whose chat changed before it was saved records nothing", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(storyJson({ player: PLAYER }));
    const slow: PersonaHost = { ...host, lock: async () => { mockContext.chatId = "elsewhere"; await manager.loadSelectedFromChat(); return { ok: true, avatarId: "max.png" }; } };
    release();
    release = installPersonaHost(slow);
    const outcome = await manager.playerSetup.choose({ choice: "keep" });
    expect(outcome.ok).toBe(false);
    expect(sendas()).toBe(0);
  });
});
