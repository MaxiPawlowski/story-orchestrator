import { StoryEngine, type EngineState } from "./engine";
import type { StoryDiffCode, StoryDiffResult } from "./storyDiff";
import { diffStories, pruneEngineState } from "./storyDiff";
import { parseStoryV2OrThrow } from "./validate";
import type { StoryV2 } from "./schema";

const baseStory = (): StoryV2 => ({
  format: 2,
  id: "diff-fixture",
  version: 1,
  title: "Diff fixture",
  description: "A tiny story used to classify edits.",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "How much does she trust him?" },
    { key: "pact", type: "bool", source: "extractor", latching: true, rubric: "Was the pact sworn?" },
    { key: "mood", type: "enum", values: ["calm", "angry"], source: "extractor", rubric: "What is the mood?" },
  ],
  checkpoints: [
    { id: "start", name: "The gate", objective: "Arrive", type: "anchor", start: true },
    { id: "middle", name: "The bargain", objective: "Bargain", type: "intermediate" },
    { id: "end", name: "The road", objective: "Leave", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "middle", gate: { q: "trust", op: ">=", v: 2 }, priority: 0 },
    { from: "middle", to: "end", gate: { all: [{ q: "pact", op: "==", v: true }, { q: "trust", op: ">=", v: 5 }] }, priority: 0 },
  ],
  roster: [{ id: "her", name: "Ilse" }, { id: "him", name: "Bran" }],
});

const edited = (patch: (draft: StoryV2) => void): StoryV2 => {
  const draft = JSON.parse(JSON.stringify(baseStory())) as StoryV2;
  patch(draft);
  return draft;
};

// A chat that has played: it is at `middle`, holds trust=3 and has latched the pact.
const playedState = (): EngineState => {
  const engine = new StoryEngine();
  engine.loadStory(parseStoryV2OrThrow(baseStory()));
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "trust", v: 3, source: "extractor" }, { q: "mood", v: "angry", source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "pact", v: true, source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 6, chatLength: 7 });
  return engine.serialize();
};

const withoutTrust = (draft: StoryV2) => {
  draft.qualities = draft.qualities.filter((quality) => quality.key !== "trust");
  draft.transitions = [
    { from: "start", to: "middle", gate: { q: "mood", op: "==", v: "angry" }, priority: 0 },
    { from: "middle", to: "end", gate: { q: "pact", op: "==", v: true }, priority: 0 },
  ];
};

const run = (next: StoryV2, state: EngineState | null = playedState()): StoryDiffResult =>
  diffStories(parseStoryV2OrThrow(baseStory()), parseStoryV2OrThrow(next), state);

const codes = (result: StoryDiffResult): StoryDiffCode[] => result.entries.map((entry) => entry.code);

describe("storyDiff classification table", () => {
  it("reports an unchanged story as identical", () => {
    const result = run(baseStory());
    expect(result).toMatchObject({ classification: "identical", entries: [], droppedQualityKeys: [] });
  });

  it("keeps text, requirements, arc template and arc bridges compatible", () => {
    const result = run(edited((draft) => {
      draft.description = "Rewritten.";
      draft.requirements = { members: ["Ilse"] };
      draft.arc_template = "rising";
      draft.arc_bridges = [{ arcMatch: "pact", anchor: "end", amount: 1 }];
    }));
    expect(result.classification).toBe("compatible");
    expect(codes(result)).toEqual(expect.arrayContaining(["text-changed", "requirements-changed", "arc-template-changed", "arc-bridges-changed"]));
  });

  it("keeps a stagecraft allowlist edit compatible", () => {
    const result = run(edited((draft) => { draft.stagecraft = { lorebooks: ["Diff Lore"] }; }));
    expect(result.classification).toBe("compatible");
    expect(codes(result)).toContain("stagecraft-changed");
  });

  it("treats an added quality as compatible", () => {
    const result = run(edited((draft) => draft.qualities.push({ key: "coin", type: "int", source: "extractor", rubric: "How much coin?" })));
    expect(result).toMatchObject({ classification: "compatible" });
    expect(codes(result)).toContain("quality-added");
  });

  it("invalidates removing a quality this chat holds, and keeps removing an unused one compatible", () => {
    const live = run(edited(withoutTrust));
    expect(live.classification).toBe("invalidating");
    expect(codes(live)).toContain("quality-removed-live");
    expect(live.droppedQualityKeys).toContain("trust");

    const fresh = run(edited(withoutTrust), null);
    expect(fresh.classification).toBe("compatible");
    expect(codes(fresh)).toContain("quality-removed");
  });

  it("invalidates a retype the live value cannot survive, and allows one it can", () => {
    const broken = run(edited((draft) => {
      draft.qualities[0] = { key: "trust", type: "bool", source: "extractor", rubric: "Does she trust him?" };
      draft.transitions[0].gate = { q: "trust", op: "==", v: true };
      draft.transitions[1].gate = { q: "pact", op: "==", v: true };
    }));
    expect(broken.classification).toBe("invalidating");
    expect(codes(broken)).toContain("quality-retyped-live");

    const widened = run(edited((draft) => { draft.qualities[0] = { key: "trust", type: "float", source: "extractor", rubric: "How much does she trust him?" }; }));
    expect(widened.classification).toBe("compatible");
    expect(codes(widened)).toContain("quality-retyped");
  });

  it("invalidates narrowing an enum away from the live value", () => {
    const result = run(edited((draft) => { draft.qualities[2] = { key: "mood", type: "enum", values: ["calm"], source: "extractor", rubric: "What is the mood?" }; }));
    expect(result.classification).toBe("invalidating");
    expect(codes(result)).toContain("quality-enum-narrowed-live");
    expect(result.droppedQualityKeys).toContain("mood");
  });

  it("keeps latch and source flips compatible, releasing the lock it no longer enforces", () => {
    const unlatched = run(edited((draft) => { delete draft.qualities[1].latching; }));
    expect(unlatched.classification).toBe("compatible");
    expect(codes(unlatched)).toContain("quality-latch-disabled-live");
    expect(unlatched.unlatchedQualityKeys).toEqual(["pact"]);

    const latching = run(edited((draft) => { draft.qualities[0].latching = true; }));
    expect(codes(latching)).toContain("quality-latch-enabled-live");

    const sourced = run(edited((draft) => { draft.qualities[0].source = "code"; }));
    expect(sourced.classification).toBe("compatible");
    expect(codes(sourced)).toContain("quality-source-changed-live");
  });

  it("invalidates removing the checkpoint the chat is standing on", () => {
    const result = run(edited((draft) => {
      draft.checkpoints = draft.checkpoints.filter((checkpoint) => checkpoint.id !== "middle");
      draft.transitions = [{ from: "start", to: "end", gate: { q: "trust", op: ">=", v: 2 }, priority: 0 }];
    }));
    expect(result.classification).toBe("invalidating");
    expect(codes(result)).toContain("active-checkpoint-removed");
    expect(result.reanchorTo).toBe("start");
  });

  it("keeps removing a visited or unreached checkpoint compatible", () => {
    const visited = run(edited((draft) => {
      draft.checkpoints = draft.checkpoints.filter((checkpoint) => checkpoint.id !== "start");
      draft.checkpoints[0].start = true;
      draft.transitions = draft.transitions.filter((transition) => transition.from !== "start");
    }));
    expect(visited.classification).toBe("compatible");
    expect(codes(visited)).toContain("checkpoint-removed-visited");
    expect(visited.droppedVisitedAnchors).toEqual(["start"]);

    const future = run(edited((draft) => {
      draft.checkpoints = draft.checkpoints.filter((checkpoint) => checkpoint.id !== "end");
      draft.checkpoints[1].type = "anchor";
      draft.transitions = draft.transitions.filter((transition) => transition.to !== "end");
    }));
    expect(future.classification).toBe("compatible");
    expect(codes(future)).toContain("checkpoint-removed");
  });

  it("invalidates a start move only while the chat is still at the opening", () => {
    const unplayed = run(edited((draft) => {
      delete draft.checkpoints[0].start;
      draft.checkpoints[1].start = true;
    }), null);
    expect(unplayed.classification).toBe("invalidating");
    expect(codes(unplayed)).toContain("start-changed-unplayed");
    expect(unplayed.reanchorTo).toBe("middle");

    const played = run(edited((draft) => {
      delete draft.checkpoints[0].start;
      draft.checkpoints[1].start = true;
    }));
    expect(played.classification).toBe("compatible");
    expect(codes(played)).toContain("start-changed");
  });

  it("separates a gate edit on the active frontier from one elsewhere", () => {
    const frontier = run(edited((draft) => { draft.transitions[1].gate = { q: "trust", op: ">=", v: 99 }; }));
    expect(frontier.classification).toBe("compatible");
    expect(codes(frontier)).toContain("gate-changed-frontier");

    const elsewhere = run(edited((draft) => { draft.transitions[0].gate = { q: "trust", op: ">=", v: 5 }; }));
    expect(elsewhere.classification).toBe("compatible");
    expect(codes(elsewhere)).toContain("gate-changed");
  });

  it("invalidates a frontier gate that now reads a locked-in value", () => {
    const result = run(edited((draft) => { draft.transitions[1].gate = { all: [{ q: "pact", op: "==", v: false }] }; }));
    expect(result.classification).toBe("invalidating");
    expect(codes(result)).toContain("gate-changed-latched");
    expect(result.droppedQualityKeys).toContain("pact");
  });

  it("keeps added and removed transitions compatible", () => {
    const result = run(edited((draft) => {
      draft.transitions = [draft.transitions[1], { from: "start", to: "end", gate: { q: "trust", op: ">=", v: 8 }, priority: 1 }];
    }));
    expect(result.classification).toBe("compatible");
    expect(codes(result)).toEqual(expect.arrayContaining(["transition-removed", "transition-added"]));
  });

  it("sees a role edit as structurally identical: nothing to prune, and the changed hash still re-pins the chat (v2.2 plan 01)", () => {
    const result = run(edited((draft) => { draft.roster = draft.roster.map((member) => (member.id === "her" ? { ...member, role: "the ferry keeper" } : member)); }));
    expect(result.classification).toBe("identical");
    expect(result.entries).toEqual([]);
  });

  it("keeps cast removal compatible and says when a checkpoint still names the member", () => {
    const directed = run(edited((draft) => {
      draft.checkpoints[1].talk_control = { speakers: [{ member: "Ilse" }] };
      draft.roster = draft.roster.filter((member) => member.id !== "her");
    }));
    expect(directed.classification).toBe("compatible");
    expect(codes(directed)).toContain("roster-member-removed");

    const quiet = run(edited((draft) => { draft.roster = draft.roster.filter((member) => member.id !== "her"); }));
    expect(quiet.entries.find((entry) => entry.code === "roster-member-removed")?.message).toContain("left the cast.");
  });
});

describe("pruneEngineState", () => {
  it("drops only what the new story cannot explain and keeps the rest of the run", () => {
    const state = playedState();
    const next = parseStoryV2OrThrow(edited((draft) => { draft.qualities = draft.qualities.filter((quality) => quality.key !== "mood"); }));
    const diff = diffStories(parseStoryV2OrThrow(baseStory()), next, state);
    const pruned = pruneEngineState(state, next, diff);
    expect(diff.classification).toBe("invalidating");
    expect(pruned.blackboard.values.mood).toBeUndefined();
    expect(pruned.blackboard.versions.mood).toBeUndefined();
    expect(pruned.blackboard.values.trust).toBe(3);
    expect(pruned.blackboard.values.pact).toBe(true);
    expect(pruned.blackboard.latched.pact).toBe(true);
    expect(pruned.activeCheckpointId).toBe("middle");
    expect(pruned.boundary).toBe(state.boundary);
  });

  it("re-anchors and restarts the checkpoint counters when the active checkpoint is gone", () => {
    const state = playedState();
    const next = parseStoryV2OrThrow(edited((draft) => {
      draft.checkpoints = draft.checkpoints.filter((checkpoint) => checkpoint.id !== "middle");
      draft.transitions = [{ from: "start", to: "end", gate: { q: "trust", op: ">=", v: 99 }, priority: 0 }];
    }));
    const diff = diffStories(parseStoryV2OrThrow(baseStory()), next, state);
    const pruned = pruneEngineState(state, next, diff);
    expect(pruned.activeCheckpointId).toBe("start");
    expect(pruned.checkpointStartedBoundary).toBe(state.boundary);
    expect(pruned.checkpointStartedMessageId).toBe(state.lastMessageId);
  });

  it("keeps the entered path minus dropped checkpoints, and leaves a pre-path state for the engine to infer", () => {
    const state = playedState();
    expect(state.visitedPath).toEqual(["start", "middle"]);
    const next = parseStoryV2OrThrow(edited((draft) => {
      draft.checkpoints = draft.checkpoints.filter((checkpoint) => checkpoint.id !== "middle");
      draft.transitions = [{ from: "start", to: "end", gate: { q: "trust", op: ">=", v: 99 }, priority: 0 }];
    }));
    expect(pruneEngineState(state, next, diffStories(parseStoryV2OrThrow(baseStory()), next, state)).visitedPath).toEqual(["start"]);
    const { visitedPath: _dropped, ...legacy } = state;
    expect(pruneEngineState(legacy, next, diffStories(parseStoryV2OrThrow(baseStory()), next, legacy)).visitedPath).toBeUndefined();
  });

  it("releases a lock the new story no longer declares", () => {
    const state = playedState();
    const next = parseStoryV2OrThrow(edited((draft) => { delete draft.qualities[1].latching; }));
    const diff = diffStories(parseStoryV2OrThrow(baseStory()), next, state);
    const pruned = pruneEngineState(state, next, diff);
    expect(pruned.blackboard.values.pact).toBe(true);
    expect(pruned.blackboard.latched.pact).toBeUndefined();
  });

  it("hydrates cleanly into an engine loaded with the new story", () => {
    const state = playedState();
    const next = parseStoryV2OrThrow(edited((draft) => { draft.transitions[0].gate = { q: "trust", op: ">=", v: 1 }; draft.description = "Rewritten."; }));
    const diff = diffStories(parseStoryV2OrThrow(baseStory()), next, state);
    expect(diff.classification).toBe("compatible");
    const engine = new StoryEngine();
    engine.loadStory(next);
    engine.hydrate(pruneEngineState(state, next, diff));
    expect(engine.activeCheckpoint.id).toBe("middle");
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "trust", v: 5, source: "extractor" }] });
    const result = engine.commitBoundary({ lastMessageId: 7, chatLength: 8 });
    expect(result.fired?.to).toBe("end");
  });
});
