jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: () => ({ chat: [] }),
}));
jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

import { StoryEngine, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { mergeExpansions } from "@generation/merge";
import type { ExpansionCacheEntry, ExpansionRuntimeState } from "@generation/types";
import { ExpansionCoordinator } from "./coordinators/expansionCoordinator";
import { LOST_CHECKPOINT, runRollback, type RollbackDeps } from "./rollback";
import { derivePipelineStatus } from "./pipeline";
import type { RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const RAW: StoryV2 = {
  format: 2,
  id: "t61-road",
  title: "Road",
  description: "T6-1-2 shape: a generated chain off a stub, left by the stub's own exit into an anchor with a state snapshot.",
  qualities: [
    { key: "camp", type: "bool", source: "extractor", rubric: "Camped?" },
    { key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" },
    { key: "rested", type: "bool", source: "extractor", rubric: "Rested?" },
    { key: "location", type: "string", source: "extractor", rubric: "Where?" },
  ],
  checkpoints: [
    { id: "road", name: "Road", objective: "Travel.", type: "anchor", start: true },
    { id: "on-road", name: "On the road", objective: "Camp.", type: "intermediate" },
    { id: "walls", name: "Walls", objective: "Arrive.", type: "anchor", state_snapshot: { location: "walls" } },
  ],
  transitions: [
    { from: "road", to: "on-road", priority: 1, gate: { q: "camp", op: "==", v: true } },
    { from: "on-road", to: "walls", priority: 1, gate: { q: "arrived", op: "==", v: true } },
  ],
  roster: [],
} as unknown as StoryV2;

const beat = (id: string, deltas: Array<{ q: string; v: string }> = []) => ({ id, title: `Beat ${id}`, objective: "Keep going.", guidance: "Go.", tension_target: "medium", outcomes: [{ id: `${id}:0`, label: "rest", gate: { q: "rested", op: "==", v: true }, deltas }] });

const entry = (): ExpansionCacheEntry => ({
  key: "road->on-road->walls", status: "inserted", contract: 2, sourceCheckpointId: "road", stubId: "on-road", targetAnchorId: "walls",
  basis: { location: "road" }, blackboardVersionSum: 0, beats: [beat("0"), beat("1", [{ q: "location", v: "walls" }])], needsReview: false, verdicts: [], codeCheck: null,
  insertedCheckpointIds: ["gen_on-road_1", "gen_on-road_2"], lastError: null, attempts: 1, origin: "active", updatedAt: "",
}) as unknown as ExpansionCacheEntry;

const host = { now: () => 1000 };

const harness = (options: { restore?: boolean } = {}) => {
  const engine = new StoryEngine(host);
  const expansion: ExpansionRuntimeState = { entries: { "road->on-road->walls": entry() }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } };
  let story: NormalizedStoryV2 = mergeExpansions(RAW, expansion.entries);
  engine.loadStory(story);
  const coordinator = new ExpansionCoordinator({ hosts: { player: { getPlayerName: () => "Max" } }, ownership: testOwnership(),
    getStory: () => story,
    getStoryRaw: () => RAW,
    getState: () => engine.serialize() as EngineState,
    getExpansion: () => expansion,
    model: async () => ({ text: "", finish: "stop" }),
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: (next) => { story = next; engine.replaceGraph(next); },
    setStatus: () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
  });
  const journal: Array<{ summary: string; note?: string }> = [];
  const extras = { extraction: { audits: [] }, judge: { calls: [] }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] }, firedNpcReplies: {}, memory: {} } as unknown as RuntimeExtras;
  let context = { lastMessageId: 3, chatLength: 4 };
  const deps = {
    engine,
    journal: { record: (_kind: string, summary: string, _ctx: unknown, note?: string) => journal.push({ summary, note }), getRecords: () => [] },
    ownership: testOwnership(),
    context: () => ({ ...context, journal: { boundary: engine.getBoundary(), messageId: context.lastMessageId } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => coordinator.revalidateInserted(),
    restoreExpansion: (boundary: number) => (options.restore === false ? 0 : coordinator.restoreStaledAfter(boundary)),
    extras: () => extras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  const commit = (deltas: Array<{ q: string; v: boolean | string }>, lastMessageId: number) => {
    coordinator.revalidateInserted();
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas });
    const result = engine.commitBoundary({ lastMessageId, chatLength: lastMessageId + 1 });
    coordinator.revalidateInserted();
    context = { lastMessageId, chatLength: lastMessageId + 1 };
    return result;
  };
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "location", v: "road" }] });
  engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
  const enterGenerated = () => commit([{ q: "camp", v: true }], 1);
  const leaveForWalls = () => commit([{ q: "arrived", v: true }, { q: "location", v: "outside the gate" }], 3);
  return { engine, expansion, coordinator, deps, journal, commit, enterGenerated, leaveForWalls, story: () => story };
};

describe("T6-1-2 HIGH: swiping the reply that left a generated checkpoint (turns.jsonl:10/15, console.jsonl:18)", () => {
  it("reproduces the recorded shape: the chain is staled once play leaves it, and the graph loses its checkpoints", () => {
    const h = harness();
    expect(h.enterGenerated().activeCheckpointId).toBe("gen_on-road_1");
    expect(h.leaveForWalls().activeCheckpointId).toBe("walls");
    expect(h.expansion.entries["road->on-road->walls"]).toMatchObject({ status: "stale", lastError: "location drifted from expansion basis", staledAt: { boundary: 3, from: "inserted" } });
    expect(h.story().checkpointById["gen_on-road_1"]).toBeUndefined();
  });

  it("rollback restores the chain staled after the restored boundary, so the engine resumes on the generated checkpoint (rollback == replay)", async () => {
    const h = harness();
    h.enterGenerated();
    h.leaveForWalls();
    await expect(runRollback(h.deps, 3)).resolves.toEqual({ ok: true, result: "applied" });
    expect(h.engine.activeCheckpoint?.id).toBe("gen_on-road_1");
    expect(h.expansion.entries["road->on-road->walls"].status).toBe("inserted");
    expect(h.expansion.entries["road->on-road->walls"].staledAt).toBeUndefined();
    expect(h.journal).toEqual([]);
    const replay = harness();
    replay.enterGenerated();
    expect(h.engine.serialize()).toEqual(replay.engine.serialize());
    expect(Object.keys(h.story().checkpointById)).toEqual(Object.keys(replay.story().checkpointById));
  });

  it("after the rollback the next boundary commits and the swiped turn can leave again", async () => {
    const h = harness();
    h.enterGenerated();
    h.leaveForWalls();
    await runRollback(h.deps, 3);
    expect(h.leaveForWalls().activeCheckpointId).toBe("walls");
    expect(h.engine.getBoundary()).toBe(3);
  });

  it("control: without the expansion restore the rollback no longer parks on a checkpoint the graph lacks; it resumes on the trail and says so", async () => {
    const h = harness({ restore: false });
    h.enterGenerated();
    h.leaveForWalls();
    await runRollback(h.deps, 3);
    expect(h.engine.activeCheckpoint?.id).toBe("road");
    expect(h.journal).toEqual([{ summary: LOST_CHECKPOINT, note: "the saved checkpoint gen_on-road_1 is not in this story's graph; resumed at road" }]);
    expect(h.commit([{ q: "rested", v: true }], 3).boundary).toBe(3);
  });

  it("control: a chain staled at or before the restored boundary stays stale", () => {
    const h = harness();
    h.expansion.entries["road->on-road->walls"] = { ...entry(), status: "stale", staledAt: { boundary: 0, from: "inserted" } };
    expect(h.coordinator.restoreStaledAfter(0)).toBe(0);
    expect(h.expansion.entries["road->on-road->walls"].status).toBe("stale");
  });
});

describe("T6-1-2 HIGH: a played state with no active checkpoint surfaces instead of freezing", () => {
  const extraction = { settings: { enabled: true, profileId: "p" }, scheduler: { lastError: null, inFlight: false, queueDepth: 0 }, reconciliationEvents: [], audits: [] } as unknown as RuntimeExtras["extraction"];

  it("the pipeline reads error, with the missing id in the author detail only", () => {
    const status = derivePipelineStatus(extraction, undefined, null, false, null, "gen_on-road_1");
    expect(status.state).toBe("error");
    expect(status.text).not.toContain("gen_on-road_1");
    expect(status.detail).toContain("gen_on-road_1");
  });

  it("control: a found checkpoint keeps the pipeline idle", () => {
    expect(derivePipelineStatus(extraction, undefined, null, false, { id: "walls" }, null).state).toBe("idle");
  });
});
