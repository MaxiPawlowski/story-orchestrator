import { StoryEngine, type EngineState } from "./engine";
import { parseStory, parseStoryOrThrow } from "./validate";
import { ROLLBACK_DETECTORS, rollbackMoved, uncoveredCodeKeys } from "./rollbackDetectors";
import { actCountKey, actLogKey, ACT_LOG_CAP, parseActLog } from "./socialActs";
import type { BlackboardDelta } from "./blackboard";
import type { NormalizedStory } from "./schema";
import { rng, type Rng } from "../../test/support/codexLab";

const raw = (gate: unknown = { act: "lied", by: "player", to: "mira", within: 3, count: 2 }) => ({
  id: "acts", title: "Acts", description: "v3.0 43 M4",
  roster: [{ id: "mira", name: "Mira", relationships: [{ toward: "player", axes: ["trust"] }, { toward: "tobin", axes: ["trust"] }] }, { id: "tobin", name: "Tobin" }],
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "bank", name: "Bank", objective: "Cross", type: "intermediate", start: true }, { id: "island", name: "Island", objective: "Rest", type: "anchor" }],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate }],
});

const STORY = parseStoryOrThrow(raw());
const WINDOW = actCountKey("lied", "player", "mira", 3);
const LOG = actLogKey("player", "mira");

type Turn = BlackboardDelta[];
const feel = (q: string, v: number, act?: string): BlackboardDelta => ({ q, v, source: "extractor", ...(act ? { act } : {}) });

const engineFor = (story: NormalizedStory) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  return engine;
};

const play = (engine: StoryEngine, turns: Turn[], from = 0) => turns.forEach((deltas, index) => {
  const message = (from + index + 1) * 2;
  if (deltas.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: message - 1, to: message }, deltas });
  engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
});

const view = (state: EngineState) => ({ values: state.blackboard.values, active: state.activeCheckpointId, boundary: state.boundary });

describe("v3.0 43 M4: social act tags on feeling lines", () => {
  test("the leaf compiles to a recounted window key, the pair log is a code key, and a bad leaf is refused", () => {
    expect(STORY.qualityByKey[WINDOW]).toMatchObject({ type: "int", source: "code" });
    expect(STORY.qualityByKey[LOG]).toMatchObject({ type: "string", source: "code" });
    expect(STORY.qualityByKey[actLogKey("tobin", "mira")]).toBeDefined();
    expect(STORY.outgoingByCheckpoint.bank[0].gate).toEqual({ q: WINDOW, op: ">=", v: 2 });
    const errors = (gate: unknown) => (parseStory(raw(gate)) as Array<{ message: string }>).map((error) => error.message);
    expect(errors({ act: "hugged", by: "player", to: "mira" })).toEqual(expect.arrayContaining([expect.stringContaining("act is one of")]));
    expect(errors({ act: "lied", by: "player", to: "mira", within: 0 })).toEqual(expect.arrayContaining([expect.stringContaining("within")]));
    expect(errors({ act: "lied", by: "mira", to: "player" })).toEqual(expect.arrayContaining([expect.stringContaining("needs a relationship")]));
  });

  test("F-M4b: acts land in the pair log and the window counts exactly at its edges; the gate fires on the second lie", () => {
    const engine = engineFor(STORY);
    const trust = "rel_mira_player_trust";
    play(engine, [[feel(trust, -1, "lied")], [], [], [feel(trust, -2, "lied")]]);
    let values = engine.serialize().blackboard.values;
    expect(parseActLog(values[LOG])).toEqual([{ boundary: 1, act: "lied" }, { boundary: 4, act: "lied" }]);
    expect(values[WINDOW]).toBe(1);
    expect(engine.serialize().activeCheckpointId).toBe("bank");
    play(engine, [[feel(trust, -3, "lied")]], 4);
    values = engine.serialize().blackboard.values;
    expect(values[WINDOW]).toBe(2);
    expect(engine.serialize().activeCheckpointId).toBe("island");
    play(engine, [[], [], []], 5);
    expect(engine.serialize().blackboard.values[WINDOW]).toBe(0);
  });

  test("an act on a delta that did not apply, or on a key outside any pair, is not logged; the log keeps the newest entries", () => {
    const engine = engineFor(STORY);
    play(engine, [[{ q: "crossed", v: true, source: "extractor", act: "lied" }], [feel("rel_mira_tobin_trust", 1, "helped")]]);
    const values = engine.serialize().blackboard.values;
    expect(values[LOG]).toBeUndefined();
    expect(parseActLog(values[actLogKey("tobin", "mira")])).toEqual([{ boundary: 2, act: "helped" }]);
    const busy = engineFor(STORY);
    play(busy, Array.from({ length: ACT_LOG_CAP + 6 }, (_, index) => [feel("rel_mira_tobin_trust", index % 2, index % 2 ? "helped" : "gifted")]));
    expect(parseActLog(busy.serialize().blackboard.values[actLogKey("tobin", "mira")])).toHaveLength(ACT_LOG_CAP);
  });

  test("F-M4d: the log has a rollback detector and the window keys are exempt; nothing compiled is left uncovered", () => {
    const authored = new Set(["crossed"]);
    expect(uncoveredCodeKeys(STORY, authored)).toEqual([]);
    expect(ROLLBACK_DETECTORS.find((detector) => detector.id === "social-acts")?.keys(STORY)).toEqual(expect.arrayContaining([LOG]));
    expect(rollbackMoved(STORY, {}, { [LOG]: "1:lied" })).toBe(true);
    expect(rollbackMoved(STORY, { [WINDOW]: 1 }, { [WINDOW]: 0 })).toBe(false);
  });

  const writes = (random: Rng): Turn => {
    const keys = ["rel_mira_player_trust", "rel_mira_tobin_trust"];
    const acts = ["lied", "helped", "insulted", "gifted"];
    return random.next() < 0.6 ? [feel(keys[Math.floor(random.next() * 2)], Math.floor(random.next() * 5) - 2, random.next() < 0.7 ? acts[Math.floor(random.next() * 4)] : undefined)] : [];
  };

  test.each(Array.from({ length: 160 }, (_, at) => at))("F-M4a rollback ≡ replay, seed %i (4 seeds x 40 cuts)", (index) => {
    const random = rng(1 + Math.floor(index / 40) * 7919 + (index % 40) * 104729);
    const turns = Array.from({ length: 8 + (index % 9) }, () => writes(random));
    const straight = engineFor(STORY);
    play(straight, turns);
    const replayed = engineFor(STORY);
    play(replayed, turns);
    const message = 2 * (1 + Math.floor(random.next() * turns.length));
    if (replayed.shouldRollbackFromMessage(message)) {
      const boundary = replayed.boundaryBeforeMessage(message);
      expect(boundary).not.toBeNull();
      expect(replayed.rollbackTo(boundary as number).ok).toBe(true);
      const restored = replayed.serialize().boundary;
      play(replayed, turns.slice(restored), restored);
    }
    expect(view(replayed.serialize())).toEqual(view(straight.serialize()));
  });

  test("code-only boundary: a boundary whose only change is a logged act asks for a rollback", () => {
    const engine = engineFor(parseStoryOrThrow(raw({ q: "crossed", op: "==", v: true })));
    play(engine, [[]]);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [feel("rel_mira_player_trust", 0, "confided")] });
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(engine.shouldRollbackFromMessage(4)).toBe(true);
  });
});
