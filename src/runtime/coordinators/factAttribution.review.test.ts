import { fakeHosts } from "../../../test/support/fakeHosts";
import { plantedModel, readWith } from "../../../test/support/modelCall";

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: () => 4,
  capabilityState: async () => "absent",
  DEFAULT_VECTOR_SOURCE: "transformers",
  vectorInsert: async () => {},
  vectorQuery: async () => [],
  vectorPurge: async () => {},
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
};

import { StoryEngine, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { runSharedRead } from "@extraction/sharedRead";
import type { SharedReadWindow } from "@extraction/types";
import { describeProvenance, type MemoryEntry } from "@memory/index";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import type { MemoryRuntimeState } from "../types";
import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";

const story: NormalizedStoryV2 = parseStoryV2OrThrow({
  format: 2,
  id: "f1a",
  title: "F1a attribution",
  description: "v2.5 plan 05 F1a",
  qualities: [{ key: "gate_open", type: "bool", source: "extractor", rubric: "Is the gate open?" }],
  checkpoints: [
    { id: "yard", name: "Yard", objective: "Reach the gate", type: "anchor", start: true },
    { id: "road", name: "Road", objective: "Leave", type: "anchor" },
  ],
  transitions: [{ from: "yard", to: "road", priority: 0, gate: { q: "gate_open", op: "==", v: true } }],
  roster: [],
});

const LINES = [
  "Max: I walk into the yard.",
  "Arin: The yard is quiet tonight.",
  "Max: Where is the smith?",
  "Arin: Bram the smith lost his left hand in the war.",
  "Max: I nod.",
  "Arin: The rain keeps falling.",
  "Max: I wait by the well.",
  "Arin: A bell rings somewhere far off.",
];

const WINDOW: SharedReadWindow = {
  from: 0,
  to: 7,
  messages: LINES.map((line, index) => {
    const [speaker, text] = line.split(": ");
    return { index, messageId: index, speaker, text, isUser: speaker === "Max" };
  }),
};

const REPLY = [
  "FACT importance=3 text=\"Bram the smith lost his left hand in the war.\" evidence=\"Bram the smith lost his left hand in the war.\"",
  "MEMORY type=scene importance=2 expiration=session text=\"Rain falls over the quiet yard.\" evidence=\"[5] Arin: The rain keeps falling.\"",
  "FACT importance=2 text=\"The smith is a hero of the war.\" evidence=\"Bram was a hero of the war.\"",
  "FACT importance=1 text=\"Arin is present in the yard.\" evidence=\"[1] Arin:\"",
  "SCENE_NONE",
].join("\n");

const read = async (reply = REPLY) => {
  const engine = new StoryEngine();
  engine.loadStory(story);
  return runSharedRead({ story, state: engine.serialize(), priority: 0, reason: "f1a", window: WINDOW, ...readWith("p1", { debugResponse: reply }) });
};

const memoryState = (): MemoryRuntimeState => ({
  entries: [], excluded: [], writeLog: [],
  settings: { enabled: true, epistemicLedgerCapable: false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierBudgets: { facts: 50, session_details: 40, short_term: 10, scene_history: 20 }, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 } },
  backfill: null, sceneCount: 0, shortTermSummaryEnd: -1, wiWrites: {}, wiBook: null, arcs: [], epistemic: [], ledger: [], canon: null,
  verifyDrops: [], derived: [], conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, storyStart: 0, updatedAt: "t",
});

function harness() {
  const current: RunContext = { chatId: "chat-a", storyId: "f1a", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memory = memoryState();
  const engine = { activeCheckpointId: "yard", boundary: 3, lastMessageId: 7, blackboard: { values: {}, versions: {} } };
  const extraction = { audits: [] as unknown[], reconciliationEvents: [] as unknown[], judgedReads: [] as unknown[] };
  const common = { getStory: () => story, getState: () => engine, model: plantedModel, getFiredTransitions: () => [], getExpansionGateSources: () => [], enqueueExtractorDeltas: () => {}, ownership, judge: () => null, persist: async () => {}, notify: () => {} };
  const memoryCoordinator = new MemoryCoordinator({ ...common, hosts: fakeHosts(stapi), getMemory: () => memory, setMemory: (next: MemoryRuntimeState) => { memory = next; }, enqueueMechanical: () => {} } as never);
  const extractionCoordinator = new ExtractionCoordinator({ ...common, getExtraction: () => extraction, memory: memoryCoordinator, commitBoundary: async () => {}, fireSceneBreakReplies: async () => {}, emitSceneBreak: () => {}, emitArcsResolved: () => {}, setStatus: () => {} } as never);
  return { memory: () => memory, memoryCoordinator, extractionCoordinator };
}

const byText = (entries: MemoryEntry[], text: string) => entries.find((entry) => entry.text === text);

describe("v2.5 plan 05 F1a: a fact is attributed to the message its evidence quotes", () => {
  it("the read names the first source message of each FACT and MEMORY line it can find", async () => {
    const result = await read();
    expect(result.facts.map((fact) => [fact.text, fact.messageId])).toEqual([
      ["Bram the smith lost his left hand in the war.", 3],
      ["The smith is a hero of the war.", undefined],
      ["Arin is present in the yard.", undefined],
    ]);
    expect(result.memory.map((line) => line.messageId)).toEqual([5]);
  });

  it("a fact quoted from message 3 is stamped message 3, and its provenance says so", async () => {
    const env = harness();
    const result = await read();
    await env.extractionCoordinator.applyAudit(result.audit, result.facts, result.memory);
    const bram = byText(env.memory().entries, "Bram the smith lost his left hand in the war.")!;
    expect(bram.messageId).toBe(3);
    expect(bram.provenance.messageId).toBe(3);
    expect(describeProvenance(bram)).toContain("message 3");
    expect(byText(env.memory().entries, "Rain falls over the quiet yard.")?.messageId).toBe(5);
  });

  it("a fact quoted from message 3 survives a rollback of message 7", async () => {
    const env = harness();
    const result = await read();
    await env.extractionCoordinator.applyAudit(result.audit, result.facts, result.memory);
    env.memoryCoordinator.rollbackFromMessage(7, 3);
    expect(byText(env.memory().entries, "Bram the smith lost his left hand in the war.")?.messageId).toBe(3);
    expect(byText(env.memory().entries, "Rain falls over the quiet yard.")?.messageId).toBe(5);
    env.memoryCoordinator.rollbackFromMessage(3, 3);
    expect(byText(env.memory().entries, "Bram the smith lost his left hand in the war.")).toBeUndefined();
    expect(byText(env.memory().entries, "Rain falls over the quiet yard.")).toBeUndefined();
  });

  it("control: a line whose evidence is not in the window keeps today's stamp, window.to, and dies with it", async () => {
    const env = harness();
    const result = await read();
    await env.extractionCoordinator.applyAudit(result.audit, result.facts, result.memory);
    for (const text of ["The smith is a hero of the war.", "Arin is present in the yard."]) {
      const entry = byText(env.memory().entries, text)!;
      expect([text, entry.messageId, entry.provenance.messageId]).toEqual([text, 7, 7]);
    }
    env.memoryCoordinator.rollbackFromMessage(7, 3);
    expect(byText(env.memory().entries, "The smith is a hero of the war.")).toBeUndefined();
  });

  it("control: whitespace evidence and a label-only quote are not evidence for a fact", async () => {
    const result = await read("FACT importance=2 text=\"The yard is quiet.\" evidence=\"   \"\nFACT importance=2 text=\"Arin speaks.\" evidence=\"[1] Arin:\"");
    expect(result.facts.map((fact) => fact.messageId)).toEqual([undefined, undefined]);
  });

  it("a quote two messages hold is attributed to the earlier one", async () => {
    const result = await read("MEMORY type=scene importance=1 expiration=scene text=\"The party is in the yard.\" evidence=\"the yard\"");
    expect(result.memory.map((line) => line.messageId)).toEqual([0]);
  });

  it("control: a fact passed in without a source keeps window.to", async () => {
    const env = harness();
    const result = await read("NO_DELTA");
    await env.extractionCoordinator.applyAudit(result.audit, [{ importance: 2, text: "The well is deep and old.", evidence: "I wait by the well." }], []);
    expect(byText(env.memory().entries, "The well is deep and old.")?.messageId).toBe(7);
  });
});
