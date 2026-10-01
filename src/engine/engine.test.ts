import * as linearStory from "../../test/fixtures/linear.story.json";
import * as branchingStory from "../../test/fixtures/branching.story.json";
import * as sunRuinsStory from "../../examples/sun-ruins/quest-for-the-sun-ruins.json";
import { ApplyQueue } from "./applyQueue";
import { Blackboard } from "./blackboard";
import { progressQualityForAnchor } from "./convergence";
import { StoryEngine } from "./engine";
import { evaluateGate, renderGateText } from "./gates";
import { runReplay } from "../../test/support/replay";
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

  it("accepts npc reply after_member and enabled fields", () => {
    const valid = {
      ...linearStory,
      checkpoints: [
        {
          ...(linearStory as any).checkpoints[0],
          effects: { npc_replies: [{ trigger: "afterSpeak", member: "guard", kind: "llm", after_member: "captain", enabled: false }] },
        },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    expect(parseStoryV2OrThrow(valid).checkpointById.start.effects?.npc_replies).toEqual([
      { trigger: "afterSpeak", member: "guard", kind: "llm", after_member: "captain", enabled: false },
    ]);
  });

  it("retains fresh-chat-only scripted openings on import and refuses other uses", () => {
    const withOpening = (reply: Record<string, unknown>) => ({ ...linearStory, checkpoints: [
      { ...(linearStory as any).checkpoints[0], effects: { npc_replies: [reply] } },
      ...(linearStory as any).checkpoints.slice(1),
    ] });
    const opening = { trigger: "onEnter", member: "Adolion Narrator", kind: "scripted", text: "Welcome.", new_chat_only: true };
    expect(parseStoryV2OrThrow(withOpening(opening)).checkpointById.start.effects?.npc_replies).toEqual([opening]);
    expect(JSON.stringify(parseStoryV2(withOpening({ ...opening, kind: "llm" })))).toContain("new_chat_only requires a scripted onEnter reply");
    expect(JSON.stringify(parseStoryV2(withOpening({ ...opening, trigger: "afterSpeak" })))).toContain("new_chat_only requires a scripted onEnter reply");
  });

  it("accepts valid talk_control and rejects bad shapes", () => {
    const valid = {
      ...linearStory,
      checkpoints: [
        {
          ...(linearStory as any).checkpoints[0],
          talk_control: {
            speakers: [{ member: "guard", weight: 2 }, "captain"],
            lead: "guard",
            no_repeat: false,
            allow_silence: true,
            director: { instruction: "Prefer whoever was addressed." },
          },
        },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    expect(parseStoryV2OrThrow(valid).checkpointById.start.talk_control).toEqual({
      speakers: [{ member: "guard", weight: 2 }, { member: "captain" }],
      lead: "guard",
      no_repeat: false,
      allow_silence: true,
      director: { instruction: "Prefer whoever was addressed." },
    });

    const boolDirector = {
      ...valid,
      checkpoints: [
        { ...(valid as any).checkpoints[0], talk_control: { director: true } },
        ...(valid as any).checkpoints.slice(1),
      ],
    };
    expect(parseStoryV2OrThrow(boolDirector).checkpointById.start.talk_control).toEqual({ director: true });

    const badWeight = {
      ...linearStory,
      checkpoints: [
        { ...(linearStory as any).checkpoints[0], talk_control: { speakers: [{ member: "guard", weight: 0 }] } },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    expect(JSON.stringify(parseStoryV2(badWeight))).toContain("speaker weight must be a positive number");

    const badLead = {
      ...linearStory,
      checkpoints: [
        { ...(linearStory as any).checkpoints[0], talk_control: { lead: "" } },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    expect(JSON.stringify(parseStoryV2(badLead))).toContain("lead must be a non-empty string");

    const notAnObject = {
      ...linearStory,
      checkpoints: [
        { ...(linearStory as any).checkpoints[0], talk_control: "guard" },
        ...(linearStory as any).checkpoints.slice(1),
      ],
    };
    expect(JSON.stringify(parseStoryV2(notAnObject))).toContain("talk_control must be an object");
  });

  it("accepts commit_evidence on an extractor quality and refuses a bad pattern", () => {
    const quality = (extra: Record<string, unknown>) => ({ key: "committed", type: "bool", source: "extractor", rubric: "Did they commit?", ...extra });
    const withQuality = (extra: Record<string, unknown>) => ({
      ...linearStory,
      qualities: [...(linearStory as any).qualities, quality(extra)],
    });
    expect(parseStoryV2OrThrow(withQuality({ commit_evidence: "\\b(accept|swear)\\b" })).qualityByKey.committed.commit_evidence).toBe("\\b(accept|swear)\\b");
    expect(JSON.stringify(parseStoryV2(withQuality({ commit_evidence: "([unterminated" })))).toContain("commit_evidence must be a valid regular expression");
    expect(JSON.stringify(parseStoryV2(withQuality({ commit_evidence: "" })))).toContain("commit_evidence must be a non-empty pattern");
    expect(JSON.stringify(parseStoryV2({ ...linearStory, qualities: [...(linearStory as any).qualities, { key: "committed", type: "bool", source: "code", rubric: "x", commit_evidence: "accept" }] }))).toContain("only extractor qualities read evidence");
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
  it("applies only at drain time and discards a value a newer covering read wrote again", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const blackboard = new Blackboard(story);
    const queue = new ApplyQueue();
    queue.enqueue(entry("has_key", true, 1, 1));
    expect(blackboard.get("has_key")).toBeUndefined();
    queue.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 2 }, deltas: [{ q: "has_key", v: false, source: "extractor" }, { q: "door_open", v: true, source: "extractor" }] });
    const result = queue.drainAtBoundary(blackboard);
    expect(result.discarded).toHaveLength(1);
    expect(blackboard.get("has_key")).toBe(false);
    expect(blackboard.get("door_open")).toBe(true);
  });

  it("T0-1: a newer covering read that is silent on a key does not supersede it", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const blackboard = new Blackboard(story);
    const queue = new ApplyQueue();
    queue.enqueue({ ...entry("has_key", true, 6, 13), deltas: [{ q: "has_key", v: true, source: "extractor" }, { q: "door_open", v: false, source: "extractor" }] });
    queue.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 13 }, deltas: [{ q: "door_open", v: true, source: "extractor" }] });
    const result = queue.drainAtBoundary(blackboard);
    expect(blackboard.get("has_key")).toBe(true);
    expect(blackboard.get("door_open")).toBe(true);
    expect(result.applied.map((applied) => applied.deltas.map((delta) => delta.q))).toEqual([["has_key"], ["door_open"]]);
    expect(result.discarded.map((dropped) => dropped.deltas.map((delta) => delta.q))).toEqual([["door_open"]]);
  });

  it("splits tension levels with the tension delta they belong to", () => {
    const queue = new ApplyQueue();
    const blackboard = new Blackboard(parseStoryV2OrThrow(linearStory));
    queue.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 1 }, tensionLevels: ["tense"],
      deltas: [{ q: "has_key", v: true, source: "extractor" }, { q: "tension_current", v: 0.5, source: "extractor" }] });
    queue.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 2 }, deltas: [{ q: "has_key", v: true, source: "extractor" }] });
    const result = queue.drainAtBoundary(blackboard);
    expect(result.applied[0]).toMatchObject({ tensionLevels: ["tense"], deltas: [{ q: "tension_current" }] });
    expect(result.discarded[0].tensionLevels).toBeUndefined();
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
    expect(engine.rollbackTo(1)).toEqual({ ok: true, result: "applied" });
    expect(engine.serialize().activeCheckpointId).toBe("door");
    expect(engine.rollbackTo(5)).toEqual({ ok: true, result: "noop" });
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

  it("has nothing to roll back from the greeting before the first committed turn", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    expect(engine.shouldRollbackFromMessage(0)).toBe(false);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(0) ?? 0)).toEqual({ ok: true, result: "noop" });
  });

  it("reports where the previous boundary ended, following rollback and hydrate", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    expect(engine.commitBoundary({ lastMessageId: 2, chatLength: 3 }).previousLastMessageId).toBe(-1);
    expect(engine.commitBoundary({ lastMessageId: 4, chatLength: 5 }).previousLastMessageId).toBe(2);
    expect(engine.commitBoundary({ lastMessageId: 4, chatLength: 5 }).previousLastMessageId).toBe(4);
    expect(engine.rollbackTo(1)).toEqual({ ok: true, result: "applied" });
    expect(engine.commitBoundary({ lastMessageId: 4, chatLength: 5 }).previousLastMessageId).toBe(2);

    const rehydrated = new StoryEngine({ now: () => 0 });
    rehydrated.loadStory(story);
    rehydrated.hydrate(engine.serialize());
    expect(rehydrated.commitBoundary({ lastMessageId: 6, chatLength: 7 }).previousLastMessageId).toBe(4);
    expect(rehydrated.activateCheckpoint("door", { lastMessageId: 8, chatLength: 9 }).previousLastMessageId).toBe(6);
  });

  it("V12: hydrating onto a checkpoint the graph no longer has resumes at the newest one that still exists, and says so", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    const saved = { ...engine.serialize(), activeCheckpointId: "gen_gone_2", visitedPath: [story.startCheckpointId, "gen_gone_1", "gen_gone_2"] };
    engine.hydrate(saved);
    expect(engine.serialize().activeCheckpointId).toBe(story.startCheckpointId);
    expect(engine.checkpointPath).not.toContain("gen_gone_1");
    expect(engine.hydrateRepair).toContain("gen_gone_2");
    engine.hydrate(engine.serialize());
    expect(engine.hydrateRepair).toBeNull();
  });

  it("flushes pending writes and truncates logs on rollback", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("has_key", true, 0, 0));
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    engine.enqueue(entry("door_open", true, 1, 1));
    expect(engine.rollbackTo(0)).toEqual({ ok: true, result: "applied" });
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
    withRollback.rollbackTo(withRollback.boundaryBeforeMessage(1) as number);

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

describe("StoryEngine checkpointPath", () => {
  const load = () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(parseStoryV2OrThrow(sunRuinsStory));
    return engine;
  };
  const enter = (engine: StoryEngine, ids: string[]) => ids.forEach((id, index) => engine.activateCheckpoint(id, { lastMessageId: index, chatLength: index + 1 }));

  it("records every checkpoint entered, intermediates included, while visitedAnchors keeps only anchors", () => {
    const engine = load();
    expect(engine.checkpointPath).toEqual(["cp1"]);
    enter(engine, ["cp2", "cp3", "cp-4a", "cp-4a1"]);
    expect(engine.checkpointPath).toEqual(["cp1", "cp2", "cp3", "cp-4a", "cp-4a1"]);
    expect(engine.serialize().visitedAnchors).toEqual(["cp1", "cp2", "cp3"]);
  });

  it("rolls the path back with the rest of the state and round-trips through hydrate", () => {
    const engine = load();
    enter(engine, ["cp2", "cp3", "cp-4a", "cp-4a1"]);
    const saved = engine.serialize();
    expect(engine.rollbackTo(2)).toEqual({ ok: true, result: "applied" });
    expect(engine.checkpointPath).toEqual(["cp1", "cp2", "cp3"]);
    const restored = load();
    restored.hydrate(saved);
    expect(restored.checkpointPath).toEqual(saved.visitedPath);
  });

});

describe("gate recovery (step back a fired transition, reset a latched value)", () => {
  it("steps back a fired transition, restores the path and progress, and names the gate keys", () => {
    const story = parseStoryV2OrThrow(branchingStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("route", "stealth"));
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    expect(engine.serialize().activeCheckpointId).toBe("stealth");
    expect(engine.serialize().blackboard.values.progress_toward_exit).toBe(1);

    const outcome = engine.stepBackFiredTransition();
    expect(outcome).toMatchObject({ ok: true, to: "start", keys: ["route"] });
    expect(engine.serialize().activeCheckpointId).toBe("start");
    expect(engine.serialize().visitedPath).toEqual(["start"]);
    expect(engine.serialize().blackboard.values.progress_toward_exit).toBeUndefined();
    expect(engine.getBoundary()).toBe(1);
  });

  it("does not re-fire a gate once its key is reset", () => {
    const story = parseStoryV2OrThrow(branchingStory);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue(entry("route", "stealth"));
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    const outcome = engine.stepBackFiredTransition();
    if (!outcome.ok) throw new Error(outcome.reason);
    outcome.keys.forEach((key) => engine.resetQuality(key));
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    expect(engine.serialize().activeCheckpointId).toBe("start");
  });

  it("reports when no gate moved the chat and walks back one checkpoint at a time", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(parseStoryV2OrThrow(linearStory));
    expect(engine.stepBackFiredTransition()).toEqual({ ok: false, reason: "no gate transition has moved this chat" });
    engine.enqueue(entry("has_key", true, 0, 0));
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    engine.enqueue(entry("door_open", true, 1, 1));
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    expect(engine.serialize().activeCheckpointId).toBe("end");
    expect(engine.stepBackFiredTransition()).toMatchObject({ ok: true, from: "end", to: "door" });
    expect(engine.stepBackFiredTransition()).toMatchObject({ ok: true, from: "door", to: "start" });
    expect(engine.stepBackFiredTransition()).toEqual({ ok: false, reason: "no gate transition has moved this chat" });
  });

  it("resetQuality clears a latched value so a later read can revise it", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(parseStoryV2OrThrow(sunRuinsStory));
    engine.enqueue(entry("mission_accepted", true, 0, 0));
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    expect(engine.serialize().blackboard.latched.mission_accepted).toBe(true);

    engine.enqueue(entry("mission_accepted", false, 1, 1));
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    expect(engine.serialize().blackboard.values.mission_accepted).toBe(true);

    expect(engine.resetQuality("mission_accepted")).toBe(true);
    expect(engine.serialize().blackboard.values.mission_accepted).toBeUndefined();
    expect(engine.serialize().blackboard.latched.mission_accepted).toBeUndefined();

    engine.enqueue(entry("mission_accepted", false, 2, 2));
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(engine.serialize().blackboard.values.mission_accepted).toBe(false);
  });
});
