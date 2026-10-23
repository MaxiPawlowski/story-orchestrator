import { loadGameLayer } from "@engine/validate/gameLayer";
import { settleTurns } from "../../test/support/settle";
import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { installPolish } from "./polish/install";
import type { PolishRecord } from "./polish/ring";
import { hydrateExtras } from "./extras";
import { defaultGlobalSettings } from "./settingsModel";

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

const story = (polish?: Record<string, unknown>, enabled = true) => ({
  id: "polish-s2",
  title: "Polish shadow story",
  description: "Shadow polish fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [{ id: "clerk", name: "Clerk", polish: { avoid: ["indeed"], tics: ["smirks"], ...(enabled ? {} : { enabled: false }) } }],
  ...(polish ? { polish } : {}),
});

const REPLY = "*The clerk bolts the door.* \"Sit.\" Her voice stays, indeed, low and even as the lamps gutter.";
const GOOD = "[1] Her voice stays low and even as the lamps gutter.";
const line = (index: number): Row => ({ name: index % 2 ? "Clerk" : "Player", is_user: index % 2 === 0, mes: `line ${index}`, send_date: `t${index}` });
const ring = (manager: RuntimeManager): PolishRecord[] => (manager as unknown as { extras: { polish?: PolishRecord[] } }).extras.polish ?? [];
const emit = (name: string, ...args: unknown[]) => { for (const handler of mockHandlers.get(name) ?? []) void handler(...args); };

async function receive(options: { polish?: Record<string, unknown>; enabled?: boolean; answer?: string | null } = {}) {
  await loadGameLayer();
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story(options.polish, options.enabled ?? true)));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  const bridge = new TurnBridge(manager, manager.chatSave);
  bridge.start();
  const model = jest.spyOn(manager.polishHost.port.lifecycle, "model");
  releases.push(installPolish(bridge, manager), () => bridge.stop());
  globalThis.storyOrchestratorDebugPolishResponse = options.answer === undefined ? GOOD : options.answer;
  mockContext.chat.push(line(2), { name: "Clerk", is_user: false, mes: REPLY, send_date: "t3", swipe_id: 0, swipes: [REPLY], extra: { reasoning: "Keep it short." } });
  emit("MESSAGE_RECEIVED", 3, "normal");
  await settleTurns(30);
  return { manager, model };
}

describe("v2.9 plan 03 S2: shadow polish records, never writes", () => {
  it("records the accepted rewrite of the finding sentence and leaves the chat untouched", async () => {
    const { manager } = await receive();
    expect(mockContext.chat[3].mes).toBe(REPLY);
    expect(mockContext.chat[3].extra?.reasoning).toBe("Keep it short.");
    const [row] = ring(manager);
    expect(row).toMatchObject({ messageId: 3, speaker: "Clerk", mode: "shadow", verdict: "accepted", findings: [{ kind: "avoid", phrase: "indeed" }] });
    expect(row.windows).toEqual([{ before: "Her voice stays, indeed, low and even as the lamps gutter.", after: "Her voice stays low and even as the lamps gutter." }]);
    expect(manager.getEngineState()?.lastMessageId).toBe(3);
  });

  it("records a guard refusal with its codes", async () => {
    const { manager } = await receive({ answer: "[1] Her voice never stays low and even as the lamps gutter." });
    expect(ring(manager)[0]).toMatchObject({ verdict: "refused", refusals: expect.arrayContaining(["negation-changed"]) });
  });

  it("with no route of its own it never calls a model: the play model is never the fallback", async () => {
    const { manager, model } = await receive({ answer: null });
    expect(model).not.toHaveBeenCalled();
    expect(ring(manager)[0]).toMatchObject({ verdict: "no-route" });
  });

  it("respects the hourly cap", async () => {
    mockContext.extensionSettings = { "story-orchestrator": { settings: { characters: { polishMaxPerHour: 0 } } } };
    const { manager, model } = await receive();
    expect(model).not.toHaveBeenCalled();
    expect(ring(manager)[0]).toMatchObject({ verdict: "rate-limited" });
  });

  it.each<[string, { polish?: Record<string, unknown>; enabled?: boolean }]>([
    ["the story sets polish off", { polish: { mode: "off" } }],
    ["the member's sheet is switched off", { enabled: false }],
  ])("does nothing when %s", async (_label, options) => {
    const { manager, model } = await receive(options);
    expect(model).not.toHaveBeenCalled();
    expect(ring(manager)).toEqual([]);
  });

  it("does nothing when the install switches reply polish off", async () => {
    mockContext.extensionSettings = { "story-orchestrator": { settings: { characters: { polish: false } } } };
    const { manager, model } = await receive();
    expect(model).not.toHaveBeenCalled();
    expect(ring(manager)).toEqual([]);
  });
});

describe("v2.9 plan 03 S2: the polish ring", () => {
  const record = (messageId: number): PolishRecord => ({ messageId, sendDate: "t", swipeId: 0, speaker: "Clerk", mode: "shadow", at: "x", verdict: "accepted", findings: [] });

  it("a rollback drops the rows at or after the message, like the other rings", async () => {
    const { manager } = await receive();
    expect(ring(manager).map((row) => row.messageId)).toEqual([3]);
    await manager.rollbackFromMessage(3);
    expect(ring(manager)).toEqual([]);
  });

  it("keeps the newest 200 on load", () => {
    const polish = Array.from({ length: 205 }, (_, index) => record(index));
    const extras = hydrateExtras({ polish } as unknown as Parameters<typeof hydrateExtras>[0], defaultGlobalSettings);
    expect(extras.polish?.map((row) => row.messageId)).toEqual(Array.from({ length: 200 }, (_, index) => index + 5));
  });
});

let releases: Array<() => void> = [];

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-a" };
  mockContext.extensionSettings = {};
});

afterEach(() => {
  releases.forEach((release) => release());
  releases = [];
  globalThis.storyOrchestratorDebugPolishResponse = undefined;
  jest.restoreAllMocks();
});
