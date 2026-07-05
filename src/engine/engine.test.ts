import * as linearStory from "../../test/fixtures/linear.story.json";
import * as branchingStory from "../../test/fixtures/branching.story.json";
import { ApplyQueue } from "./applyQueue";
import { Blackboard } from "./blackboard";
import { progressQualityForAnchor } from "./convergence";
import { StoryEngine } from "./engine";
import { evaluateGate, renderGateText } from "./gates";
import { runReplay } from "./replay";
import type { GateNode } from "./schema";
import { selectFiring } from "./transitions";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";

const entry = (q: string, v: string | number | boolean, from = 1, to = 1) => ({
  source: "extractor" as const,
  blackboardVersionSum: 0,
  turnRange: { from, to },
  deltas: [{ q, v, source: "extractor" as const }],
});

describe("v2 schema validation", () => {
  it("normalizes indices and auto progress qualities", () => {
    const story = parseStoryV2OrThrow(branchingStory);
    expect(story.startCheckpointId).toBe("start");
    expect(story.outgoingByCheckpoint.start.map((transition) => transition.to)).toEqual(["stealth", "alarm"]);
    expect(story.qualityByKey[progressQualityForAnchor("exit")]).toMatchObject({ source: "code", monotonic: true });
    expect(story.reachableByCheckpoint.start).toEqual(expect.arrayContaining(["stealth", "alarm", "exit"]));
  });

  it("rejects malformed gates before runtime", () => {
    const invalid = {
      ...linearStory,
      transitions: [{ from: "start", to: "door", priority: 1, gate: { q: "has_key", op: ">=", v: true } }],
    };
    const result = parseStoryV2(invalid);
    expect(Array.isArray(result)).toBe(true);
    expect(JSON.stringify(result)).toContain("ordered comparisons require numeric qualities");
  });

  it("rejects intermediates with no reachable anchor", () => {
    const invalid = {
      ...linearStory,
      checkpoints: [
        { id: "start", name: "Start", objective: "Start", type: "anchor", start: true },
        { id: "stub", name: "Stub", objective: "Stub", type: "intermediate" },
      ],
      transitions: [{ from: "start", to: "stub", priority: 1, gate: { q: "has_key", op: "==", v: true } }],
    };
    expect(JSON.stringify(parseStoryV2(invalid))).toContain("no reachable anchor");
  });

  it("accepts valid npc_replies and drops malformed entries", () => {
    const valid = {
      ...linearStory,
      checkpoints: [
        {
          ...(linearStory as any).checkpoints[0],
          effects: { npc_replies: [{ trigger: "onEnter", member: "guard", kind: "scripted", text: "Halt!", maxTriggers: 1, probability: 0.5 }] },
        },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    const result = parseStoryV2OrThrow(valid);
    expect(result.checkpointById.start.effects?.npc_replies).toEqual([
      { trigger: "onEnter", member: "guard", kind: "scripted", text: "Halt!", maxTriggers: 1, probability: 0.5 },
    ]);

    const invalidTrigger = {
      ...linearStory,
      checkpoints: [
        {
          ...(linearStory as any).checkpoints[0],
          effects: { npc_replies: [{ trigger: "onExit", member: "guard", kind: "scripted" }] },
        },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    expect(JSON.stringify(parseStoryV2(invalidTrigger))).toContain("npc reply trigger is invalid");

    const missingMember = {
      ...linearStory,
      checkpoints: [
        {
          ...(linearStory as any).checkpoints[0],
          effects: { npc_replies: [{ trigger: "onEnter", kind: "scripted" }] },
        },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    expect(JSON.stringify(parseStoryV2(missingMember))).toContain("npc reply member is required");

    const notAnArray = {
      ...linearStory,
      checkpoints: [
        { ...(linearStory as any).checkpoints[0], effects: { npc_replies: "guard" } },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    const errors = parseStoryV2(notAnArray);
    expect(Array.isArray(errors)).toBe(true);
    expect(JSON.stringify(errors)).toContain("npc_replies must be an array");
  });

  it("accepts valid arc_bridges and rejects bad shapes", () => {
    const valid = { ...linearStory, arc_bridges: [{ arcMatch: "vault-arc", anchor: "end", amount: 2 }] };
    expect(parseStoryV2OrThrow(valid).arc_bridges).toEqual([{ arcMatch: "vault-arc", anchor: "end", amount: 2 }]);

    const unknownAnchor = { ...linearStory, arc_bridges: [{ arcMatch: "vault-arc", anchor: "nowhere", amount: 2 }] };
    expect(JSON.stringify(parseStoryV2(unknownAnchor))).toContain("unknown anchor 'nowhere'");

    const missingFields = { ...linearStory, arc_bridges: [{ anchor: "end" }] };
    const errors = parseStoryV2(missingFields);
    expect(JSON.stringify(errors)).toContain("arcMatch is required");
    expect(JSON.stringify(errors)).toContain("amount is required");

    const notAnArray = { ...linearStory, arc_bridges: "end" };
    expect(parseStoryV2OrThrow(notAnArray).arc_bridges).toBeUndefined();
  });
});

describe("blackboard and gates", () => {
  it("evaluates leaf operators, nesting, and text rendering", () => {
    const story = parseStoryV2OrThrow(branchingStory);
    const blackboard = new Blackboard(story);
    blackboard.applyDelta({ q: "route", v: "stealth", source: "extractor" });
    blackboard.applyDelta({ q: "noise", v: 3, source: "extractor" });

    const gate: GateNode = { all: [{ q: "route", op: "in", v: ["stealth"] }, { not: { q: "noise", op: ">", v: 4 } }] };
    expect(evaluateGate(gate, blackboard)).toBe(true);
    expect(renderGateText(gate)).toBe("route in [\"stealth\"] AND NOT (noise > 4)");
  });

  it("enforces monotonic and latching qualities", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const blackboard = new Blackboard(story);
    expect(blackboard.applyDelta({ q: "message_count", v: 3, source: "code" }).ok).toBe(true);
    expect(blackboard.applyDelta({ q: "message_count", v: 2, source: "code" })).toMatchObject({ ok: false, reason: "monotonic decrease" });
    expect(blackboard.applyDelta({ q: "has_key", v: false, source: "extractor" }).ok).toBe(true);
    expect(blackboard.applyDelta({ q: "has_key", v: true, source: "extractor" }).ok).toBe(true);
    expect(blackboard.applyDelta({ q: "has_key", v: false, source: "extractor" })).toMatchObject({ ok: false, reason: "latched value change" });
    expect(blackboard.applyDelta({ q: "has_key", v: false, source: "extractor", strictUnlatch: true }).ok).toBe(true);
  });

  it("selects highest priority with declaration-order ties", () => {
    const story = parseStoryV2OrThrow(branchingStory);
    const blackboard = new Blackboard(story);
    blackboard.applyDelta({ q: "route", v: "stealth", source: "extractor" });
    blackboard.applyDelta({ q: "noise", v: 5, source: "extractor" });
    expect(selectFiring(story.outgoingByCheckpoint.start, blackboard)?.to).toBe("stealth");
  });
});

describe("apply queue", () => {
  it("applies only at drain time and discards covered stale entries", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const blackboard = new Blackboard(story);
    const queue = new ApplyQueue();
    queue.enqueue(entry("has_key", true, 1, 1));
    expect(blackboard.get("has_key")).toBeUndefined();
    queue.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 2 }, deltas: [{ q: "door_open", v: true, source: "extractor" }] });
    const result = queue.drainAtBoundary(blackboard);
    expect(result.discarded).toHaveLength(1);
    expect(blackboard.get("has_key")).toBeUndefined();
    expect(blackboard.get("door_open")).toBe(true);
  });
});

describe("story engine", () => {
  it("keeps writes invisible to gates until a boundary", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("has_key", true));
    expect(engine.serialize().activeCheckpointId).toBe("start");
    expect(engine.commitBoundary().activeCheckpointId).toBe("door");
  });

  it("refreshes message_count from chat length", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(engine.serialize().blackboard.values.message_count).toBe(5);
  });

  it("fires one transition per boundary and applies convergence effects", () => {
    const story = parseStoryV2OrThrow(branchingStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("route", "stealth"));
    expect(engine.commitBoundary().activeCheckpointId).toBe("stealth");
    expect(engine.serialize().blackboard.values.progress_toward_exit).toBe(1);
    engine.enqueue(entry("guard_asleep", true, 2, 2));
    expect(engine.commitBoundary().activeCheckpointId).toBe("exit");
    expect(engine.serialize().blackboard.values.progress_toward_exit).toBe(2);
  });

  it("rolls back to a prior boundary snapshot", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("has_key", true));
    engine.commitBoundary();
    engine.enqueue(entry("door_open", true, 2, 2));
    engine.commitBoundary();
    expect(engine.serialize().activeCheckpointId).toBe("end");
    expect(engine.rollbackTo(1)).toBe(true);
    expect(engine.serialize().activeCheckpointId).toBe("door");
    expect(engine.rollbackTo(5)).toBe(false);
  });

  it("maps mutations by message id and ignores untouched swipes", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("has_key", true, 0, 0));
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    expect(engine.serialize().activeCheckpointId).toBe("door");
    expect(engine.shouldRollbackFromMessage(1)).toBe(false);
    expect(engine.shouldRollbackFromMessage(0)).toBe(true);
    expect(engine.boundaryBeforeMessage(0)).toBe(0);
  });

  it("flushes pending writes and truncates logs on rollback", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("has_key", true, 0, 0));
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    engine.enqueue(entry("door_open", true, 1, 1));
    expect(engine.rollbackTo(0)).toBe(true);
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    expect(engine.serialize().blackboard.values.door_open).toBeUndefined();
    expect(engine.stateLog).toHaveLength(1);
  });

  it("rollback matches never-applied state", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const withRollback = new StoryEngine({ now: () => 0 });
    withRollback.loadStory(story);
    withRollback.enqueue(entry("has_key", true, 0, 0));
    withRollback.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    withRollback.enqueue(entry("door_open", true, 1, 1));
    withRollback.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    withRollback.rollbackTo(withRollback.boundaryBeforeMessage(1));

    const neverApplied = new StoryEngine({ now: () => 0 });
    neverApplied.loadStory(story);
    neverApplied.enqueue(entry("has_key", true, 0, 0));
    neverApplied.commitBoundary({ lastMessageId: 0, chatLength: 1 });

    expect(withRollback.serialize()).toEqual(neverApplied.serialize());
  });

  it("hydrate does not double-apply progress on rehydration", () => {
    const story = parseStoryV2OrThrow(branchingStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("route", "stealth"));
    engine.commitBoundary();
    engine.enqueue(entry("guard_asleep", true, 2, 2));
    engine.commitBoundary();
    const before = engine.serialize();
    expect(before.blackboard.values.progress_toward_exit).toBe(2);
    expect(before.activeCheckpointId).toBe("exit");

    const rehydrated = new StoryEngine({ now: () => 0 });
    rehydrated.loadStory(story);
    rehydrated.hydrate(before);
    const after = rehydrated.serialize();
    expect(after.blackboard.values.progress_toward_exit).toBe(2);
    expect(after.activeCheckpointId).toBe("exit");
  });
});

describe("replay harness", () => {
  it("drives a linear fixture to completion", () => {
    const result = runReplay(linearStory, [
      { type: "write", entry: entry("has_key", true) },
      { type: "boundary" },
      { type: "assert", activeCheckpointId: "door" },
      { type: "write", entry: entry("door_open", true, 2, 2) },
      { type: "boundary" },
      { type: "assert", activeCheckpointId: "end", visitedAnchors: ["start", "door", "end"] },
    ]);
    expect(result.assertions).toBe(2);
  });

  it("drives a branching fixture through priority path", () => {
    runReplay(branchingStory, [
      {
        type: "write",
        entry: {
          source: "extractor",
          blackboardVersionSum: 0,
          turnRange: { from: 1, to: 1 },
          deltas: [
            { q: "route", v: "stealth", source: "extractor" },
            { q: "noise", v: 5, source: "extractor" },
          ],
        },
      },
      { type: "boundary" },
      { type: "assert", activeCheckpointId: "stealth", blackboard: { progress_toward_exit: 1 } },
      { type: "write", entry: entry("guard_asleep", true, 2, 2) },
      { type: "boundary" },
      { type: "assert", activeCheckpointId: "exit", blackboard: { progress_toward_exit: 2 } },
    ]);
  });
});
