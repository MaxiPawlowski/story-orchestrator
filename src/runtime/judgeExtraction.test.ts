import { defaultJudgeSettings, type JudgeRequest, type JudgeResponse, type JudgeSettings, type JudgeTransport } from "@judge/index";
import type { ReconciliationPlan, SharedReadWindow } from "@extraction/index";
import { JudgeRuntime } from "./judge";
import { RuntimeManager } from "./runtimeManager";
import { testOwnership } from "../../test/findings/testOwnership";

const mockContext = {
  chat: [] as Array<{ mes: string; name?: string; is_user?: boolean }>,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  chatId: "chat-typed",
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
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
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
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

const story = {
  format: 2,
  id: "judge-typed",
  title: "Judge Typed",
  description: "v2.2 plan 06 fixture.",
  qualities: [
    { key: "has_key", type: "bool", source: "extractor", rubric: "Does the player hold the brass key?", read_as: "choice" },
    { key: "mood", type: "enum", values: ["calm", "angry"], source: "extractor", rubric: "Mara's mood?" },
  ],
  checkpoints: [{ id: "hall", name: "The Hall", objective: "Find the key.", type: "anchor", start: true }, { id: "vault", name: "The Vault", objective: "Open it.", type: "anchor" }],
  transitions: [{ from: "hall", to: "vault", priority: 1, gate: { q: "has_key", op: "==", v: true } }],
  roster: [{ id: "mara", name: "Mara" }],
};

const flush = async () => { for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

const setup = async (uses: Partial<JudgeSettings["uses"]>, answer: (request: JudgeRequest) => JudgeResponse) => {
  mockContext.chat = [{ mes: "Welcome to the hall.", name: "Mara" }, { mes: "The key is under the mat.", name: "Mara" }, { mes: "I pick up the brass key.", name: "Max", is_user: true }];
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true,
    uses: { ...Object.fromEntries(Object.keys(defaultJudgeSettings().uses).map((key) => [key, false])) as JudgeSettings["uses"], ...uses } };
  const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async (request) => answer(request));
  const manager = new RuntimeManager();
  const uses_: string[] = [];
  manager.attachJudge(new JudgeRuntime({ ownership: testOwnership(), getSettings: () => settings, transport, status: async () => ({ configured: true }), record: (record) => { uses_.push(record.use); manager.recordJudgeCall(record); }, context: () => ({ boundary: 0, messageId: mockContext.chat.length - 1 }) }));
  await manager.importStory(JSON.stringify(story));
  return { manager, transport, records: uses_ };
};

const typedAnswer = (confidence: number) => (request: JudgeRequest): JudgeResponse => ({
  model: "jev-1.13.0",
  answers: Object.fromEntries(Object.keys(request.questions).map((id) => [id, { type: "choice" as const, choice: id === "q:has_key" ? "yes in msg_2" : "msg_2", confidence, probabilities: {} }])),
});

describe("judged typed read (v2.2 plan 06)", () => {
  it("reads hinted qualities on a boundary, queues the delta for the next one, and records its own ring", async () => {
    const { manager, transport, records } = await setup({ typedExtraction: true }, typedAnswer(0.95));
    expect(manager.judgedExtraction({ kind: "typed", boundary: 0, messageId: 2 })).toBe(true);
    await flush();
    expect(Object.keys(transport.mock.calls[0][0].questions)).toEqual(["q:has_key"]);
    expect(records).toEqual(["typed"]);
    const reads = manager.getSnapshot().extraction.judgedReads;
    expect(reads).toEqual([expect.objectContaining({ kind: "typed", answered: ["has_key"], deltas: [{ q: "has_key", v: true, confidence: 0.95 }], model: "jev-1.13.0" })]);
    expect(manager.getSnapshot().extraction.audits).toEqual([]);
    await manager.commitBoundary();
    expect(manager.getSnapshot().activeCheckpointId).toBe("vault");
    expect(manager.getSnapshot().blackboardMeta.has_key).toMatchObject({ reader: "judge", confidence: 0.95 });
  });

  it("writes nothing under the floor, and takes no work with the usage off", async () => {
    const low = await setup({ typedExtraction: true }, typedAnswer(0.6));
    low.manager.judgedExtraction({ kind: "typed", boundary: 0, messageId: 2 });
    await flush();
    expect(low.manager.getSnapshot().extraction.judgedReads[0]).toMatchObject({ answered: [], deltas: [] });
    const off = await setup({}, typedAnswer(0.99));
    expect(off.manager.judgedExtraction({ kind: "typed", boundary: 0, messageId: 2 })).toBe(false);
    expect(off.transport).not.toHaveBeenCalled();
  });

  it("drops a read the chat moved past while it was in flight", async () => {
    const { manager } = await setup({ typedExtraction: true }, typedAnswer(0.95));
    manager.judgedExtraction({ kind: "typed", boundary: 0, messageId: 2 });
    mockContext.chat.push({ mes: "What now?", name: "Mara" });
    await flush();
    expect(manager.getSnapshot().extraction.judgedReads).toEqual([]);
  });
});

describe("judged stall pre-check (v2.2 plan 06)", () => {
  const plan = (): ReconciliationPlan => ({
    descriptor: { checkpointId: "hall", boundary: 9, targetedKeys: ["has_key"] },
    reason: "reconcile:has_key",
    window: { from: 0, to: 2, messages: mockContext.chat.map((message, index) => ({ index, messageId: index, speaker: message.name ?? "", text: message.mes })) as SharedReadWindow["messages"] },
    leaves: [{ q: "has_key", rubric: story.qualities[0].rubric, type: "bool", op: "==", v: true }],
  });
  const leafAnswer = (p: number) => (request: JudgeRequest): JudgeResponse => ({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(request.questions).map((id) => [id, { type: "noul" as const, noul: p }])) });

  it("writes a leaf shown at 0.95 directly and resolves the stall without an LLM re-read", async () => {
    const { manager } = await setup({ stallCheck: true }, leafAnswer(0.97));
    const reread = jest.fn();
    manager.recordReconciliation(plan().descriptor);
    expect(manager.judgedExtraction({ kind: "stall", plan: plan(), reread })).toBe(true);
    await flush();
    expect(reread).not.toHaveBeenCalled();
    expect(manager.getSnapshot().extraction.reconciliationEvents.at(-1)).toMatchObject({ resolvedAt: expect.any(String), evidence: ["has_key=true (judge:reconcile p=0.97)"] });
    await manager.commitBoundary();
    expect(manager.getSnapshot().activeCheckpointId).toBe("vault");
  });

  it("keeps a genuine stall open with the judge's note, and re-reads anything in between", async () => {
    const genuine = await setup({ stallCheck: true }, leafAnswer(0.02));
    const quiet = jest.fn();
    genuine.manager.recordReconciliation(plan().descriptor);
    genuine.manager.judgedExtraction({ kind: "stall", plan: plan(), reread: quiet });
    await flush();
    expect(quiet).not.toHaveBeenCalled();
    expect(genuine.manager.getSnapshot().extraction.reconciliationEvents.at(-1)).toMatchObject({ resolvedAt: null, evidence: ["judge: nothing shown (max p 0.02)"] });
    const unsure = await setup({ stallCheck: true }, leafAnswer(0.5));
    const reread = jest.fn();
    unsure.manager.judgedExtraction({ kind: "stall", plan: plan(), reread });
    await flush();
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it("claims nothing was answered when the stall call falls back, and re-reads", async () => {
    const down = await setup({ stallCheck: true }, () => { throw new Error("judge down"); });
    const reread = jest.fn();
    down.manager.judgedExtraction({ kind: "stall", plan: plan(), reread });
    await flush();
    expect(reread).toHaveBeenCalledTimes(1);
    expect(down.manager.getSnapshot().extraction.judgedReads.at(-1)).toMatchObject({ kind: "stall", answered: [], deltas: [] });
  });

  it("takes no stall with the usage off, so today's re-read runs", async () => {
    const { manager, transport } = await setup({}, leafAnswer(0.99));
    expect(manager.judgedExtraction({ kind: "stall", plan: plan(), reread: jest.fn() })).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
});
