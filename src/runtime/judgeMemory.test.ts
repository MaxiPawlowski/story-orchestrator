import type { SharedReadAudit } from "@extraction/index";
import { defaultJudgeSettings, type JudgeRequest, type JudgeResponse, type JudgeSettings, type JudgeTransport } from "@judge/index";
import { JudgeRuntime } from "./judge";
import { RuntimeManager } from "./runtimeManager";

const mockContext = {
  chat: [] as Array<{ mes: string; name?: string; is_user?: boolean }>,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  chatId: "chat-judge",
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => ({
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
  // v2.3 plan 06: the capability probe is asked BEFORE the vectors path, so a mock that omits it
  // takes the test down at the seam rather than through it. "present" keeps this suite on the same
  // path it was written against: try the vectors API, fall back when it throws.
  capabilityState: jest.fn(async () => "present"),
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
  id: "judge-memory",
  title: "Judge Memory",
  description: "v2.2 plan 02 fixture.",
  qualities: [{ key: "noted", type: "bool", source: "extractor", rubric: "Was something noted?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "Start.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "arin", name: "Arin" }],
};

const audit = (to: number, withDelta = false): SharedReadAudit => ({
  id: `audit-${to}`,
  createdAt: "2026-09-19T00:00:00.000Z",
  priority: 0,
  reason: "test",
  contractHash: "hash",
  scope: [],
  window: { from: 0, to },
  prompt: "prompt",
  rawResponse: "raw",
  acceptedDeltas: withDelta ? [{ delta: { q: "noted", v: true, source: "extractor" }, evidence: "e" }] : [],
  rejected: [],
});

const fact = (text: string) => ({ text, evidence: "e", importance: 2 as const });

const VERIFY_P: Record<string, number> = {
  "Arin carries a curved blade.": 0.95,
  "Arin killed the sphinx.": 0.04,
  "Arin is tired.": 0.3,
};

const answer = (request: JudgeRequest): JudgeResponse => {
  if (request.questions.relation) {
    const older = String(request.state.older_note);
    const newer = String(request.state.newer_note);
    const duplicate = older.includes("crowns") && newer.includes("crowns");
    return { model: "jev-1.13.0", answers: { relation: { type: "choice", choice: duplicate ? "duplicate" : "update", confidence: 0.9, probabilities: {} }, same_thing: { type: "noul", noul: duplicate ? 0.95 : 0.1 } } };
  }
  const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
    const line = Object.keys(VERIFY_P).find((text) => question.instructions.includes(text));
    return [id, { type: "noul" as const, noul: line ? VERIFY_P[line] : 0.9 }];
  }));
  return { model: "jev-1.13.0", answers };
};

const setup = async (uses: Partial<JudgeSettings["uses"]>) => {
  mockContext.chat = [{ mes: "Arin rests her hand on her curved blade.", name: "Arin" }, { mes: "\"I'm fine.\" She yawns.", name: "Arin" }];
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, ...uses } };
  const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async (request) => answer(request));
  const manager = new RuntimeManager();
  const records: string[] = [];
  manager.attachJudge(new JudgeRuntime({
    getSettings: () => settings,
    transport,
    status: async () => ({ configured: true }),
    record: (record) => { records.push(`${record.use}${record.fallback ? `:${record.fallback}` : ""}`); manager.recordJudgeCall(record); },
    context: () => ({ boundary: 0, messageId: mockContext.chat.length - 1 }),
  }));
  await manager.importStory(JSON.stringify(story));
  return { manager, transport, settings, records };
};

const facts = (manager: RuntimeManager) => manager.getSnapshot().memory.entries.filter((entry) => entry.tier === "facts");

describe("judge memory hygiene (v2.2 plan 02)", () => {
  it("verifies new lines before storing: drops unsupported, down-weights doubtful, keeps the rest", async () => {
    const { manager, records } = await setup({ memoryVerify: true });
    await manager.applyExtractionAudit(audit(1), [fact("Arin carries a curved blade."), fact("Arin killed the sphinx."), fact("Arin is tired.")]);
    const stored = facts(manager);
    expect(stored.map((entry) => [entry.text, entry.confidence])).toEqual([["Arin carries a curved blade.", 1], ["Arin is tired.", 0.3]]);
    expect(manager.getSnapshot().memory.verifyDrops.map((drop) => [drop.entry.text, drop.p, drop.model])).toEqual([["Arin killed the sphinx.", 0.04, "jev-1.13.0"]]);
    expect(records).toEqual(["memoryVerify"]);
  });

  it("stores a dropped line on the author's word, at its judged confidence", async () => {
    const { manager } = await setup({ memoryVerify: true });
    await manager.applyExtractionAudit(audit(1), [fact("Arin killed the sphinx.")]);
    const [drop] = manager.getSnapshot().memory.verifyDrops;
    expect(await manager.storeDroppedMemory(drop.entry.id)).toBe(true);
    expect(facts(manager).map((entry) => [entry.text, entry.confidence])).toEqual([["Arin killed the sphinx.", 0.04]]);
    expect(manager.getSnapshot().memory.verifyDrops).toEqual([]);
  });

  it("stores every line unchanged, and asks nothing, when memoryVerify is off", async () => {
    const { manager, transport } = await setup({});
    await manager.applyExtractionAudit(audit(1), [fact("Arin carries a curved blade."), fact("Arin killed the sphinx.")]);
    expect(facts(manager)).toHaveLength(2);
    expect(transport).not.toHaveBeenCalled();
  });

  it("drops a dropped line's record on a rollback past its message", async () => {
    const { manager } = await setup({ memoryVerify: true });
    await manager.commitBoundary();
    await manager.applyExtractionAudit(audit(1, true), [fact("Arin killed the sphinx.")]);
    mockContext.chat.push({ mes: "later", name: "Arin" });
    await manager.commitBoundary();
    expect(manager.getSnapshot().memory.verifyDrops).toHaveLength(1);
    await manager.rollbackFromMessage(1);
    expect(manager.getSnapshot().memory.verifyDrops).toEqual([]);
  });

  const seedGroup = async (manager: RuntimeManager) => {
    await manager.applyExtractionAudit(audit(1), [
      fact("The guild pays 250 crowns for the Sun's Heart."),
      fact("The guild will pay two hundred and fifty crowns for the Sun's Heart."),
      fact("Arin carries a curved blade."),
      fact("Luke is twelve years old."),
      fact("Ponticius runs the job board."),
      fact("The ruins lie three days east."),
      fact("A sphinx guards the gate."),
      fact("Sandstorms rise in the afternoon."),
    ]);
  };

  it("consolidates a judged duplicate that today's heuristic only flags", async () => {
    const off = await setup({});
    await seedGroup(off.manager);
    await off.manager.runConsolidation();
    const offFacts = facts(off.manager);
    expect(offFacts).toHaveLength(8);
    expect(offFacts.find((entry) => entry.text.startsWith("The guild pays"))?.contradicted).toBe(true);

    const on = await setup({ memoryPairs: true });
    await seedGroup(on.manager);
    const summary = await on.manager.runConsolidation();
    expect(summary.dropped).toBe(1);
    const onFacts = facts(on.manager);
    expect(onFacts).toHaveLength(7);
    expect(onFacts.some((entry) => entry.text.startsWith("The guild will pay"))).toBe(false);
    expect(onFacts.find((entry) => entry.text.startsWith("The guild pays"))?.contradicted).toBeFalsy();
    expect(on.records.every((record) => record === "memoryPairs")).toBe(true);
  });
});
