import { fakeHosts } from "../../../test/support/fakeHosts";
import { plantedModel } from "../../../test/support/modelCall";

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

import { parseSharedReadResponse } from "@extraction/parse";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import type { MemoryRuntimeState } from "../types";
import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";

const story = { title: "S", id: "s1", checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } }, qualityByKey: {}, roster: [{ id: "arin", name: "Arin" }], arc_bridges: [] };

const memoryState = (): MemoryRuntimeState => ({
  entries: [], excluded: [], writeLog: [],
  settings: { enabled: true, epistemicLedgerCapable: false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierBudgets: { facts: 50, session_details: 40, short_term: 10, scene_history: 20 }, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 } },
  backfill: null, sceneCount: 0, shortTermSummaryEnd: -1, wiWrites: {}, wiBook: null, arcs: [], epistemic: [], ledger: [], canon: null, verifyDrops: [], derived: [],
  conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, storyStart: 0, updatedAt: "t",
}) as MemoryRuntimeState;

function harness() {
  const current: RunContext = { chatId: "chat-a", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memory = memoryState();
  const engine = { activeCheckpointId: "cp1", boundary: 1, lastMessageId: 3, blackboard: { values: {}, versions: {} } };
  const extraction = { audits: [] as Array<{ id: string }>, reconciliationEvents: [] as unknown[], judgedReads: [] as unknown[] };
  const enqueued: Array<{ origin: string; deltas: unknown[] }> = [];
  const memoryCoordinator = new MemoryCoordinator({ hosts: fakeHosts(stapi), getStory: () => story, getState: () => engine, getMemory: () => memory,
    setMemory: (next: MemoryRuntimeState) => { memory = next; }, model: plantedModel, getFiredTransitions: () => [], getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {}, enqueueMechanical: () => {}, ownership, judge: () => null, persist: async () => {}, notify: () => {} } as never);
  const coordinator = new ExtractionCoordinator({ getStory: () => story, getState: () => engine, getExtraction: () => extraction, model: plantedModel,
    memory: memoryCoordinator, getFiredTransitions: () => [], getExpansionGateSources: () => [],
    enqueueExtractorDeltas: (deltas: unknown[], _window: unknown, origin: string) => { enqueued.push({ origin, deltas }); },
    commitBoundary: async () => {}, fireSceneBreakReplies: async () => {}, emitSceneBreak: () => {}, emitArcsResolved: () => {}, setStatus: () => {},
    judge: () => null, persist: async () => {}, notify: () => {}, ownership } as never);
  const deliver = async (raw: string, id = "read-3") => {
    const parsed = parseSharedReadResponse(raw, story as never);
    const audit = { id, createdAt: "t", priority: 0, reason: "cadence", contractHash: "h", scope: [], window: { from: 3, to: 3 }, prompt: "p", rawResponse: raw, acceptedDeltas: [{ q: "step", v: 2 }], rejected: [] };
    await coordinator.applyAudit(audit as never, parsed.facts, parsed.memory);
  };
  return { deliver, memory: () => memory, extraction, enqueued };
}

const HYBRID = `FACT importance=3 type=event expiration=session entity="Arin" text="Arin sealed the north gate." evidence="Arin bars the gate."`;
const CANONICAL = `FACT importance=2 text="Arin carries two curved daggers." evidence="Arin drew both blades."`;

const stored = (entries: Array<{ tier: string; type: string; importance: number; expiration: string; entities: string[]; text: string }>) =>
  entries.map(({ tier, type, importance, expiration, entities, text }) => ({ tier, type, importance, expiration, entities, text }));

describe("v3.0 25: a FACT line with MEMORY-style fields lands in the facts tier", () => {
  it("stores it as a permanent facts-tier entry of the given type, with its entities", async () => {
    const env = harness();
    await env.deliver(HYBRID);
    expect(stored(env.memory().entries)).toEqual([{ tier: "facts", type: "event", importance: 3, expiration: "permanent", entities: ["Arin"], text: "Arin sealed the north gate." }]);
  });

  it("control: a canonical FACT line is stored exactly as before", async () => {
    const env = harness();
    await env.deliver(CANONICAL);
    expect(stored(env.memory().entries)).toEqual([{ tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "Arin carries two curved daggers." }]);
  });
});
