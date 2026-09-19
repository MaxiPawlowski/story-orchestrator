import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { selectWithinBudget } from "@memory/budget";
import { applyConsolidation, consolidateTier, type MatchSets } from "@memory/consolidate";
import { activeEpistemic, applyEpistemicSignals, renderPrivateEpistemicBlock, rollbackEpistemic } from "@memory/epistemic";
import { applyLedgerSignals, rollbackLedger } from "@memory/ledger";
import { addMemoryEntries, capTier, createMemoryState, dropByMessageId, editEntryText, expireScoped } from "@memory/stores";
import type { EpistemicEntry, MemoryEntry, MemoryStoreState } from "@memory/types";

const memory = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "memory-1",
  tier: "facts",
  text: "Mara trusts the player and helps freely",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: ["Mara"],
  confidence: 1,
  activationTriggers: [],
  evidence: "Mara offered help",
  createdAt: 1,
  messageId: 1,
  recallCount: 0,
  ...overrides,
});

const duplicatePairMatches = (): MatchSets => ({
  dup: [new Set([1]), new Set([0])],
  sameTopic: [new Set(), new Set()],
});

describe("review: memory rollback is equivalent to never applied", () => {
  test("control: a superseding fact retires its unpinned predecessor", () => {
    const entries = [
      memory({ id: "old", messageId: 1, createdAt: 1 }),
      memory({ id: "new", messageId: 10, createdAt: 10, text: "Mara no longer trusts the player and helps freely" }),
    ];
    expect(consolidateTier(entries, duplicatePairMatches()).supersededPairs).toEqual([{ loserId: "old", winnerId: "new" }]);
  });

  test("M1: rollback reactivates a predecessor whose superseding fact was removed", () => {
    const old = memory({ id: "old", messageId: 1, createdAt: 1 });
    const newer = memory({ id: "new", messageId: 10, createdAt: 10, text: "Mara no longer trusts the player and helps freely" });
    const state = applyConsolidation(
      { ...createMemoryState(), entries: [old, newer] },
      consolidateTier([old, newer], duplicatePairMatches()),
    );

    const rolled = dropByMessageId(state, 10);
    expect(rolled.entries).toEqual([old]);
  });

  test("M2: rollback clears completed-read coverage so the forced re-read can repopulate memory", () => {
    const first = addMemoryEntries(createMemoryState(), [memory({ id: "before", messageId: 5 })], { from: 0, to: 9 }).state;
    const rolled = dropByMessageId(first, 0);
    const reread = addMemoryEntries(rolled, [memory({ id: "after", messageId: 5, text: "Mara distrusts the player after the corrected scene" })], { from: 0, to: 9 });

    expect(reread.accepted.map((entry) => entry.id)).toEqual(["after"]);
    expect(reread.state.entries.map((entry) => entry.id)).toEqual(["after"]);
  });

  test("control: a newly-created ledger row is removed by rollback", () => {
    const rows = applyLedgerSignals([], [{ entity: "Mara", entityType: "character", field: "condition", value: "injured" }], new Set(), { boundary: 10, messageId: 10 });
    expect(rollbackLedger(rows, 10)).toEqual([]);
  });

  test("M3: rollback restores the prior value of an updated ledger row", () => {
    const before = applyLedgerSignals([], [{ entity: "Mara", entityType: "character", field: "condition", value: "healthy" }], new Set(), { boundary: 1, messageId: 1 });
    const updated = applyLedgerSignals(before, [{ entity: "Mara", entityType: "character", field: "condition", value: "injured" }], new Set(), { boundary: 10, messageId: 10 });
    const rolled = rollbackLedger(updated, 10);

    expect(rolled).toHaveLength(1);
    expect(rolled[0]).toMatchObject({ value: "healthy", messageId: 1, createdAt: 1 });
  });

  test("M4: rollback reverses an epistemic retirement caused by the removed reveal", () => {
    const initial = applyEpistemicSignals([], [{ subject: "Mara", tag: "believes", content: "the bridge is safe" }], { boundary: 1, messageId: 1 }).entries;
    const retired = applyEpistemicSignals(initial, [], { boundary: 10, messageId: 10 }, [initial[0].id]).entries;
    expect(activeEpistemic(retired)).toHaveLength(0);

    const rolled = rollbackEpistemic(retired, 10);
    expect(activeEpistemic(rolled).map((entry) => entry.id)).toEqual([initial[0].id]);
  });
});

describe("review: pinning preserves records without freezing stale truth", () => {
  test("control: pinning protects records from count trimming and ordinary expiry", () => {
    const pinned = memory({ id: "pinned", pinned: true, expiration: "scene" });
    const state: MemoryStoreState = { ...createMemoryState(), entries: [pinned, memory({ id: "new", createdAt: 2 })] };
    expect(capTier(state, "facts", 1).entries.map((entry) => entry.id)).toContain("pinned");
    expect(expireScoped(state, "scene").entries.map((entry) => entry.id)).toContain("pinned");
  });

  test("M5: pinning keeps the old record but does not discard a later state change", () => {
    const old = memory({ id: "old", pinned: true, createdAt: 1 });
    const newer = memory({ id: "new", createdAt: 2, text: "Mara no longer trusts the player and helps freely" });
    const result = consolidateTier([old, newer], duplicatePairMatches());

    expect(result.droppedIds).not.toContain("new");
    expect(result.supersededPairs).toContainEqual({ loserId: "old", winnerId: "new" });
  });

  test("M6: pinning cannot keep a private fact sourced only from removed chat text", () => {
    const secret: EpistemicEntry = {
      id: "secret",
      subject: "Mara",
      tag: "knows",
      content: "the player is the masked traitor",
      createdAt: 10,
      messageId: 10,
      pinned: true,
    };
    const rolled = rollbackEpistemic([secret], 10);

    expect(renderPrivateEpistemicBlock(rolled, ["Mara"])).toBe("");
  });
});

describe("review: token budgets survive manual edits", () => {
  test("control: uncached oversized text is rejected by a small token budget", () => {
    const oversized = memory({ id: "long", text: "x".repeat(80), tokens: undefined });
    expect(selectWithinBudget([oversized], 4, () => 1).kept.has("long")).toBe(false);
  });

  test("M7: editing text invalidates its cached token count", () => {
    const state: MemoryStoreState = { ...createMemoryState(), entries: [memory({ id: "edited", text: "tiny", tokens: 1 })] };
    const edited = editEntryText(state, "edited", "x".repeat(80)).entries[0];

    expect(selectWithinBudget([edited], 4, () => 1).kept.has("edited")).toBe(false);
  });
});

const stationaryStory = () => parseStoryV2OrThrow({
  format: 2,
  id: "history-review",
  title: "History review",
  description: "Long-running rollback fixture",
  qualities: [{ key: "counter", type: "int", source: "extractor", rubric: "Latest counter?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "Wait", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const longHistoryEngine = (boundaries = 205) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(stationaryStory());
  for (let i = 0; i < boundaries; i += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: i, turnRange: { from: i, to: i }, deltas: [{ q: "counter", v: i, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: i, chatLength: i + 1 });
  }
  return engine;
};

describe("review: engine long-history and large-graph behavior", () => {
  test("control: a recent mutation remains rollback-capable after 205 boundaries", () => {
    const engine = longHistoryEngine();
    expect(engine.shouldRollbackFromMessage(204)).toBe(true);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(204))).toBe(true);
  });

  test("E1: an old mutation that requires rollback is not silently lost at the 200-snapshot horizon", () => {
    const engine = longHistoryEngine();
    expect(engine.shouldRollbackFromMessage(0)).toBe(true);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(0))).toBe(true);
    expect(engine.serialize().boundary).toBe(0);
  });

  test("measurement: a 1,000-checkpoint chain parses and traverses correctly", () => {
    const size = 1_000;
    const checkpoints = Array.from({ length: size }, (_, index) => ({
      id: `cp${index}`,
      name: `Checkpoint ${index}`,
      objective: `Reach ${index + 1}`,
      type: index === 0 || index === size - 1 ? "anchor" : "intermediate",
      ...(index === 0 ? { start: true } : {}),
    }));
    const transitions = Array.from({ length: size - 1 }, (_, index) => ({
      id: `t${index}`,
      from: `cp${index}`,
      to: `cp${index + 1}`,
      priority: 0,
      gate: { q: "advance", op: "==", v: true },
    }));
    const started = Date.now();
    const story = parseStoryV2OrThrow({
      format: 2,
      id: "large-graph-review",
      title: "Large graph review",
      description: "Stress fixture",
      qualities: [{ key: "advance", type: "bool", source: "extractor", latching: true, rubric: "Advance?" }],
      checkpoints,
      transitions,
      roster: [],
    });
    const parsedMs = Date.now() - started;
    expect(story.reachableByCheckpoint.cp0).toHaveLength(size - 1);

    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 0 }, deltas: [{ q: "advance", v: true, source: "extractor" }] });
    const traversalStarted = Date.now();
    for (let i = 0; i < size - 1; i += 1) engine.commitBoundary({ lastMessageId: i, chatLength: i + 1 });
    const traversalMs = Date.now() - traversalStarted;

    expect(engine.serialize().activeCheckpointId).toBe(`cp${size - 1}`);
    console.info(JSON.stringify({ reviewMeasurement: "large-graph", checkpoints: size, parsedMs, traversalMs }));
  });
});
