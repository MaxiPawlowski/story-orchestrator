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
import { isLive } from "@memory/index";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import type { MemoryRuntimeState } from "../types";
import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";
import { ApplyQueue } from "@engine/applyQueue";

const story = { title: "S", id: "s1", version: 1, checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } }, qualityByKey: {}, roster: [{ id: "arin", name: "Arin" }], arc_bridges: [] };

const memoryState = (): MemoryRuntimeState => ({
  entries: [], excluded: [], writeLog: [],
  settings: { enabled: true, epistemicLedgerCapable: false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierBudgets: { facts: 50, session_details: 40, short_term: 10, scene_history: 20 }, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 } },
  backfill: null, sceneCount: 0, shortTermSummaryEnd: -1, wiWrites: {}, wiBook: null, arcs: [], epistemic: [], ledger: [], canon: null, verifyDrops: [], derived: [],
  conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, storyStart: 0, updatedAt: "t",
}) as MemoryRuntimeState;

function harness() {
  const current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
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

const READ = `FACT importance=2 text="Arin carries two curved daggers." evidence="Arin drew both blades."`;

describe("extraction|duplicateCompletion: one read's completion delivered twice (CR-P22)", () => {
  it("stores the read's fact once, and both deliveries name the same read and window", async () => {
    const env = harness();
    await env.deliver(READ);
    const once = env.memory().entries.map((entry) => ({ text: entry.text, live: isLive(entry) }));
    await env.deliver(READ);
    expect(env.memory().entries.map((entry) => ({ text: entry.text, live: isLive(entry) }))).toEqual(once);
    expect(once).toEqual([{ text: "Arin carries two curved daggers.", live: true }]);
    expect(env.enqueued.map((entry) => entry.origin)).toEqual(["read-3", "read-3"]);
  });

  it("the audit ring keeps one row for a re-delivered read", async () => {
    const env = harness();
    await env.deliver(READ);
    await env.deliver(READ);
    expect(env.extraction.audits.map((audit) => audit.id)).toEqual(["read-3"]);
  });

  it("control: two distinct reads of the same window are two audit rows", async () => {
    const env = harness();
    await env.deliver(READ, "read-3a");
    await env.deliver(READ, "read-3b");
    expect(env.extraction.audits.map((audit) => audit.id)).toEqual(["read-3a", "read-3b"]);
  });

  it("the engine applies the twice-enqueued deltas once: the newer write covering the same window supersedes the older", () => {
    const queue = new ApplyQueue();
    const write = { source: "extractor" as const, blackboardVersionSum: 0, turnRange: { from: 3, to: 3 }, deltas: [{ key: "step", value: 2 }], origin: "read-3" };
    queue.enqueue(write as never);
    queue.enqueue(write as never);
    const applyDelta = jest.fn(() => ({ applied: true }));
    const drained = queue.drainAtBoundary({ applyDelta, holdsAgainst: () => false } as never);
    expect(applyDelta).toHaveBeenCalledTimes(1);
    expect(drained.applied).toHaveLength(1);
    expect(drained.discarded).toHaveLength(1);
  });

  it("control: two different windows are two writes, both applied", () => {
    const queue = new ApplyQueue();
    queue.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 3, to: 3 }, deltas: [{ key: "step", value: 2 }], origin: "read-3" } as never);
    queue.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 4, to: 4 }, deltas: [{ key: "step", value: 3 }], origin: "read-4" } as never);
    const applyDelta = jest.fn(() => ({ applied: true }));
    expect(queue.drainAtBoundary({ applyDelta, holdsAgainst: () => false } as never).applied).toHaveLength(2);
  });
});
