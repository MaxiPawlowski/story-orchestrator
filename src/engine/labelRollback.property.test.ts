import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, type EngineState } from "./engine";
import { isLabelKey, relationshipKey, revealKey, type NormalizedStory, type PrimitiveValue } from "./schema";
import { parseStoryOrThrow } from "./validate";
import { rollbackMoved } from "./rollbackDetectors";
import { rng, type Rng } from "../../test/support/codexLab";

type Turn = Array<{ q: string; v: PrimitiveValue }>;

const STORY = parseStoryOrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/relationship-labels.story.json"), "utf8")));
const FLAGS = ["shared_meal", "saw_letter", "paid_debt", "overheard", "found_ring", "heard_rumor", "met_sera"];
const TRUST = relationshipKey("tom", "player", "trust");

const writes = (random: Rng): Turn => [
  ...FLAGS.flatMap((key) => (random.next() < 0.15 ? [{ q: key, v: random.next() < 0.8 }] : [])),
  ...(random.next() < 0.4 ? [{ q: TRUST, v: Math.floor(random.next() * 7) - 2 }] : []),
];

const engineFor = (story: NormalizedStory) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  return engine;
};

const play = (engine: StoryEngine, turns: Turn[], from: number, lag: boolean) => turns.forEach((deltas, index) => {
  const message = (from + index + 1) * 2;
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, ...(lag ? {} : { turnRange: { from: message - 1, to: message } }), deltas: deltas.map((delta) => ({ ...delta, source: "extractor" as const })) });
  engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
});

const view = (state: EngineState) => ({ values: state.blackboard.values, latched: state.blackboard.latched, active: state.activeCheckpointId, boundary: state.boundary });

const labelsMovedFrom = (engine: StoryEngine, message: number) => engine.stateLog.some((entry) => entry.context.lastMessageId >= message
  && Object.keys({ ...entry.before.blackboard.values, ...entry.after.blackboard.values }).some((key) => isLabelKey(key) && entry.before.blackboard.values[key] !== entry.after.blackboard.values[key]));

const rollbackAndReplay = (engine: StoryEngine, turns: Turn[], message: number, lag: boolean) => {
  if (!engine.shouldRollbackFromMessage(message)) return;
  const boundary = engine.boundaryBeforeMessage(message);
  if (boundary === null) throw new Error("history gone inside the horizon");
  expect(engine.rollbackTo(boundary).ok).toBe(true);
  const restored = engine.serialize().boundary;
  play(engine, turns.slice(restored), restored, lag);
};

describe("v2.8 plan 51 R4: reveal latches and held labels roll back exactly as a replay rebuilds them", () => {
  test.each(Array.from({ length: 60 }, (_, at) => at + 1))("seed %i: swipe/edit/delete at a random message, then replay, equals the straight run", (seed) => {
    const random = rng(seed * 104729);
    const lag = seed % 2 === 0;
    const turns = Array.from({ length: 6 + (seed % 12) }, () => writes(random));
    const straight = engineFor(STORY);
    play(straight, turns, 0, lag);
    const replayed = engineFor(STORY);
    play(replayed, turns, 0, lag);
    const message = 2 * (1 + Math.floor(random.next() * turns.length));
    if (labelsMovedFrom(replayed, message)) expect(replayed.shouldRollbackFromMessage(message)).toBe(true);
    rollbackAndReplay(replayed, turns, message, lag);
    expect(view(replayed.serialize())).toEqual(view(straight.serialize()));
  });

  test("reopen: a hydrated engine rolls back and replays like the live one", () => {
    const random = rng(77);
    const turns = Array.from({ length: 14 }, () => writes(random));
    const live = engineFor(STORY);
    play(live, turns, 0, true);
    const reopened = new StoryEngine({ now: () => 0 });
    reopened.loadStory(STORY);
    reopened.hydrate(live.serialize(), live.serializeHistory());
    expect(view(reopened.serialize())).toEqual(view(live.serialize()));
    rollbackAndReplay(live, turns, 6, true);
    rollbackAndReplay(reopened, turns, 6, true);
    expect(view(reopened.serialize())).toEqual(view(live.serialize()));
  });

  test("code-only boundary (SC1): a swiped boundary whose only change is a reveal latch rolls back", () => {
    const engine = engineFor(STORY);
    play(engine, [[]], 0, true);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "saw_letter", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    const entry = engine.stateLog.at(-1);
    expect(entry?.fired).toBeNull();
    expect(entry?.queue.applied.every((applied) => !applied.turnRange)).toBe(true);
    expect(rollbackMoved(STORY, entry?.before.blackboard.values ?? {}, entry?.after.blackboard.values ?? {})).toBe(true);
    expect(engine.shouldRollbackFromMessage(4)).toBe(true);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(4) ?? 0).ok).toBe(true);
    expect(engine.serialize().blackboard.values[revealKey("mara", "player", "loyal")]).toBeUndefined();
  });

  test("control: with the label detector's keys untouched a read-less boundary does not ask for a rollback", () => {
    const engine = engineFor(STORY);
    play(engine, [[]], 0, true);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "location", v: "inn", source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(engine.shouldRollbackFromMessage(4)).toBe(false);
  });
});
