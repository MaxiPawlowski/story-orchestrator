import { settleTurns } from "../../test/support/settle";
import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { messageKey } from "./messageIdentity";
import { repairThoughtLeak } from "./thoughtLeak";
import { rewriteReplyText } from "@services/stHost/chatMessages";


interface Row { name: string; is_user: boolean; mes: string; is_system?: boolean; swipe_id?: number; swipes?: string[]; send_date?: string; extra?: Record<string, unknown> }

const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
const mockContext = {
  chat: [] as Row[],
  groupId: "g-test", chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/stHost/context", () => ({ getContext: () => mockContext }));

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  getContext: () => mockContext,
  saveOpenChat: async () => { await (mockContext).saveMetadata?.(); return { ok: true as const, chatId: "" }; },
  setStoryExtensionPrompt: () => undefined,
  clearStoryExtensionPrompt: () => undefined,
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => ({ ok: true, changed: false })),
  enableWIEntry: jest.fn(async () => ({ ok: true, changed: false })),
  lorebookExists: () => false,
  upsertWIEntry: jest.fn(async () => "created"),
  ensureLorebook: jest.fn(async (name: string) => ({ name, created: false })),
  loadLorebook: jest.fn(async () => ({ name: "mirror", entries: {} })),
  bindChatLorebook: jest.fn(() => "bound"),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => undefined),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => true),
  setGroupMembersDisabled: jest.fn(async () => ({ ok: true, group: "g1" })),
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: jest.fn(async () => ({ requested: true, status: 200, ok: true, timedOut: false })),
  readServerBoundary: async () => null,
  applyPreset: jest.fn(() => ({ ok: true, name: "P" })),
  presetBackend: () => "textgenerationwebui",
  readAppliedPreset: () => null,
  getActiveGroup: () => null,
  resolveGroupMemberId: () => null,
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(() => ({ close: () => undefined })),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHandlers.set(entry.eventName, entry.handler);
    return () => mockHandlers.clear();
  },
}));

const story = {
  format: 2,
  id: "leak-story",
  title: "Leak receipt story",
  description: "Thought-leak receipt fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const line = (index: number, text = `line ${index}`): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: text, send_date: `t${index}` });

type Outcome = { seq: number; result: string; fromMessage: number | null } | null | undefined;
const lastOutcome = (manager: RuntimeManager): Outcome => (manager as unknown as { notices: { lastOutcome?: Outcome } }).notices.lastOutcome;
const journalSummaries = (manager: RuntimeManager) => (manager as unknown as { extras: { journal: Array<{ summary: string }> } }).extras.journal.map((record) => record.summary);
const settle = () => settleTurns(20);

const SUFFIX = "<channel|>";
const THOUGHT = "Plan: one line, then stop.";
const LEAKED = `keep it short, no lines for the player.${SUFFIX}*The clerk bolts the door.* "Sit."`;
const REPAIRED = "*The clerk bolts the door.* \"Sit.\"";
const ALT = "*The clerk shrugs.*";

type Order = { repair: "before-bridge" | "after-bridge"; render: "same-tick" | "after-boundary" };
const ORDERS: Order[] = [
  { repair: "before-bridge", render: "same-tick" }, { repair: "after-bridge", render: "same-tick" },
  { repair: "before-bridge", render: "after-boundary" }, { repair: "after-bridge", render: "after-boundary" },
];

const repair = (messageId: number) => {
  const row = mockContext.chat[messageId];
  const fixed = repairThoughtLeak(row.mes, String(row.extra?.reasoning ?? ""), SUFFIX);
  if (fixed) rewriteReplyText(messageId, fixed);
};

async function received(order: Order) {
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  const bridge = new TurnBridge(manager, manager.chatSave);
  bridge.start();
  const emit = async (name: string, ...args: unknown[]) => { await mockHandlers.get(name)?.(...args); };
  mockContext.chat.push(line(2), { name: "Arin", is_user: false, mes: LEAKED, send_date: "t3", swipe_id: 0, swipes: [LEAKED, ALT], extra: { reasoning: THOUGHT } });
  const before = lastOutcome(manager);
  if (order.repair === "before-bridge") repair(3);
  await emit("MESSAGE_RECEIVED", 3, "normal");
  if (order.repair === "after-bridge") repair(3);
  if (order.render === "after-boundary") await settle();
  await emit("CHARACTER_MESSAGE_RENDERED", 3, "normal");
  await settle();
  mockContext.chat.push(line(4));
  await manager.commitBoundary();
  await settle();
  return { manager, bridge, before };
}

const identityKeys = (bridge: TurnBridge) => (bridge as unknown as { identity: { snapshot: { keys: string[] } | null } }).identity.snapshot?.keys ?? [];

describe("v2.8 69 K6: a thought-leak repair at receipt is a normalisation, not a rewrite", () => {
  it.each(ORDERS)("repair $repair, render $render: no rollback, no eventless-change journal, identity is the repaired message", async (order) => {
    const { manager, bridge, before } = await received(order);
    expect(mockContext.chat[3].mes).toBe(REPAIRED);
    expect(lastOutcome(manager)).toEqual(before);
    expect(journalSummaries(manager).filter((summary) => summary.startsWith("eventless change"))).toEqual([]);
    expect(manager.getEngineState()?.lastMessageId).toBe(4);
    expect(identityKeys(bridge)[3]).toBe(messageKey(mockContext.chat[3]));
    expect(manager.chatSave.unchanged(3)).toBe(true);
  });

  it.each(ORDERS)("repair $repair, render $render: swiping left and back keeps the repaired text", async (order) => {
    const { manager } = await received(order);
    const swipeTo = async (id: number) => {
      const row = mockContext.chat[3];
      mockContext.chat[3] = { ...row, swipe_id: id, mes: row.swipes![id] };
      await mockHandlers.get("MESSAGE_SWIPED")?.(3);
      await settle();
    };
    await swipeTo(1);
    await swipeTo(0);
    expect(mockContext.chat[3].mes).toBe(REPAIRED);
    expect(mockContext.chat[3].swipes?.[0]).toBe(REPAIRED);
    expect(manager.getEngineState()?.activeCheckpointId).toBe("start");
  });

  it("control: a genuine later rewrite of the same reply (different visible text, no event) rolls back once at the next boundary", async () => {
    const { manager, before } = await received(ORDERS[0]);
    mockContext.chat[3] = { ...mockContext.chat[3], mes: "*A different reply entirely.*" };
    mockContext.chat.push(line(5));
    await manager.commitBoundary();
    expect(lastOutcome(manager)).toMatchObject({ fromMessage: 3, seq: (before?.seq ?? 0) + 1 });
    expect(journalSummaries(manager).filter((summary) => summary === "eventless change at message 3")).toHaveLength(1);
    mockContext.chat.push(line(6));
    await manager.commitBoundary();
    expect(journalSummaries(manager).filter((summary) => summary === "eventless change at message 3")).toHaveLength(1);
  });
});

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-a" };
  mockContext.extensionSettings = {};
});
