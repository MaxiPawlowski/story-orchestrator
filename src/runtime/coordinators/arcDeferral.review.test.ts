import { fakeHosts } from "../../../test/support/fakeHosts";
import { plantedModel, readWith } from "../../../test/support/modelCall";

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: CHAT, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
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

import { StoryEngine, parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { runSharedRead } from "@extraction/sharedRead";
import { windowOf } from "@extraction/chatRows";
import { arcDeferred, arcThreadState, type ArcEntry } from "@memory/index";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import type { MemoryRuntimeState } from "../types";
import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";

const story: NormalizedStory = parseStoryOrThrow({
  id: "d33",
  title: "Put off",
  description: "v3.0 33",
  qualities: [{ key: "gate_open", type: "bool", source: "extractor", rubric: "Is the gate open?" }],
  checkpoints: [{ id: "yard", name: "Yard", objective: "Reach the gate", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const LINES = [
  "Max: I walk into the yard.",
  "Arin: About the smugglers' debt, we must talk.",
  "Max: The debt? Later, okay? Not now.",
  "Arin: Later, then.",
  "Max: I wait by the well.",
  "Arin: The rain keeps falling.",
  "Max: Fine, let's settle the smugglers' debt now.",
  "Arin: Good.",
];

const CHAT = LINES.map((line) => {
  const [name, mes] = line.split(": ");
  return { name, mes, is_user: name === "Max" };
});

const DEBT = "The debt the party owes to the river smugglers";

const read = async (reply: string, from: number, to: number) => {
  const engine = new StoryEngine();
  engine.loadStory(story);
  return runSharedRead({ story, state: engine.serialize(), priority: 0, reason: "d33", window: windowOf(CHAT, from, to), ...readWith("p1", { debugResponse: reply }) });
};

const memoryState = (settings: Record<string, unknown> = {}): MemoryRuntimeState => ({
  entries: [], excluded: [], writeLog: [],
  settings: { enabled: true, epistemicLedgerCapable: false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierBudgets: { facts: 50, session_details: 40, short_term: 10, scene_history: 20 }, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 }, ...settings },
  backfill: null, sceneCount: 0, shortTermSummaryEnd: -1, wiWrites: {}, wiBook: null, epistemic: [], ledger: [], canon: null,
  arcs: [{ id: "debt", text: DEBT, status: "open", entities: [], openedAt: 0, openedMessageId: 1 } as ArcEntry],
  verifyDrops: [], derived: [], conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, storyStart: 0, updatedAt: "t",
});

function harness(settings: Record<string, unknown> = {}) {
  const current: RunContext = { chatId: "chat-a", storyId: "d33", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memory = memoryState(settings);
  const engine = { activeCheckpointId: "yard", boundary: 3, lastMessageId: 7, blackboard: { values: {}, versions: {} } };
  const extraction = { audits: [] as unknown[], reconciliationEvents: [] as unknown[], judgedReads: [] as unknown[] };
  const common = { getStory: () => story, getState: () => engine, model: plantedModel, getFiredTransitions: () => [], getExpansionGateSources: () => [], enqueueExtractorDeltas: () => {}, ownership, judge: () => null, persist: async () => {}, notify: () => {} };
  const memoryCoordinator = new MemoryCoordinator({ ...common, hosts: fakeHosts(stapi), getMemory: () => memory, setMemory: (next: MemoryRuntimeState) => { memory = next; }, enqueueMechanical: () => {} } as never);
  const extractionCoordinator = new ExtractionCoordinator({ ...common, hosts: fakeHosts(stapi), getExtraction: () => extraction, memory: memoryCoordinator, commitBoundary: async () => {}, fireSceneBreakReplies: async () => {}, emitSceneBreak: () => {}, emitArcsResolved: () => {}, setStatus: () => {} } as never);
  return { memory: () => memory, memoryCoordinator, extractionCoordinator, engine };
}

const DEFER_REPLY = [
  `[deferred] ${DEBT} | m=2 | "Later, okay? Not now."`,
  `[deferred] ${DEBT} | m=3 | "Later, then."`,
  "SCENE_NONE",
].join("\n");

const debt = (env: ReturnType<typeof harness>) => env.memory().arcs.find((arc) => arc.id === "debt")!;

describe("v3.0 33: a story read puts a thread off on the player's words and picks it up on the player's mention", () => {
  it("defers on the player's quote, records the cast member's later as refused in the read's audit", async () => {
    const env = harness();
    const result = await read(DEFER_REPLY, 0, 5);
    await env.extractionCoordinator.applyAudit(result.audit, result.facts, result.memory, result.arcs);
    expect(arcDeferred(debt(env))).toBe(true);
    expect(debt(env).history?.[0]).toMatchObject({ kind: "deferred", messageId: 5, quote: "Later, okay? Not now.", span: { chatId: "chat-a", storyId: "d33", messageId: 2, isUser: true } });
    expect(result.audit.rejected).toContainEqual({ line: `[deferred] ${DEBT} | m=3 | "Later, then."`, reason: "not the player's own words" });
  });

  it("the next read reopens it from the player's own mention, with no read line needed, and a rollback restores the deferral", async () => {
    const env = harness();
    const first = await read(DEFER_REPLY, 0, 5);
    await env.extractionCoordinator.applyAudit(first.audit, first.facts, first.memory, first.arcs);
    const second = await read("SCENE_NONE", 6, 7);
    await env.extractionCoordinator.applyAudit(second.audit, second.facts, second.memory, second.arcs);
    expect(arcThreadState(debt(env))).toBe("open");
    expect(debt(env).history?.map((event) => [event.kind, event.span.messageId])).toEqual([["deferred", 2], ["reopened", 6]]);
    env.memoryCoordinator.rollbackFromMessage(6, 3);
    expect(arcDeferred(debt(env))).toBe(true);
    env.memoryCoordinator.rollbackFromMessage(2, 3);
    expect(debt(env).history).toBeUndefined();
  });

  it("switched off, the read's deferral is refused and the thread stays open", async () => {
    const env = harness({ deferrals: false });
    const result = await read(DEFER_REPLY, 0, 5);
    await env.extractionCoordinator.applyAudit(result.audit, result.facts, result.memory, result.arcs);
    expect(debt(env).history).toBeUndefined();
    expect(result.audit.rejected.filter((entry) => entry.reason === "put-off threads are switched off")).toHaveLength(2);
  });
});
