import { StoryEngine, type EngineState } from "./engine";
import { isCodexKey, type NormalizedStory, type PrimitiveValue } from "./schema";
import { parseStoryOrThrow } from "./validate";
import { labRaw, labStory, randomWrites, rng, type Rng } from "../../test/support/codexLab";

type Turn = Array<{ q: string; v: PrimitiveValue }>;

const equalIds = (): NormalizedStory => {
  const raw = labRaw();
  const codex = raw.codex as { people: unknown[]; places: unknown[] };
  return parseStoryOrThrow({ ...raw, codex: { ...codex, people: [...codex.people, { id: "mill", name: "The miller", facts: [{ id: "wheel", text: "Built the wheel.", known_when: { q: "saw_mill", op: "==", v: true } }] }] } });
};

const script = (random: Rng, story: NormalizedStory, length: number): Turn[] => Array.from({ length }, () => randomWrites(random, story));

const engineFor = (story: NormalizedStory) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  return engine;
};

const play = (engine: StoryEngine, turns: Turn[], from: number, lag: boolean) => {
  turns.forEach((deltas, index) => {
    const message = (from + index + 1) * 2;
    const window = lag ? {} : { turnRange: { from: message - 1, to: message } };
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, ...window, deltas: deltas.map((delta) => ({ ...delta, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  });
};

const story = (state: EngineState) => ({
  values: state.blackboard.values, active: state.activeCheckpointId, path: state.visitedPath, boundary: state.boundary,
});

const codexMovedAtOrAfter = (engine: StoryEngine, message: number): boolean => engine.stateLog.some((entry) => entry.context.lastMessageId >= message
  && Object.keys({ ...entry.before.blackboard.values, ...entry.after.blackboard.values }).some((key) => isCodexKey(key) && entry.before.blackboard.values[key] !== entry.after.blackboard.values[key]));

const rollbackAndReplay = (engine: StoryEngine, turns: Turn[], message: number, lag: boolean): "rolled" | "kept" => {
  if (!engine.shouldRollbackFromMessage(message)) return "kept";
  const boundary = engine.boundaryBeforeMessage(message);
  if (boundary === null) throw new Error("history gone inside the horizon");
  expect(engine.rollbackTo(boundary).ok).toBe(true);
  const restored = engine.serialize().boundary;
  play(engine, turns.slice(restored), restored, lag);
  return "rolled";
};

describe("C4/C11: codex latches roll back exactly as a replay rebuilds them", () => {
  const SEEDS = Array.from({ length: 60 }, (_, at) => at + 1);

  test.each(SEEDS)("seed %i: detection is complete and rollback then replay equals the straight run", (seed) => {
    const random = rng(seed * 7919);
    const loaded = seed % 3 === 0 ? equalIds() : labStory();
    const lag = seed % 2 === 0;
    const turns = script(random, loaded, 6 + (seed % 15));
    const straight = engineFor(loaded);
    play(straight, turns, 0, lag);
    const replayed = engineFor(loaded);
    play(replayed, turns, 0, lag);
    const message = 2 * (1 + Math.floor(random.next() * turns.length));
    if (codexMovedAtOrAfter(replayed, message)) expect(replayed.shouldRollbackFromMessage(message)).toBe(true);
    rollbackAndReplay(replayed, turns, message, lag);
    expect(story(replayed.serialize())).toEqual(story(straight.serialize()));
  });

  test("a same-boundary checkpoint discovery and equal People/Places ids replay identically", () => {
    const loaded = equalIds();
    const turns: Turn[] = [[{ q: "met_tom", v: true }], [{ q: "saw_mill", v: true }], [{ q: "location", v: "mill" }]];
    const straight = engineFor(loaded);
    play(straight, turns, 0, true);
    const values = straight.serialize().blackboard.values;
    expect(values.codex_p_ferryman_job).toBe(1);
    expect(values.codex_l_mill_wheel).toBe(2);
    expect(values.codex_p_mill_wheel).toBe(2);
    expect(values.codex_l_mill).toBe(3);
    const replayed = engineFor(loaded);
    play(replayed, turns, 0, true);
    expect(rollbackAndReplay(replayed, turns, 2, true)).toBe("rolled");
    expect(story(replayed.serialize())).toEqual(story(straight.serialize()));
  });

  test("reopen past 200 logged boundaries: a hydrated engine rolls back and replays like the live one", () => {
    const loaded = labStory();
    const random = rng(424242);
    const head: Turn[] = Array.from({ length: 220 }, () => []);
    const tail = script(random, loaded, 12);
    const turns = [...head, ...tail];
    const straight = engineFor(loaded);
    play(straight, turns, 0, true);
    const live = engineFor(loaded);
    play(live, turns, 0, true);
    const reopened = new StoryEngine({ now: () => 0 });
    reopened.loadStory(loaded);
    reopened.hydrate(live.serialize(), live.serializeHistory());
    expect(live.stateLog).toHaveLength(200);
    const message = (head.length + 2) * 2;
    rollbackAndReplay(live, turns, message, true);
    rollbackAndReplay(reopened, turns, message, true);
    expect(story(reopened.serialize())).toEqual(story(live.serialize()));
    expect(story(live.serialize())).toEqual(story(straight.serialize()));
  });
});
