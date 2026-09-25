jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
}));

import { buildJaccardMatchSets, conflictWindow, heldContradictions, heldGroup, isEstablished, isLive, provenance, unionMatchSets, withOverride, type MatchSets, type MemoryEntry } from "@memory/index";
import { detectMemoryConflicts, dismissMemoryConflict, findHeldContradictions, holdMemoryContradictions, settleUncertain, type MemoryQueueDeps } from "./memoryQueue";
import type { MemoryRuntimeState } from "./types";

// v2.4 plan 07 (J8.5): the queue's half of holding a claim that contradicts an established row.

const SEED = "The old stone bridge over the river collapsed in the flood and is gone.";
const STANDING = "The old stone bridge over the river is still standing and intact.";

const entry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "m1",
  tier: "facts",
  text: SEED,
  type: "fact",
  importance: 3,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: "e",
  createdAt: 0,
  messageId: 0,
  recallCount: 0,
  provenance: provenance({ source: "extractor", messageId: 0, boundary: 0, pass: "shared-read" }),
  ...overrides,
});

const decided = () => withOverride(entry(), "reconciled", "2026-09-25T00:00:00.000Z", 1).provenance;
const seed = (overrides: Partial<MemoryEntry> = {}) => entry({ id: "seed", provenance: decided(), ...overrides });
const claim = (overrides: Partial<MemoryEntry> = {}) => entry({ id: "claim", text: STANDING, createdAt: 1, messageId: 4, provenance: provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "shared-read" }), ...overrides });

const state = (entries: MemoryEntry[]): MemoryRuntimeState => ({
  entries,
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
  updatedAt: "t",
});

function harness(entries: MemoryEntry[], matchSets?: MemoryQueueDeps["matchSets"]) {
  let memory = state(entries);
  const deps: MemoryQueueDeps = {
    getMemory: () => memory,
    patch: (next) => { memory = { ...memory, ...next }; },
    boundValues: () => ({}),
    boundaryStamp: () => 2,
    updateInjection: () => {},
    save: async () => {},
    ...(matchSets ? { matchSets } : {}),
  };
  return { deps, read: () => memory, row: (id: string) => memory.entries.find((candidate) => candidate.id === id)! };
}

const pairedBand = (): MatchSets => ({ dup: [new Set(), new Set()], sameTopic: [new Set(), new Set([0])] });

describe("what counts as established", () => {
  it("is a lock, an author decision or an authored row; never a pin, never a plain read (v2.3 M5)", () => {
    expect(isEstablished(entry({ pinned: true }))).toBe(false);
    expect(isEstablished(entry({ locked: true }))).toBe(true);
    expect(isEstablished(entry({ ...withOverride(entry(), "reconfirm", "t", 1) }))).toBe(true);
    expect(isEstablished(entry({ provenance: provenance({ source: "author", messageId: -1, boundary: 0, pass: "manual" }) }))).toBe(true);
    expect(isEstablished(entry())).toBe(false);
  });
});

describe("unionMatchSets", () => {
  it("keeps every pairing either side found, per row and per band", () => {
    const left: MatchSets = { dup: [new Set([1]), new Set()], sameTopic: [new Set(), new Set()] };
    const right: MatchSets = { dup: [new Set(), new Set()], sameTopic: [new Set([1]), new Set([0])] };
    expect(unionMatchSets(left, right)).toEqual({ dup: [new Set([1]), new Set()], sameTopic: [new Set([1]), new Set([0])] });
  });
});

describe("heldContradictions over the consolidation bands", () => {
  it("holds a same-topic claim against an author-decided row", () => {
    expect(heldContradictions([seed()], [claim()], pairedBand())).toHaveLength(1);
  });

  it("finds the J8.5 pair in the Jaccard same-topic band once both rows read as one type", () => {
    const established = [seed()];
    const candidates = [claim({ type: "event" })];
    expect(heldContradictions(established, candidates, buildJaccardMatchSets(heldGroup(established, candidates)))).toHaveLength(1);
    expect(heldContradictions(established, candidates, buildJaccardMatchSets([...established, ...candidates]))).toHaveLength(0);
  });

  it("lets a state-change update through below a lock, and holds it against a lock", () => {
    const update = claim({ text: "The old stone bridge over the river is now rebuilt." });
    expect(heldContradictions([seed()], [update], pairedBand())).toEqual([]);
    expect(heldContradictions([seed({ locked: true })], [update], pairedBand())).toHaveLength(1);
  });

  it("never holds a verbatim restatement", () => {
    expect(heldContradictions([seed()], [claim({ text: ` ${SEED.toUpperCase()} ` })], { dup: [new Set(), new Set([0])], sameTopic: [new Set(), new Set()] })).toEqual([]);
  });

  it("holds nothing outside the band", () => {
    expect(heldContradictions([seed()], [claim()], { dup: [new Set(), new Set()], sameTopic: [new Set(), new Set()] })).toEqual([]);
  });
});

describe("the queue holds the claim and leaves the established row standing", () => {
  it("builds the bands through the injected matcher, over established rows first", async () => {
    const seen: string[][] = [];
    const h = harness([seed()], async (group) => { seen.push(group.map((row) => row.id)); return pairedBand(); });
    expect(await findHeldContradictions(h.deps, [claim()])).toHaveLength(1);
    expect(seen).toEqual([["seed", "claim"]]);
  });

  const noBand = (): MatchSets => ({ dup: [new Set(), new Set()], sameTopic: [new Set(), new Set()] });

  it("holds through the Jaccard band when the injected (vectors) bands miss the pair (live, cosine 0.410)", async () => {
    const h = harness([seed()], async () => noBand());
    expect(await findHeldContradictions(h.deps, [claim()])).toHaveLength(1);
  });

  it("holds through the injected bands when Jaccard misses the pair", async () => {
    const h = harness([seed()], async () => pairedBand());
    expect(await findHeldContradictions(h.deps, [claim({ text: "The crossing is fine." })])).toHaveLength(1);
  });

  it("holds nothing when neither band pairs the claim with the established row", async () => {
    const h = harness([seed()], async () => noBand());
    expect(await findHeldContradictions(h.deps, [claim({ text: "The crossing is fine." })])).toEqual([]);
  });

  it("asks nothing when no established row is live", async () => {
    const matcher = jest.fn(async () => pairedBand());
    const h = harness([seed({ provenance: { ...decided(), validity: "source-removed" } })], matcher);
    expect(await findHeldContradictions(h.deps, [claim()])).toEqual([]);
    expect(matcher).not.toHaveBeenCalled();
  });

  it("marks only the claim conflicted, and the conflict detector keeps it that way", () => {
    const h = harness([seed(), claim()]);
    holdMemoryContradictions(h.deps, [{ established: seed(), candidate: claim() }]);
    expect(isLive(h.row("claim"))).toBe(false);
    expect(isLive(h.row("seed"))).toBe(true);
    detectMemoryConflicts(h.deps);
    expect(isLive(h.row("seed"))).toBe(true);
    expect(h.read().conflicts[0].window).toEqual({ from: 4, to: 4 });
  });

  it("does not hold a claim the store no longer has, or a pair the author already decided", () => {
    const gone = harness([seed()]);
    expect(holdMemoryContradictions(gone.deps, [{ established: seed(), candidate: claim() }])).toEqual([]);
    const decided = harness([seed(), claim()]);
    decided.deps.patch({ resolvedConflicts: ["held:seed>claim"] });
    expect(holdMemoryContradictions(decided.deps, [{ established: seed(), candidate: claim() }])).toEqual([]);
    expect(isLive(decided.row("claim"))).toBe(true);
  });

  it("puts the claim back in play when the author dismisses the pair", async () => {
    const h = harness([seed(), claim()]);
    const [pair] = holdMemoryContradictions(h.deps, [{ established: seed(), candidate: claim() }]);
    expect(await dismissMemoryConflict(h.deps, pair.key)).toBe(true);
    expect(isLive(h.row("claim"))).toBe(true);
    expect(h.read().resolvedConflicts).toContain(pair.key);
  });

  it("reads the claim's window, never the standing row's", () => {
    expect(conflictWindow({ sides: [{ store: "memory", id: "seed", label: SEED, messageId: 100000, standing: true }, { store: "memory", id: "claim", label: STANDING, messageId: 4 }] })).toEqual({ from: 4, to: 4 });
  });
});

describe("consolidation's undecided pairs (settleUncertain)", () => {
  it("holds the newer claim against an established row and never marks the established row contradicted", () => {
    const h = harness([seed(), claim()]);
    settleUncertain(h.deps, [{ candidateId: "claim", existingId: "seed" }]);
    expect(h.row("seed").contradicted).toBeFalsy();
    expect(isLive(h.row("claim"))).toBe(false);
    expect(h.read().conflicts.map((pair) => pair.key)).toEqual(["held:seed>claim"]);
  });

  it("keeps today's soft mark on the older row when it is not established", () => {
    const h = harness([entry({ id: "seed" }), claim()]);
    settleUncertain(h.deps, [{ candidateId: "claim", existingId: "seed" }]);
    expect(h.row("seed").contradicted).toBe(true);
    expect(h.read().conflicts).toEqual([]);
  });

  it("treats a pinned extracted row as today: soft mark, nothing held (v2.3 M5)", () => {
    const h = harness([entry({ id: "seed", pinned: true }), claim()]);
    settleUncertain(h.deps, [{ candidateId: "claim", existingId: "seed" }]);
    expect(h.row("seed").contradicted).toBe(true);
    expect(isLive(h.row("claim"))).toBe(true);
    expect(h.read().conflicts).toEqual([]);
  });
});
