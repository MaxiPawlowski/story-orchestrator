import type { SharedReadAudit } from "@extraction/index";
import { RuntimeManager } from "./runtimeManager";

const mockContext = {
  chat: [] as Array<{ mes: string; name?: string; is_user?: boolean }>,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  chatId: "chat-t0-3",
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

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
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  getActiveGroup: jest.fn(() => null),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(async () => undefined),
}));

const COMMIT = "\\b(?:take|takes|taking|took|taken|accept(?:s|ed|ing)?|sign(?:s|ed|ing)?|agree(?:s|d)?|agreeing|commit(?:s|ted|ting)?|we'?ll (?:go|do it|come|ride|join)|i'?ll (?:go|do it|come|ride|join)|count (?:us|me) in|we'?re in|i'?m in)\\b";

const story = {
  format: 2,
  id: "adventurer-t0",
  title: "Adventurer T0",
  description: "T0-3 commit evidence after an edit rollback.",
  qualities: [
    { key: "path", type: "enum", values: ["wendhope"], source: "extractor", latching: true, evidence_from: "any", commit_evidence: COMMIT,
      rubric: "Which posting has the party committed to? Answer wendhope once the player takes the Investigate Wendhope job." },
    { key: "party_name", type: "string", source: "extractor", latching: true, rubric: "The party's registered name." },
  ],
  checkpoints: [
    { id: "guild-hall", name: "The Guild Hall", objective: "Pick a posting.", type: "anchor", start: true },
    { id: "road-to-wendhope", name: "The Road North", objective: "Travel to Wendhope.", type: "anchor" },
  ],
  transitions: [{ from: "guild-hall", to: "road-to-wendhope", priority: 1,
    gate: { all: [{ q: "path", op: "==", v: "wendhope" }, { q: "party_name", op: "!=", v: "" }] } }],
  roster: [{ id: "tobias", name: "Tobias" }, { id: "ellie", name: "Ellie" }, { id: "narrator", name: "Adolion Narrator" }],
};

const player = (mes: string) => ({ mes, name: "Max Nightriver", is_user: true });
const said = (name: string, mes: string) => ({ mes, name });
const TOBIAS_HANDS_OVER = "Tobias gives a short, sharp nod. He reaches over and pulls the Wendhope notice from the board, rolling it up and handing it to you. \"Your posting.\"";
const npcQuotedRead = (pathEvidence: string) =>
  `DELTA q=path value="wendhope" evidence="${pathEvidence}"\nDELTA q=party_name value="Ash Lanterns" evidence="Ash Lanterns"`;

const start = async () => {
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  mockContext.chat = [said("Adolion Narrator", "The Guild hall is loud. The Wendhope posting is pinned to the board.")];
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story));
  return manager;
};

const heldReadings = (manager: RuntimeManager) =>
  manager.getSessionJournal().filter((event) => event.summary.includes("commitment reading(s) held")).length;

describe("T0-3: a re-accepted job after an edit rollback advances the story", () => {
  it("accept, edit to a refusal, step back, re-accept with the reader quoting the NPC: the story moves on", async () => {
    const manager = await start();
    mockContext.chat.push(player("I tap the Wendhope posting. \"This one. We take Wendhope. Write us down as the Ash Lanterns.\""));
    mockContext.chat.push(said("Ellie", "\"Ash Lanterns.\" Ellie's pen scratches the name into the register."));
    await manager.runExtractionNow('DELTA q=path value="wendhope" evidence="This one. We take Wendhope."\nDELTA q=party_name value="Ash Lanterns" evidence="Write us down as the Ash Lanterns"');
    expect(manager.getSnapshot().activeCheckpointId).toBe("road-to-wendhope");

    mockContext.chat[1] = player("I read the Wendhope posting twice. \"Actually, no. Not for that money. Something's wrong with a village that pays that much.\"");
    await manager.rollbackFromMessage(1);
    expect(manager.getSnapshot().activeCheckpointId).toBe("guild-hall");
    expect(manager.getSnapshot().blackboard.path).toBeUndefined();

    mockContext.chat.push(said("Tobias", "\"No.\" Tobias's voice is flat. \"The Guild advances nothing.\""));
    mockContext.chat.push(player("I sigh and look back at the board. \"Fine, we'll do it. Ash Lanterns. Let's ride north.\""));
    mockContext.chat.push(said("Tobias", TOBIAS_HANDS_OVER));
    await manager.runExtractionNow(npcQuotedRead("Tobias gives a short, sharp nod. He reaches over and pulls the Wendhope notice from the board"));

    expect(heldReadings(manager)).toBe(0);
    expect(manager.getSnapshot().activeCheckpointId).toBe("road-to-wendhope");
  });

  it("T0-1: a later read over the same turns that rejects or omits the commitment does not supersede it", async () => {
    const manager = await start();
    mockContext.chat.push(player("\"We'll take the Wendhope job. Put us down as the Ash Lanterns.\""));
    mockContext.chat.push(said("Tobias", TOBIAS_HANDS_OVER));
    const audit = (id: string, from: number, deltas: SharedReadAudit["acceptedDeltas"]): SharedReadAudit => ({ id, createdAt: "2026-10-01T11:49:05.000Z",
      priority: 0, reason: id, contractHash: "h", scope: ["path", "party_name"], window: { from, to: 2 }, prompt: "", rawResponse: "", acceptedDeltas: deltas, rejected: [] });
    await manager.applyExtractionAudit(audit("scene:time_skip", 1, [{ delta: { q: "path", v: "wendhope", source: "extractor" }, evidence: "We'll take the Wendhope job." }]), []);
    await manager.applyExtractionAudit(audit("reconcile:path", 0, [{ delta: { q: "party_name", v: "Ash Lanterns", source: "extractor" }, evidence: "Ash Lanterns" }]), []);
    await manager.commitBoundary();
    expect(manager.getSnapshot().blackboard.path).toBe("wendhope");
    expect(manager.getSnapshot().activeCheckpointId).toBe("road-to-wendhope");
  });

  it("an NPC saying the party agreed does not commit the player", async () => {
    const manager = await start();
    mockContext.chat.push(player("\"What does the Wendhope job pay? We're the Ash Lanterns, by the way.\""));
    mockContext.chat.push(said("Tobias", "\"So you've agreed then. Good. Ash Lanterns it is.\""));
    await manager.runExtractionNow(npcQuotedRead("So you've agreed then."));
    expect(heldReadings(manager)).toBe(1);
    expect(manager.getSnapshot().activeCheckpointId).toBe("guild-hall");
  });

  it("narration of the player accepting does not commit the player", async () => {
    const manager = await start();
    mockContext.chat.push(player("\"Hm. Ash Lanterns, if anyone asks.\""));
    mockContext.chat.push(said("Adolion Narrator", "Max nods and accepts the Wendhope posting."));
    await manager.runExtractionNow(npcQuotedRead("Max nods and accepts the Wendhope posting."));
    expect(heldReadings(manager)).toBe(1);
    expect(manager.getSnapshot().activeCheckpointId).toBe("guild-hall");
  });
});
