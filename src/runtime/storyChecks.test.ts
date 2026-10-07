import { StoryEngine, parseStoryV2, parseStoryV2OrThrow, resolveCheck, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { createChanceSeams } from "./chance";
import { CHECK_OUTCOME_HEADER, checkOutcomeBlock, checkRecordsAt, createChecks, recordChecks, rollbackChecks, sanitizeChecks, type ChecksRuntimeState } from "./storyCheckDraws";
import { checkRolls } from "./storyCheckDraws";

const IDS = { chatId: "chat-a", storyId: "climb" };

const raw = (check: Record<string, unknown> = {}) => ({
  format: 2, id: "climb", title: "Climb", description: "Synthetic.", roster: [],
  qualities: [
    { key: "at_wall", type: "bool", source: "extractor", rubric: "Is the party at the wall?" },
    { key: "rope", type: "bool", source: "extractor", rubric: "Do they carry a rope?" },
    { key: "climbed", type: "bool", source: "code", rubric: "Did the climb succeed?" },
    { key: "climb_degree", type: "enum", values: ["miss", "weak", "strong"], source: "code", rubric: "How well." },
    { key: "top", type: "bool", source: "extractor", rubric: "At the top?" },
  ],
  checkpoints: [{ id: "base", name: "Base", type: "anchor", start: true, objective: "Climb." }, { id: "top", name: "Top", type: "anchor", objective: "Rest." }],
  transitions: [{
    from: "base", to: "top", priority: 0,
    gate: { all: [{ q: "at_wall", op: "==", v: true }, { q: "climbed", op: "==", v: true }] },
    check: {
      id: "climb", label: "Climb", quality: "climbed", roll: { sides: 20, target: 12 }, narrate: "public",
      modifiers: [{ q: "rope", v: true, add: 4, label: "Rope" }],
      outcome: { quality: "climb_degree", bands: "margin", partial_margin: 5 },
      ...check,
    },
  }],
});

const playing = (story: NormalizedStoryV2, ids = IDS) => {
  const seams = createChanceSeams(() => ({ ...ids, boundary: 0, qualities: story.qualities, story }), () => undefined);
  const engine = new StoryEngine({ now: () => 0, derive: seams.derive });
  engine.loadStory(story);
  let message = 0;
  let checks: ChecksRuntimeState = createChecks();
  const turn = (deltas: Record<string, PrimitiveValue> = {}) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    message += 2;
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
    checks = recordChecks(checks, checkRecordsAt(story, ids, engine.stateLog.at(-1)!));
    return message;
  };
  return { engine, turn, checks: () => checks, setChecks: (next: ChecksRuntimeState) => { checks = next; } };
};

describe("story checks", () => {
  test("validation refuses a check that writes an extractor quality", () => {
    expect(Array.isArray(parseStoryV2(raw({ quality: "top" })))).toBe(true);
  });

  test("the roll is the dice plus the matching modifiers against the target, with margin bands", () => {
    const story = parseStoryV2OrThrow(raw());
    const check = story.transitions[0].check!;
    expect(resolveCheck(check, [0.5], { rope: true })).toMatchObject({ faces: [11], total: 15, success: true, degree: "weak" });
    expect(resolveCheck(check, [0.9], { rope: true })).toMatchObject({ total: 23, degree: "strong" });
    expect(resolveCheck(check, [0.1], {})).toMatchObject({ total: 3, success: false, degree: "miss" });
  });

  test("nothing is rolled until the rest of the gate holds", () => {
    const play = playing(parseStoryV2OrThrow(raw()));
    play.turn();
    play.turn({ rope: true });
    expect(play.checks().records).toEqual([]);
    play.turn({ at_wall: true });
    expect(play.checks().records).toHaveLength(1);
  });

  test("a failed check is one record however many turns the party stays at the wall", () => {
    const failing = parseStoryV2OrThrow(raw({ roll: { sides: 20, target: 99 } }));
    const play = playing(failing);
    play.turn({ at_wall: true });
    play.turn();
    play.turn();
    expect(play.checks().records.map((record) => record.outcome)).toEqual(["miss"]);
    expect(play.engine.activeCheckpoint?.id).toBe("base");
  });

  test("a group round of three replies at one boundary visit records one roll", () => {
    const failing = parseStoryV2OrThrow(raw({ roll: { sides: 20, target: 99 } }));
    const play = playing(failing);
    for (let reply = 0; reply < 3; reply += 1) play.turn({ at_wall: true });
    expect(play.checks().records).toHaveLength(1);
  });

  test("picking up the rope changes the total, so it is a second record", () => {
    const close = parseStoryV2OrThrow(raw({ roll: { sides: 2, target: 6 } }));
    const play = playing(close);
    play.turn({ at_wall: true });
    play.turn({ rope: true });
    expect(play.checks().records.map((record) => record.outcome)).toEqual(["miss", "weak"]);
  });

  test("a swipe and a reopen read the same roll", () => {
    const story = parseStoryV2OrThrow(raw());
    const first = playing(story);
    const message = first.turn({ at_wall: true });
    const kept = first.checks();
    first.setChecks(rollbackChecks(kept, message));
    expect(first.checks().records).toEqual([]);
    const again = playing(story);
    again.turn({ at_wall: true });
    expect(again.checks().records.map((record) => record.draws)).toEqual(kept.records.map((record) => record.draws));
    expect(sanitizeChecks(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
  });

  test("a different chat rolls its own dice", () => {
    const story = parseStoryV2OrThrow(raw({ roll: { sides: 1000, target: 1 } }));
    const one = playing(story), two = playing(story, { chatId: "chat-b", storyId: "climb" });
    one.turn({ at_wall: true });
    two.turn({ at_wall: true });
    expect(one.checks().records[0].draws).not.toEqual(two.checks().records[0].draws);
  });

  test("the outcome block names the outcome on the reply it steers, and is gone after", () => {
    const story = parseStoryV2OrThrow(raw());
    const play = playing(story);
    const message = play.turn({ at_wall: true });
    const block = checkOutcomeBlock(story, play.checks().records, message);
    expect(block?.startsWith(CHECK_OUTCOME_HEADER)).toBe(true);
    expect(block).toMatch(/^- Climb: (succeeds|fails)/m);
    expect(checkOutcomeBlock(story, play.checks().records, message + 2)).toBeNull();
  });

  test("a story with no checks has no block and no chips", () => {
    const story = parseStoryV2OrThrow({ ...raw(), transitions: [{ ...raw().transitions[0], check: undefined }] });
    expect(checkOutcomeBlock(story, [], 4)).toBeNull();
    expect(checkRolls(story, undefined)).toEqual([]);
  });
});
