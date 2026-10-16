import { createHash } from "crypto";
import { StoryEngine, checkRolledKey, parseStoryV2, parseStoryV2OrThrow, uncoveredCodeKeys, type NormalizedStoryV2, type PrimitiveValue, type ValidationError } from "@engine/index";
import { deriveScope } from "@extraction/scope";
import { createChanceSeams } from "./chance";
import { checkRecordsAt, createChecks, recordChecks, rollbackChecks, type ChecksRuntimeState } from "./storyCheckDraws";

const IDS = { chatId: "chat-a", storyId: "wall" };
const ROLLED = checkRolledKey("climb");
const tried = { q: "tried_climb", op: "==", v: true };

const raw = (check: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  format: 2, id: "wall", title: "Wall", description: "Synthetic.", roster: [],
  qualities: [
    { key: "tried_climb", type: "bool", source: "extractor", rubric: "Has the party started climbing the wall?" },
    { key: "rope", type: "bool", source: "extractor", rubric: "Do they carry a rope?" },
    { key: "back", type: "bool", source: "extractor", rubric: "Did they climb back down?" },
    { key: "climbed", type: "bool", source: "code", rubric: "Did the climb succeed?" },
    { key: "climb_degree", type: "enum", values: ["miss", "weak", "strong"], source: "code", rubric: "How well." },
  ],
  checkpoints: [
    {
      id: "base", name: "Base", type: "anchor", start: true, objective: "Climb.",
      checks: [{
        id: "climb", label: "Climb", quality: "climbed", roll: { sides: 20, target: 12 }, narrate: "public",
        modifiers: [{ q: "rope", v: true, add: 4, label: "Rope" }], outcome: { quality: "climb_degree", bands: "margin", partial_margin: 5 }, ...check,
      }],
    },
    { id: "top", name: "Top", type: "anchor", objective: "Rest." },
  ],
  transitions: [{ from: "base", to: "top", priority: 0, gate: { all: [{ q: "tried_climb", op: "==", v: true }, { q: "climbed", op: "==", v: true }] } }],
  ...extra,
});

type Turn = Record<string, PrimitiveValue>;

const playing = (story: NormalizedStoryV2, ids = IDS) => {
  const seams = createChanceSeams(() => ({ ...ids, boundary: 0, qualities: story.qualities, story }), () => undefined);
  const engine = new StoryEngine({ now: () => 0, derive: seams.derive });
  engine.loadStory(story);
  let message = 0;
  let checks: ChecksRuntimeState = createChecks();
  const commit = (deltas: Turn, at: number) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: at, chatLength: at + 1 });
    checks = recordChecks(checks, checkRecordsAt(story, ids, engine.stateLog.at(-1)!));
  };
  const turn = (deltas: Turn = {}) => {
    message += 2;
    commit(deltas, message);
    return message;
  };
  const swipe = (at: number) => {
    expect(engine.shouldRollbackFromMessage(at)).toBe(true);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(at) ?? 0)).toEqual({ ok: true, result: "applied" });
    checks = rollbackChecks(checks, at);
    message = at - 2;
  };
  const values = () => engine.serialize().blackboard.values;
  return { engine, turn, swipe, values, checks: () => checks };
};

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const errorsOf = (json: unknown): ValidationError[] => {
  const parsed = parseStoryV2(json);
  return Array.isArray(parsed) ? parsed : [];
};

describe("checkpoint check without when: unchanged", () => {
  test("golden: the parsed story and a five-turn run match the recording made before when existed", () => {
    const story = parseStoryV2OrThrow(raw({ roll: { sides: 20, target: 5 } }, {
      qualities: raw().qualities.filter((quality) => quality.key !== "back"),
    }));
    const play = playing(story);
    const turns: Turn[] = [{}, { rope: true }, {}, { rope: false }, {}];
    turns.forEach((deltas) => play.turn(deltas));
    const run = play.engine.stateLog.map((entry) => ({ boundary: entry.boundary, cp: entry.after.activeCheckpointId, values: entry.after.blackboard.values }));
    expect(story.qualities.some((quality) => quality.key === ROLLED)).toBe(false);
    expect(sha(story)).toBe("b056f4abd65088fc6dd44ca721cb98af338650089d7f375c32a103900bd16bff");
    expect(sha(run)).toBe("e697b4d6fee2098464daf358a08e5a0ce902f674c5bf55ba312938eeba9354fd");
    expect(play.checks().records).toEqual([
      { checkId: "climb", boundary: 1, messageId: 2, visit: 0, draws: [1], modifiers: [], total: 1, target: 5, outcome: "miss" },
      { checkId: "climb", boundary: 2, messageId: 4, visit: 0, draws: [1], modifiers: [{ label: "Rope", add: 4 }], total: 5, target: 5, outcome: "weak" },
    ]);
  });
});

describe("checkpoint check with when", () => {
  const failing = () => parseStoryV2OrThrow(raw({ roll: { sides: 20, target: 99 }, when: tried }));

  test("stays pending while the checkpoint is active and when does not hold", () => {
    const play = playing(failing());
    play.turn();
    play.turn({ rope: true });
    expect(play.checks().records).toEqual([]);
    expect(play.values().climbed).toBeUndefined();
    expect(play.values()[ROLLED]).toBeUndefined();
  });

  test("rolls at the first boundary where when holds, seeded by the visit like a check without when", () => {
    const play = playing(failing());
    play.turn();
    play.turn({ tried_climb: true });
    expect(play.values()[ROLLED]).toBe(2);
    expect(play.values().climbed).toBe(false);
    expect(play.checks().records).toHaveLength(1);
    expect(play.checks().records[0]).toMatchObject({ checkId: "climb", boundary: 2, messageId: 4, visit: 0 });
    const plain = playing(parseStoryV2OrThrow(raw({ roll: { sides: 20, target: 99 } })));
    plain.turn();
    expect(play.checks().records[0].draws).toEqual(plain.checks().records[0].draws);
  });

  test("rolls once per visit: later turns keep the outcome, a modifier picked up afterwards or when turning false changes nothing", () => {
    const close = parseStoryV2OrThrow(raw({ roll: { sides: 2, target: 6 }, when: tried }));
    const play = playing(close);
    play.turn({ tried_climb: true });
    const rolled = { ...play.values() };
    play.turn({ rope: true });
    play.turn({ tried_climb: false });
    play.turn({ tried_climb: true });
    expect(play.checks().records.map((record) => record.outcome)).toEqual(["miss"]);
    expect(play.values()).toMatchObject({ climbed: rolled.climbed, climb_degree: rolled.climb_degree, [ROLLED]: 1 });
    expect(play.engine.activeCheckpoint?.id).toBe("base");
  });

  test("a swipe of the rolling reply rolls back and the replay rolls the same dice, once", () => {
    const play = playing(failing());
    play.turn();
    const at = play.turn({ tried_climb: true });
    const kept = play.checks().records;
    const values = { ...play.values() };
    play.swipe(at);
    expect(play.values()[ROLLED]).toBeUndefined();
    expect(play.values().climbed).toBeUndefined();
    expect(play.checks().records).toEqual([]);
    play.turn({ tried_climb: true });
    expect(play.checks().records).toEqual(kept);
    expect(play.values()).toEqual(values);
  });

  test("a swiped reply that no longer attempts leaves the check pending", () => {
    const play = playing(failing());
    const at = play.turn({ tried_climb: true });
    play.swipe(at);
    play.turn({ rope: true });
    expect(play.values()[ROLLED]).toBeUndefined();
    expect(play.checks().records).toEqual([]);
  });

  test("rollback across the roll equals a replay of the kept turns", () => {
    const turns: Turn[] = [{}, { tried_climb: true }, { rope: true }, { tried_climb: false }, {}];
    const play = playing(failing());
    const messages = turns.map((deltas) => play.turn(deltas));
    play.swipe(messages[1]);
    [turns[1], turns[2]].forEach((deltas) => play.turn(deltas));
    const replay = playing(failing());
    turns.slice(0, 3).forEach((deltas) => replay.turn(deltas));
    expect(play.values()).toEqual(replay.values());
    expect(play.checks()).toEqual(replay.checks());
  });

  test("rollback is replay over seeded random turn sequences and swipe points", () => {
    let seed = 7;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const close = parseStoryV2OrThrow(raw({ roll: { sides: 4, target: 4 }, when: tried }));
    let swiped = 0;
    for (let run = 0; run < 40; run += 1) {
      const turns = Array.from({ length: 6 }, (): Turn => (next() < 0.5 ? {} : next() < 0.5 ? { tried_climb: next() < 0.7 } : { rope: next() < 0.5 }));
      const cut = 1 + Math.floor(next() * 5);
      const play = playing(close);
      const messages = turns.map((deltas) => play.turn(deltas));
      if (!play.engine.shouldRollbackFromMessage(messages[cut])) continue;
      play.swipe(messages[cut]);
      swiped += 1;
      turns.slice(cut).forEach((deltas) => play.turn(deltas));
      const replay = playing(close);
      turns.forEach((deltas) => replay.turn(deltas));
      expect(play.values()).toEqual(replay.values());
      expect(play.checks()).toEqual(replay.checks());
    }
    expect(swiped).toBeGreaterThan(5);
  });

  test("a revisit is a new visit: pending again until when holds, then a fresh roll", () => {
    const loop = parseStoryV2OrThrow(raw({ roll: { sides: 20, target: 1 }, when: tried }, {
      transitions: [
        { from: "base", to: "top", priority: 0, gate: { all: [tried, { q: "climbed", op: "==", v: true }] } },
        { from: "top", to: "base", priority: 0, gate: { q: "back", op: "==", v: true } },
      ],
    }));
    const play = playing(loop);
    play.turn({ tried_climb: true });
    expect(play.engine.activeCheckpoint?.id).toBe("top");
    play.turn({ back: true, tried_climb: false });
    expect(play.engine.activeCheckpoint?.id).toBe("base");
    play.turn({ back: false });
    expect(play.values()[ROLLED]).toBe(1);
    play.turn({ tried_climb: true });
    expect(play.values()[ROLLED]).toBe(4);
    expect(play.checks().records.map((record) => record.visit)).toEqual([0, 2]);
  });

  test("extraction reads the when keys while the checkpoint is active, and only then", () => {
    const json = raw({ when: { q: "asked_guard", op: "==", v: true } });
    json.qualities.push({ key: "asked_guard", type: "bool", source: "extractor", rubric: "Has the party asked the guard to let them climb?" });
    const story = parseStoryV2OrThrow(json);
    const play = playing(story);
    const blackboard = play.engine.serialize().blackboard;
    expect(deriveScope(story, "base", blackboard).map((entry) => entry.key)).toContain("asked_guard");
    expect(deriveScope(story, "top", blackboard).map((entry) => entry.key)).not.toContain("asked_guard");
    expect(deriveScope(parseStoryV2OrThrow(raw()), "base", blackboard).map((entry) => entry.key)).not.toContain("asked_guard");
  });

  test("the compiled attempt key is covered by a rollback detector", () => {
    const story = failing();
    expect(story.qualityByKey[ROLLED]).toMatchObject({ type: "int", source: "code" });
    expect(uncoveredCodeKeys(story, new Set(raw().qualities.map((quality) => quality.key)))).toEqual([]);
  });
});

describe("check when validation", () => {
  test("an unknown key is refused with the key it most likely meant", () => {
    expect(errorsOf(raw({ when: { q: "tried_clim", op: "==", v: true } }))).toContainEqual({
      path: "checkpoints.0.checks.0.when", message: "unknown quality 'tried_clim' (did you mean \"tried_climb\"?)",
    });
  });

  test("a literal of the wrong type is refused", () => {
    expect(errorsOf(raw({ when: { q: "tried_climb", op: "==", v: "yes" } }))).toContainEqual({ path: "checkpoints.0.checks.0.when.v", message: "value does not match bool" });
  });

  test("a when that reads what the check writes is refused", () => {
    expect(errorsOf(raw({ when: { q: "climbed", op: "==", v: false } }))).toContainEqual({
      path: "checkpoints.0.checks.0.when", message: "when reads 'climbed', which this check writes; gate it on the attempt",
    });
  });

  test("a malformed gate is refused", () => {
    expect(errorsOf(raw({ when: { q: "tried_climb", op: "~", v: true } }))).toContainEqual({ path: "checkpoints.0.checks.0.when.op", message: "gate operator is invalid" });
  });

  test("when on a transition check is refused", () => {
    const json = raw({}, {
      checkpoints: [{ id: "base", name: "Base", type: "anchor", start: true, objective: "Climb." }, { id: "top", name: "Top", type: "anchor", objective: "Rest." }],
      transitions: [{ from: "base", to: "top", priority: 0, gate: tried, check: { id: "climb", quality: "climbed", roll: { sides: 20, target: 12 }, when: tried } }],
    });
    expect(errorsOf(json)).toContainEqual({ path: "transitions.0.check.when", message: "a transition check is attempted when the rest of its gate holds; when is for checkpoint checks" });
  });

  test("an authored quality named like the attempt key is refused", () => {
    const json = raw({ when: tried });
    json.qualities.push({ key: ROLLED, type: "int", source: "code", rubric: "Mine." });
    expect(errorsOf(json)).toContainEqual({ path: `qualities.${ROLLED}`, message: "this key is kept for a check's attempt" });
  });
});
