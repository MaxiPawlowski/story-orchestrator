import { settleTurns } from "../../test/support/settle";
import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { installPolish } from "./polish/install";
import { observeRenderedReasoning, withoutStaleReasoning } from "./reasoningRevision";
import { messageRevision } from "./yourMove";

interface Row { name: string; is_user: boolean; mes: string; is_system?: boolean; swipe_id?: number; swipes?: string[]; send_date?: string; extra?: Record<string, unknown> }

const mockHandlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
const mockContext = {
  chat: [] as Row[],
  groupId: "g-test", chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/stHost/context", () => ({ getContext: () => mockContext, getPlayerName: () => "Ren" }));

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  getContext: () => mockContext,
  getPlayerName: () => "Ren",
  profileExists: () => false,
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
    for (const entry of entries) mockHandlers.set(entry.eventName, [...(mockHandlers.get(entry.eventName) ?? []), entry.handler]);
    return () => {
      for (const entry of entries) mockHandlers.set(entry.eventName, (mockHandlers.get(entry.eventName) ?? []).filter((handler) => handler !== entry.handler));
    };
  },
}));

const story = {
  id: "polish-s0",
  title: "Polish S0 story",
  description: "Stand-in polish timing fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const ORIGINAL = "*The clerk smirks and bolts the door.* \"Sit.\"";
const POLISHED = "*The clerk grins and bolts the door.* \"Sit.\"";
const ALT = "*The clerk shrugs.*";
const THOUGHT = "Plan: one line, then stop.";

type Outcome = { seq: number; result: string; fromMessage: number | null } | null | undefined;
const lastOutcome = (manager: RuntimeManager): Outcome => (manager as unknown as { notices: { lastOutcome?: Outcome } }).notices.lastOutcome;
const journalSummaries = (manager: RuntimeManager) => (manager as unknown as { extras: { journal: Array<{ summary: string }> } }).extras.journal.map((record) => record.summary);
const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
const emit = (name: string, ...args: unknown[]) => { for (const handler of mockHandlers.get(name) ?? []) void handler(...args); };
const line = (index: number): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: `line ${index}`, send_date: `t${index}` });
const reply = (mes = ORIGINAL, send = "t3"): Row => ({ name: "Clerk", is_user: false, mes, send_date: send, swipe_id: 0, swipes: [mes, ALT], extra: { reasoning: THOUGHT } });

type Order = { polish: "before-bridge" | "after-bridge"; render: "same-tick" | "after-boundary" };
const ORDERS: Order[] = [
  { polish: "before-bridge", render: "same-tick" }, { polish: "after-bridge", render: "same-tick" },
  { polish: "before-bridge", render: "after-boundary" }, { polish: "after-bridge", render: "after-boundary" },
];

async function setup(order: Order = ORDERS[0], delayMs = 25) {
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  const bridge = new TurnBridge(manager, manager.chatSave);
  globalThis.storyOrchestratorDebugPolishStandIn = { delayMs, find: "smirks", replace: "grins" };
  let release = () => {};
  if (order.polish === "before-bridge") release = installPolish(bridge, manager);
  bridge.start();
  if (order.polish === "after-bridge") release = installPolish(bridge, manager);
  const seenBySpeak: string[] = [];
  const fire = manager.fireAfterSpeak.bind(manager);
  jest.spyOn(manager, "fireAfterSpeak").mockImplementation(async () => { seenBySpeak.push(mockContext.chat[3]?.mes ?? ""); await fire(); });
  return { manager, bridge, seenBySpeak, release };
}

async function receive(order: Order, during?: () => void) {
  const ctx = await setup(order);
  mockContext.chat.push(line(2), reply());
  const before = lastOutcome(ctx.manager);
  emit("MESSAGE_RECEIVED", 3, "normal");
  if (order.render === "same-tick") { observeRenderedReasoning(mockContext.chat[3]); emit("CHARACTER_MESSAGE_RENDERED", 3, "normal"); }
  during?.();
  await wait(60);
  await settleTurns(20);
  if (order.render === "after-boundary") { observeRenderedReasoning(mockContext.chat[3]); emit("CHARACTER_MESSAGE_RENDERED", 3, "normal"); await settleTurns(20); }
  return { ...ctx, before };
}

const stats = () => globalThis.storyOrchestratorPolish?.standIn();

describe("v2.9 plan 03 S0: a stand-in polish lands before fireAfterSpeak and the boundary (four listener orders)", () => {
  it.each(ORDERS)("polish $polish, render $render: the NPC-reply pass and the commit read the polished text, no rollback, no eventless journal", async (order) => {
    const { manager, seenBySpeak, before } = await receive(order);
    expect(mockContext.chat[3].mes).toBe(POLISHED);
    expect(seenBySpeak).toEqual([POLISHED]);
    expect(manager.getEngineState()?.lastMessageId).toBe(3);
    expect(manager.chatSave.unchanged(3)).toBe(true);
    mockContext.chat.push(line(4));
    await manager.commitBoundary();
    expect(lastOutcome(manager)).toEqual(before);
    expect(journalSummaries(manager).filter((summary) => summary.startsWith("eventless change"))).toEqual([]);
    expect(stats()).toMatchObject({ written: 1, abandoned: {} });
  });

  it("swiping left and back shows the polished swipe", async () => {
    const { manager } = await receive(ORDERS[0]);
    const swipeTo = async (id: number) => {
      const row = mockContext.chat[3];
      mockContext.chat[3] = { ...row, swipe_id: id, mes: row.swipes![id] };
      emit("MESSAGE_SWIPED", 3);
      await settleTurns(20);
    };
    await swipeTo(1);
    await swipeTo(0);
    expect(mockContext.chat[3].mes).toBe(POLISHED);
    expect(manager.getEngineState()?.activeCheckpointId).toBe("start");
  });
});

describe("v2.9 plan 03 S0: the consumption ledger abandons on every trigger", () => {
  it.each<[string, string, () => void]>([
    ["a quiet generation", "generation-started", () => emit("GENERATION_STARTED", "quiet", {}, false)],
    ["a third party's generation", "generation-started", () => emit("GENERATION_STARTED", "normal", { source: "third-party" }, false)],
    ["the next group member's start", "generation-started", () => emit("GENERATION_STARTED", "normal", {}, false)],
    ["the player answering", "player-sent", () => emit("MESSAGE_SENT", 4)],
    ["an edit of the row (the edit wins)", "row-mutated", () => { mockContext.chat[3] = { ...mockContext.chat[3], mes: "*Edited by hand.*" }; emit("MESSAGE_EDITED", 3); }],
    ["a stop on that row", "generation-stopped", () => emit("GENERATION_STOPPED")],
    ["a row replaced without an event", "write-mismatch", () => { mockContext.chat[3] = { ...mockContext.chat[3] }; }],
  ])("%s", async (_label, reason, during) => {
    await receive(ORDERS[0], during);
    expect(mockContext.chat[3].mes).not.toBe(POLISHED);
    expect(stats()?.abandoned).toEqual({ [reason]: 1 });
    expect(stats()?.written).toBe(0);
  });

  it("the hold deadline", async () => {
    const real = Date.now;
    await receive(ORDERS[0], () => { const start = real(); jest.spyOn(Date, "now").mockImplementation(() => start + 60000); });
    (Date.now as jest.Mock).mockRestore?.();
    expect(mockContext.chat[3].mes).toBe(ORIGINAL);
    expect(stats()?.abandoned).toEqual({ deadline: 1 });
  });

  it("a dry run does not consume the original (control)", async () => {
    await receive(ORDERS[0], () => emit("GENERATION_STARTED", "normal", {}, true));
    expect(mockContext.chat[3].mes).toBe(POLISHED);
  });
});

describe("v2.9 plan 03 S0: continue, carry and revision census", () => {
  it("a continue polishes only the continued suffix", async () => {
    const { manager } = await setup();
    globalThis.storyOrchestratorDebugPolishStandIn = { delayMs: 5, find: "zzz", replace: "grins" };
    mockContext.chat.push(line(2), reply("*The clerk smirks.*"));
    emit("MESSAGE_RECEIVED", 3, "normal");
    await wait(30);
    await settleTurns(20);
    globalThis.storyOrchestratorDebugPolishStandIn = { delayMs: 5, find: "smirks", replace: "grins" };
    const row = mockContext.chat[3];
    row.mes = `${row.mes} *She smirks again.*`;
    row.swipes![0] = row.mes;
    (row as Row & { gen_finished?: number }).gen_finished = 2;
    emit("MESSAGE_RECEIVED", 3, "continue");
    await wait(30);
    await settleTurns(20);
    expect(mockContext.chat[3].mes).toBe("*The clerk smirks.* *She grins again.*");
    expect(manager.getEngineState()?.lastMessageId).toBe(3);
  });

  it("P0 baseline: every stand-in write hides that reply's reasoning from carry and harvest (K6b)", async () => {
    await receive(ORDERS[0]);
    const filtered = withoutStaleReasoning([mockContext.chat[3]]) as Row[];
    expect(filtered[0].extra?.reasoning).toBeUndefined();
    expect(mockContext.chat[3].extra?.reasoning).toBe(THOUGHT);
    expect(stats()?.carryHides).toBe(1);
  });

  it("K13: a polish is a new revision for every revision-keyed consumer", async () => {
    const original = messageRevision(reply());
    await receive(ORDERS[0]);
    expect(messageRevision(mockContext.chat[3])).not.toEqual(original);
    expect(messageRevision(mockContext.chat[3])?.swipeId).toBe(original?.swipeId);
  });

  it("without the stand-in seam set, nothing holds and nothing is written (control)", async () => {
    const { seenBySpeak } = await setup();
    globalThis.storyOrchestratorDebugPolishStandIn = undefined;
    mockContext.chat.push(line(2), reply());
    emit("MESSAGE_RECEIVED", 3, "normal");
    await settleTurns(20);
    expect(seenBySpeak).toEqual([ORIGINAL]);
    expect(mockContext.chat[3].mes).toBe(ORIGINAL);
  });
});

let releases: Array<() => void> = [];

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-a" };
  mockContext.extensionSettings = {};
  releases.forEach((release) => release());
  releases = [];
});

afterEach(() => {
  globalThis.storyOrchestratorDebugPolishStandIn = undefined;
  jest.restoreAllMocks();
});
