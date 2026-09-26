// v2.4 plan 07, found live (J8.5 on-arm x2, 2026-09-25, test/journeys/records/v2.4-plan07/part1-live-7f1787158bf8/).
//
// A scripted Courier line ("I crossed the old stone bridge … It held firm under my boots") was read
// into two NEW live facts-tier rows that contradict the seeded permanent fact ("… collapsed in the
// flood and is gone"). Nothing marked them. The warden then held the next reply to all three facts
// and flagged a reply that agreed with the seed (`{facts: 3, flagged: 2}` at message 6, both runs).
//
// Root cause, three layers, none of which compares a new fact with an established one:
// - the write path (`ExtractionCoordinator.applyAudit` -> `MemoryCoordinator.applyEntries` ->
//   `addMemoryEntries`) only drops excluded hashes and re-read windows;
// - `detectConflicts` compares facts with the LEDGER, the blackboard and the scene read, never with
//   another fact;
// - consolidation (the fact-vs-fact walk) runs every 10 boundaries, only for groups of 8+, and an
//   undecided pair marks the OLDER row `contradicted` — the seed, which then drops out of the warden.
//
// The decision: a new claim that lands in an established row's band (locked as canon, decided or
// written by the author) never becomes live on its own. A pin is retention, not truth (v2.3 M5). It is held in the reconciliation queue, the established row
// keeps steering, and the warden reads only live, non-conflicted rows.

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: () => 4,
  capabilityState: async () => (mockVectors.on ? "present" : "absent"),
  DEFAULT_VECTOR_SOURCE: "transformers",
  vectorInsert: async (id: string, items: Array<{ index: number; text: string }>) => { mockVectors.inserts += 1; mockVectors.collections.set(id, items.map(({ index, text }) => ({ index, text }))); },
  vectorQuery: async (id: string, text: string, _topK: number, threshold: number) => (mockVectors.collections.get(id) ?? []).filter((item) => mockCosine(text, item.text) >= threshold),
  vectorPurge: async (id: string) => { mockVectors.collections.delete(id); },
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
}));

import { parseSharedReadResponse } from "@extraction/index";
import { isLive, type ConflictPair, type MemoryEntry, type ParsedMemoryLine } from "@memory/index";
import { establishedFacts } from "../continuity";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import type { MemoryRuntimeState } from "../types";
import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";

const SEED = "The old stone bridge over the river collapsed in the flood and is gone.";
const STANDING = "The old stone bridge over the river is still standing and intact.";
const USABLE = "The old stone bridge over the river is intact and usable.";
const COURIER_QUOTE = "It held firm under my boots, same as ever.";

// ST vectors as lane 2 answered them (test/journeys/records/v2.4-plan07/contradiction-live-9b2f890a5987/
// pair-cosine-probe.json): the server keeps a match only when its cosine reaches the threshold.
const mockVectors = { on: false, inserts: 0, collections: new Map<string, Array<{ index: number; text: string }>>() };
const MEASURED_COSINE = new Map<string, number>([[`${SEED}|${STANDING}`, 0.4102], [`${SEED}|${USABLE}`, 0.3587]]);
function mockCosine(left: string, right: string): number {
  if (left === right) return 1;
  return MEASURED_COSINE.get(`${left}|${right}`) ?? MEASURED_COSINE.get(`${right}|${left}`) ?? 0;
}

// The record keeps the two stored texts but not the line kind each came from, so the read below emits
// both kinds a shared read can: a FACT line and a MEMORY line of another type (event).
const COURIER_READ = [
  `FACT importance=3 text="${STANDING}" evidence="${COURIER_QUOTE}"`,
  `MEMORY type=event importance=2 expiration=permanent text="${USABLE}" evidence="${COURIER_QUOTE}"`,
  "SCENE_NONE",
].join("\n");

// J8.5's own seed step (test/journeys/j8-stagecraft.journey.json): a facts-tier MEMORY line through
// `applyExtractionAudit`, window {100000, 100000}.
const SEED_LINE: ParsedMemoryLine = { tier: "facts", type: "fact", importance: 3, expiration: "permanent", entities: [], text: SEED, evidence: "the flood took the bridge" };

const story = {
  title: "SO-J8 Stagecraft",
  id: "so-j8",
  version: 1,
  checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } },
  qualityByKey: {},
  roster: [{ id: "arin", name: "Arin" }],
  arc_bridges: [],
};

const memoryState = (): MemoryRuntimeState => ({
  entries: [],
  excluded: [],
  writeLog: [],
  settings: { enabled: true, epistemicLedgerCapable: false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierBudgets: { facts: 50, session_details: 40, short_term: 10, scene_history: 20 }, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 } },
  backfill: null,
  sceneCount: 0,
  shortTermSummaryEnd: -1,
  wiWrites: {},
  wiBook: null,
  arcs: [],
  epistemic: [],
  ledger: [],
  canon: null,
  verifyDrops: [],
  derived: [],
  conflicts: [],
  resolvedConflicts: [],
  pinnedOverflow: 0,
  legacyPinPromptSeen: false,
  storyStart: 0,
  updatedAt: "t",
});

function harness() {
  const current: RunContext = { chatId: "chat-a", storyId: "so-j8", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memory = memoryState();
  const engine = { activeCheckpointId: "cp1", boundary: 0, lastMessageId: 0, blackboard: { values: {}, versions: {} } };
  const extraction = { audits: [] as unknown[], reconciliationEvents: [] as unknown[], judgedReads: [] as unknown[] };
  const memoryCoordinator = new MemoryCoordinator({
    getStory: () => story,
    getState: () => engine,
    getMemory: () => memory,
    setMemory: (next: MemoryRuntimeState) => { memory = next; },
    getExtractionSettings: () => ({ profileId: "p1", enabled: true }),
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    ownership,
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);
  const extractionCoordinator = new ExtractionCoordinator({
    getStory: () => story,
    getState: () => engine,
    getExtraction: () => extraction,
    getSettings: () => ({ profileId: "p1", enabled: true, cadence: 1 }),
    memory: memoryCoordinator,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => {},
    fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    judge: () => null,
    persist: async () => {},
    notify: () => {},
    ownership,
  } as never);
  const audit = (id: string, from: number, to: number) => ({ id, createdAt: "t", priority: 0, reason: "cadence", contractHash: "h", scope: [], window: { from, to }, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] });
  return {
    memory: () => memory,
    coordinator: memoryCoordinator,
    seed: async (as: "lock" | "pin" | "none") => {
      await extractionCoordinator.applyAudit(audit("j8-warden-seed", 100000, 100000) as never, [], [SEED_LINE]);
      const seed = memory.entries.find((entry) => entry.text === SEED)!;
      if (as === "lock") await memoryCoordinator.setMemoryLocked(seed.id, true);
      if (as === "pin") await memoryCoordinator.setMemoryPinned(seed.id, true);
      return seed;
    },
    read: async (raw: string, messageId = 1) => {
      engine.boundary += 1;
      engine.lastMessageId = messageId;
      const parsed = parseSharedReadResponse(raw, story as never);
      await extractionCoordinator.applyAudit(audit(`courier-${messageId}`, messageId, messageId) as never, parsed.facts, parsed.memory);
    },
    warden: () => establishedFacts(memory.entries, [], {}, memory.conflicts).map((fact) => fact.text),
  };
}

const row = (memory: MemoryRuntimeState, text: string): MemoryEntry | undefined => memory.entries.find((entry) => entry.text === text);
const heldPairs = (memory: MemoryRuntimeState): ConflictPair[] => memory.conflicts.filter((pair) => pair.sides.some((side) => side.store === "memory" && side.label === SEED));

describe("a new claim that contradicts an established fact is held, not stored live (v2.4 plan 07, J8.5)", () => {
  it("holds both Courier rows in the queue and leaves the locked seed as the warden's only fact", async () => {
    const env = harness();
    await env.seed("lock");
    await env.read(COURIER_READ);
    const memory = env.memory();
    for (const text of [STANDING, USABLE]) {
      expect({ text, stored: Boolean(row(memory, text)), live: isLive(row(memory, text) ?? {}) }).toEqual({ text, stored: true, live: false });
    }
    expect(heldPairs(memory)).toHaveLength(2);
    expect(isLive(row(memory, SEED)!)).toBe(true);
    expect(row(memory, SEED)!.contradicted).toBeFalsy();
    expect(env.warden()).toEqual([SEED]);
  });

  it("names the seed as the side that keeps steering, and reads the window the claim came from", async () => {
    const env = harness();
    const seed = await env.seed("lock");
    await env.read(COURIER_READ, 1);
    const pair = heldPairs(env.memory())[0];
    expect(pair.sides.find((side) => side.id === seed.id)?.standing).toBe(true);
    expect(pair.sides.find((side) => side.id !== seed.id)?.standing).toBeUndefined();
    expect(pair.window).toEqual({ from: 1, to: 1 });
  });

  it("keeps the seed live when the conflict detector runs over the queue again", async () => {
    const env = harness();
    await env.seed("lock");
    await env.read(COURIER_READ);
    env.coordinator.detectMemoryConflicts();
    expect(isLive(row(env.memory(), SEED)!)).toBe(true);
    expect(env.warden()).toEqual([SEED]);
  });

  it("lets the author keep the seed as canon: the claim is retired and the seed is locked", async () => {
    const env = harness();
    const seed = await env.seed("lock");
    await env.read(COURIER_READ);
    const pair = heldPairs(env.memory()).find((candidate) => candidate.sides.some((side) => side.label === STANDING))!;
    expect(await env.coordinator.resolveMemoryConflict(pair.key, seed.id, true)).toBe(true);
    expect(row(env.memory(), SEED)).toMatchObject({ locked: true, pinned: true });
    expect(row(env.memory(), STANDING)?.supersededBy).toBe(seed.id);
  });

  // Anti-vacuity: the hold is about a claim in the seed's band, not about every new row.
  it("stores an unrelated claim live next to the locked seed", async () => {
    const env = harness();
    await env.seed("lock");
    await env.read(`FACT importance=2 text="Arin carries two curved daggers." evidence="${COURIER_QUOTE}"`);
    expect(isLive(row(env.memory(), "Arin carries two curved daggers.")!)).toBe(true);
    expect(env.memory().conflicts).toEqual([]);
  });

  it("stores a verbatim restatement of the seed live: agreeing is not contradicting", async () => {
    const env = harness();
    await env.seed("lock");
    await env.read(`FACT importance=3 text="${SEED}" evidence="${COURIER_QUOTE}"`);
    expect(env.memory().entries.filter((entry) => entry.text === SEED).every((entry) => isLive(entry))).toBe(true);
    expect(env.memory().conflicts).toEqual([]);
  });

  // The consolidation half: a claim that went live BEFORE the author locked the seed. The walk finds
  // the pair as undecided; it used to mark the older row (the seed) `contradicted`, which drops it
  // from the warden's facts and leaves the claim standing alone.
  it("holds a claim consolidation finds against a seed locked after the claim went live", async () => {
    const env = harness();
    const seed = await env.seed("none");
    await env.read(`FACT importance=3 text="${STANDING}" evidence="${COURIER_QUOTE}"`, 1);
    const fillers = ["Arin carries two curved daggers.", "Ponticius keeps the guild ledger locked.", "Rain fell on the eastern hills all week.", "The market sells dried figs cheaply.", "A grey mare waits tied near the inn.", "Wolves were heard beyond the northern ridge."];
    for (const [index, text] of fillers.entries()) await env.read(`FACT importance=1 text="${text}" evidence="${COURIER_QUOTE}"`, index + 2);
    expect(isLive(row(env.memory(), STANDING)!)).toBe(true);
    await env.coordinator.setMemoryLocked(seed.id, true);
    await env.coordinator.runConsolidation();
    expect(row(env.memory(), SEED)!.contradicted).toBeFalsy();
    expect(isLive(row(env.memory(), STANDING)!)).toBe(false);
    expect(env.warden()).not.toContain(STANDING);
    expect(env.warden()).toContain(SEED);
  });

  // Main-session decision (2026-09-25): a pin is retention, not truth (v2.3 M5). A pinned extracted fact
  // keeps today's behaviour, so the contradicting claim is stored live next to it.
  it("a pinned (not locked) extracted fact does not hold a contradicting claim", async () => {
    const env = harness();
    await env.seed("pin");
    await env.read(COURIER_READ);
    expect(isLive(row(env.memory(), STANDING)!)).toBe(true);
    expect(isLive(row(env.memory(), USABLE)!)).toBe(true);
    expect(env.memory().conflicts).toEqual([]);
  });

  // The stated scope: an extractor row nobody locked or decided is not established. This is the
  // exact state J8.5 seeded before its fixture locked the seed, and it still stores the claim live.
  it("does not treat a plain extractor-read seed as established (J8.5 as first seeded)", async () => {
    const env = harness();
    await env.seed("none");
    await env.read(COURIER_READ);
    expect(isLive(row(env.memory(), STANDING)!)).toBe(true);
    expect(env.memory().conflicts).toEqual([]);
  });
});

// Found live (2026-09-25, bundle 9b2f890a5987, RED x2): with ST vectors present the vectors band alone
// decided the pair, and the Courier claims sit at cosine 0.410 / 0.359 against the seed, under the 0.55
// same-topic band, so both were stored live. Jaccard scores the same pairs 0.533 / 0.571 against its 0.4
// band. Decision: for an ESTABLISHED row, either band holds the claim; ordinary consolidation keeps one source.
describe("an established fact is guarded by the vectors band OR the Jaccard band (v2.4 plan 07, live RED)", () => {
  beforeEach(() => { mockVectors.on = true; mockVectors.inserts = 0; mockVectors.collections.clear(); });
  afterEach(() => { mockVectors.on = false; });

  it("holds both Courier rows against the locked seed when the vectors query misses the pair", async () => {
    const env = harness();
    await env.seed("lock");
    await env.read(COURIER_READ);
    const memory = env.memory();
    expect(mockVectors.inserts).toBeGreaterThan(0);
    for (const text of [STANDING, USABLE]) {
      expect({ text, stored: Boolean(row(memory, text)), live: isLive(row(memory, text) ?? {}) }).toEqual({ text, stored: true, live: false });
    }
    expect(heldPairs(memory)).toHaveLength(2);
    expect(env.warden()).toEqual([SEED]);
  });

  it.each(["pin", "none"] as const)("stores the same claims live next to a %s (not established) seed", async (as) => {
    const env = harness();
    await env.seed(as);
    await env.read(COURIER_READ);
    expect(isLive(row(env.memory(), STANDING)!)).toBe(true);
    expect(isLive(row(env.memory(), USABLE)!)).toBe(true);
    expect(env.memory().conflicts).toEqual([]);
  });

  it("stores an unrelated claim live next to the locked seed", async () => {
    const env = harness();
    await env.seed("lock");
    await env.read(`FACT importance=2 text="Arin carries two curved daggers." evidence="${COURIER_QUOTE}"`);
    expect(mockVectors.inserts).toBeGreaterThan(0);
    expect(isLive(row(env.memory(), "Arin carries two curved daggers.")!)).toBe(true);
    expect(env.memory().conflicts).toEqual([]);
  });

  // Ordinary fact-vs-fact consolidation keeps the single source: with vectors present, Jaccard's band
  // does not reach the walk, so the undecided pair it would find is not soft-marked.
  it("consolidation between two ordinary rows still reads the vectors band alone", async () => {
    const env = harness();
    await env.seed("none");
    await env.read(`FACT importance=3 text="${STANDING}" evidence="${COURIER_QUOTE}"`, 1);
    const fillers = ["Arin carries two curved daggers.", "Ponticius keeps the guild ledger locked.", "Rain fell on the eastern hills all week.", "The market sells dried figs cheaply.", "A grey mare waits tied near the inn.", "Wolves were heard beyond the northern ridge."];
    for (const [index, text] of fillers.entries()) await env.read(`FACT importance=1 text="${text}" evidence="${COURIER_QUOTE}"`, index + 2);
    await env.coordinator.runConsolidation();
    expect(mockVectors.inserts).toBeGreaterThan(0);
    expect(row(env.memory(), SEED)!.contradicted).toBeFalsy();
    expect(isLive(row(env.memory(), STANDING)!)).toBe(true);
    expect(env.memory().conflicts).toEqual([]);
  });
});
