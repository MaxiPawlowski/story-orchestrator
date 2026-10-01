import { keptStagedFrom, parseStoryV2OrThrow, ROLLBACK_HORIZON, StoryEngine } from "@engine/index";
import { stagedPath } from "./worldInfoGates";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "staging",
  title: "Staging",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "hall", name: "Hall", objective: "", type: "anchor", start: true },
    { id: "far", name: "Far", objective: "", type: "anchor" },
    { id: "end", name: "End", objective: "", type: "anchor" },
  ],
  transitions: [
    { from: "hall", to: "far", priority: 1, gate: { q: "done", op: "==", v: true } },
    { from: "far", to: "end", priority: 1, gate: { q: "done", op: "==", v: true } },
  ],
  roster: [],
});

const staged = (engine: StoryEngine) => stagedPath(engine.checkpointPath, engine.serialize().stagedFrom);

const jumpedThenPlayed = (turns: number) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
  engine.activateCheckpoint("far", { lastMessageId: 1, chatLength: 2 });
  for (let turn = 0; turn < turns; turn += 1) engine.commitBoundary({ lastMessageId: 2 + turn, chatLength: 3 + turn });
  return engine;
};

describe("CR-E2: the C4 staging start is state, not a boundary-log lookup", () => {
  it("still stages from the jump after more boundaries than the log retains", () => {
    const engine = jumpedThenPlayed(ROLLBACK_HORIZON + 10);
    expect(engine.stateLog.some((entry) => entry.source === "manual")).toBe(false);
    expect(staged(engine)).toEqual(["far"]);
  });

  it("a reopened chat (state + history hydrated into a fresh engine) replays the same staging", () => {
    const engine = jumpedThenPlayed(ROLLBACK_HORIZON + 10);
    const reopened = new StoryEngine({ now: () => 0 });
    reopened.loadStory(story);
    reopened.hydrate(engine.serialize(), engine.serializeHistory());
    expect(staged(reopened)).toEqual(["far"]);
  });

  it("a rollback inside the retained window keeps the staging; a rollback to before the jump clears it", () => {
    const engine = jumpedThenPlayed(ROLLBACK_HORIZON + 10);
    expect(engine.rollbackTo(engine.getBoundary() - 5).ok).toBe(true);
    expect(staged(engine)).toEqual(["far"]);
    const short = jumpedThenPlayed(3);
    expect(short.rollbackTo(1)).toEqual({ ok: true, result: "applied" });
    expect(short.checkpointPath).toEqual(["hall"]);
    expect(staged(short)).toEqual(["hall"]);
  });

  it("a gate transition after the jump keeps the staging start; no jump stages the whole path", () => {
    const engine = jumpedThenPlayed(2);
    engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "done", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 9, chatLength: 10 });
    expect(engine.checkpointPath).toEqual(["hall", "far", "end"]);
    expect(staged(engine)).toEqual(["far", "end"]);
    const plain = new StoryEngine({ now: () => 0 });
    plain.loadStory(story);
    expect(staged(plain)).toEqual(["hall"]);
    expect(plain.serialize().stagedFrom).toBeUndefined();
  });

  it("an edit that drops a checkpoint before the jump keeps the staging pointed at the same checkpoint", () => {
    const engine = jumpedThenPlayed(1);
    const state = { ...engine.serialize(), visitedPath: ["hall", "far", "end"], stagedFrom: 1 };
    const kept = keptStagedFrom(state, (ids) => ids.filter((id) => id !== "hall"));
    expect(kept).toEqual({ stagedFrom: undefined });
    const wider = { ...state, visitedPath: ["hall", "x", "far", "end"], stagedFrom: 2 };
    expect(keptStagedFrom(wider, (ids) => ids.filter((id) => id !== "x"))).toEqual({ stagedFrom: 1 });
  });

  it("a stored state without the field, or with a malformed one, hydrates as unstaged", () => {
    const engine = jumpedThenPlayed(1);
    const { stagedFrom: _stagedFrom, ...legacy } = engine.serialize();
    const reopened = new StoryEngine({ now: () => 0 });
    reopened.loadStory(story);
    reopened.hydrate(legacy);
    expect(staged(reopened)).toEqual(["hall", "far"]);
    reopened.hydrate({ ...legacy, stagedFrom: "x" as unknown as number });
    expect(reopened.serialize().stagedFrom).toBeUndefined();
  });
});
