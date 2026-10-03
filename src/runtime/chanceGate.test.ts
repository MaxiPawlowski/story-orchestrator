import { dieFace, unitDraw } from "@engine/chance";
import { RuntimeManager } from "./runtimeManager";

const mockContext = {
  chat: [] as Array<{ mes: string; name?: string; is_user?: boolean }>,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  groupId: "g-test", chatId: "chat-sp7",
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

const spoken: string[] = [];

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  settingsAreLoaded: () => true,
  readProfileContextLimit: () => ({ value: 8192, source: "default", reason: "no memory model profile is selected" }),
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => mockContext,
  saveOpenChat: async () => { await mockContext.saveMetadata(); return { ok: true as const, chatId: "" }; },
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  disableWIEntry: jest.fn(async () => undefined),
  enableWIEntry: jest.fn(async () => undefined),
  lorebookExists: () => false,
  upsertWIEntry: jest.fn(async () => "created"),
  ensureLorebook: jest.fn(async () => null),
  loadLorebook: jest.fn(async () => null),
  bindChatLorebook: jest.fn(() => "no-chat"),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => { throw new Error("no vectors in jest"); }),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async (command: string) => { spoken.push(command); return { pipe: "" }; }),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  getActiveGroup: jest.fn(() => null),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(async () => undefined),
}));

const STORY_ID = "sp7-prod";

const story = {
  format: 2,
  id: STORY_ID,
  title: "Chance gate in prod",
  description: "SP7.b: a seeded roll routes the story on a prod build, with no spike flag.",
  qualities: [
    { key: "met", type: "bool", source: "extractor", rubric: "Have the drones broken out of the rock at the party?" },
    { key: "swarm", type: "bool", source: "code", rubric: "Seeded chance: does a swarm cut off the way back?", roll: { sides: 2, target: 1 } },
  ],
  checkpoints: [
    { id: "tunnels", name: "The Tunnels", objective: "Go deeper.", type: "anchor", start: true,
      effects: { npc_replies: [{ trigger: "afterSpeak", member: "corin", kind: "scripted", text: "Corin listens.", probability: 0.5, maxTriggers: 5 }] } },
    { id: "the-swarm", name: "The Swarm", objective: "Fight through.", type: "anchor" },
    { id: "into-the-dark", name: "Into the Dark", objective: "Press on.", type: "anchor" },
  ],
  transitions: [
    { from: "tunnels", to: "the-swarm", priority: 2, gate: { all: [{ q: "swarm", op: "==", v: true }, { q: "met", op: "==", v: true }] } },
    { from: "tunnels", to: "into-the-dark", priority: 1, gate: { all: [{ q: "swarm", op: "==", v: false }, { q: "met", op: "==", v: true }] } },
  ],
  roster: [{ id: "corin", name: "Corin" }, { id: "narrator", name: "Narrator" }],
};

const PLAYER_LINE = "Drones burst out of the rock at us, mandibles clicking.";
const MET = `DELTA q=met value=true evidence="${PLAYER_LINE}"`;

const drawnSwarm = (chatId: string) => dieFace(2, unitDraw([chatId, STORY_ID, 0, "swarm"])) <= 1;
const chatDrawing = (value: boolean) => {
  for (let index = 0; index < 64; index += 1) if (drawnSwarm(`chat-sp7-${index}`) === value) return `chat-sp7-${index}`;
  throw new Error(`no chat draws ${value}`);
};

const start = async (chatId: string) => {
  mockContext.chatId = chatId;
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  mockContext.chat = [{ mes: "The tunnels narrow.", name: "Narrator" }];
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story));
  return manager;
};

const meet = async (manager: RuntimeManager) => {
  mockContext.chat.push({ mes: PLAYER_LINE, name: "Max", is_user: true });
  await manager.runExtractionNow(MET);
};

const expectedBranch = (value: boolean) => (value ? "the-swarm" : "into-the-dark");

describe("SP7.b: a roll gate plays on a prod build (no spike flag)", () => {
  beforeEach(() => { spoken.length = 0; });

  it.each([true, false])("the committed draw (%s) routes the story, and the blackboard carries it", async (value) => {
    const manager = await start(chatDrawing(value));
    await meet(manager);
    expect(manager.getSnapshot().blackboard.swarm).toBe(value);
    expect(manager.getSnapshot().activeCheckpointId).toBe(expectedBranch(value));
  });

  it("rollback + replay draws the same value and takes the same branch", async () => {
    for (const value of [true, false]) {
      const manager = await start(chatDrawing(value));
      await meet(manager);
      mockContext.chat.length = 1;
      await manager.rollbackFromMessage(1);
      expect(manager.getSnapshot().activeCheckpointId).toBe("tunnels");
      await meet(manager);
      expect(manager.getSnapshot().blackboard.swarm).toBe(value);
      expect(manager.getSnapshot().activeCheckpointId).toBe(expectedBranch(value));
    }
  });

  it("a reopened chat reads the same draw it committed", async () => {
    const chatId = chatDrawing(true);
    await meet(await start(chatId));
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(reopened.getSnapshot().activeCheckpointId).toBe("the-swarm");
    expect(reopened.getSnapshot().blackboard.swarm).toBe(true);
  });

  it("the NPC reply probability rolls on the seed, not Math.random", async () => {
    const random = jest.spyOn(Math, "random");
    const manager = await start("chat-sp7-npc");
    await manager.fireAfterSpeak();
    const note = manager.getSessionJournal().map((event) => `${event.summary} ${JSON.stringify(event.detail ?? {})}`).find((line) => line.includes("by its roll")) ?? "";
    const match = /rolled ([\d.]+) against 0\.5 at ([^\s"]+)/.exec(note);
    expect(match).not.toBeNull();
    const boundary = manager.getEngineState()?.boundary ?? -1;
    expect(match?.[1]).toBe(unitDraw(["chat-sp7-npc", STORY_ID, boundary, match?.[2] ?? ""]).toFixed(3));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("the talk pick is seeded by chat, story and boundary", async () => {
    const manager = await start("chat-sp7-talk");
    const first = manager.chance.talkRandom();
    const again = manager.chance.talkRandom();
    expect(first).not.toBeNull();
    expect([first?.(), first?.()]).toEqual([again?.(), again?.()]);
  });
});
