import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, parseStoryV2OrThrow } from "../validate";
import {
  CLOCK_DAY_KEY, CLOCK_TIME_KEY, TURN_OOC_KEY, agendaStepKey, isLifeKey, moodKey, relationshipKey, type ValidationError,
} from "../schema";

const FIXTURE = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")) as Record<string, unknown>;

type Raw = Record<string, unknown> & { roster: Array<Record<string, unknown>> };

const copy = (): Raw => JSON.parse(JSON.stringify(FIXTURE)) as Raw;

const errorsOf = (json: unknown): ValidationError[] => {
  const parsed = parseStoryV2(json);
  return Array.isArray(parsed) ? parsed : [];
};

const withArin = (patch: Record<string, unknown>): Raw => {
  const story = copy();
  story.roster[0] = { ...story.roster[0], ...patch };
  return story;
};

describe("v2.7 plan 37: character life compiles to ordinary qualities", () => {
  const story = parseStoryV2OrThrow(FIXTURE);

  it("compiles each relationship axis to a bounded extractor rating with a step rule", () => {
    const trust = story.qualityByKey[relationshipKey("arin", "player", "trust")];
    expect(trust).toMatchObject({ type: "int", source: "extractor", read_as: "rating", step_rule: { step: 1, min: -3, max: 3, start: 0 } });
    expect(story.qualityByKey[relationshipKey("arin", "narrator", "respect")]).toBeDefined();
  });

  it("compiles mood, agenda, clock and the OOC marker", () => {
    expect(story.qualityByKey[moodKey("arin")]).toMatchObject({ type: "enum", source: "extractor", values: ["calm", "tense", "angry", "afraid", "elated"] });
    expect(story.qualityByKey[agendaStepKey("arin", "debt")]).toMatchObject({ source: "code", type: "int", monotonic: true });
    expect(story.qualityByKey[CLOCK_TIME_KEY]).toMatchObject({ source: "extractor", values: ["morning", "afternoon", "evening", "night"], step_rule: { cycle: true } });
    expect(story.qualityByKey[CLOCK_DAY_KEY]).toMatchObject({ source: "code" });
    expect(story.qualityByKey[TURN_OOC_KEY]).toMatchObject({ source: "code", type: "bool" });
    expect(story.life?.members.map((member) => member.id)).toEqual(["arin"]);
  });

  it("lets a transition gate on a relationship", () => {
    expect(story.outgoingByCheckpoint.start[0].gate).toEqual({ all: [{ q: "rel_arin_player_trust", op: ">=", v: 2 }] });
  });

  it("leaves a story without character life exactly as before", () => {
    const plain = copy();
    plain.roster = [{ id: "arin", name: "Arin" }, { id: "narrator", name: "DM Narrator" }];
    delete plain.clock;
    plain.transitions = [];
    const parsed = parseStoryV2OrThrow(plain);
    expect(parsed.life).toBeUndefined();
    expect(parsed.qualities.map((quality) => quality.key).filter(isLifeKey)).toEqual([]);
    expect(parsed.qualities.some((quality) => quality.step_rule)).toBe(false);
  });
});

describe("v2.7 plan 37: what the validator refuses", () => {
  it("refuses a relationship toward the member itself or toward someone not in the roster", () => {
    expect(errorsOf(withArin({ relationships: [{ toward: "arin", axes: ["trust"] }] })).some((error) => error.message.includes("toward itself"))).toBe(true);
    expect(errorsOf(withArin({ relationships: [{ toward: "ghost", axes: ["trust"] }] })).some((error) => error.path.endsWith("toward"))).toBe(true);
  });

  it("refuses an agenda step that changes the cast", () => {
    const agenda = [{ id: "plan", goal: "Leave town", pace: "per_chapter", steps: [{ text: "packed", effect: { cast_changes: { disable: ["arin"] } } }] }];
    expect(errorsOf(withArin({ agenda })).some((error) => error.message.includes("never changes the cast"))).toBe(true);
  });

  it("refuses a repeat that is not the last step and a start outside the range", () => {
    const agenda = [{ id: "plan", goal: "Leave town", pace: "per_chapter", steps: [{ text: "a", repeat: true }, { text: "b" }] }];
    expect(errorsOf(withArin({ agenda })).some((error) => error.message.includes("only the last step repeats"))).toBe(true);
    expect(errorsOf(withArin({ relationships: [{ toward: "player", axes: ["trust"], range: [0, 3], start: 5 }] })).some((error) => error.path.endsWith("start"))).toBe(true);
  });

  it("refuses an authored quality that takes a compiled key, and a public relationship", () => {
    const story = copy();
    story.qualities = [...(story.qualities as unknown[]), { key: "mood_arin", type: "string", source: "extractor", rubric: "x" }];
    expect(errorsOf(story).some((error) => error.message.includes("kept for character life"))).toBe(true);
    const shown = copy();
    shown.qualities = [...(shown.qualities as unknown[]), { key: "rel_arin_x", type: "int", source: "code", rubric: "x", display: { public: true, label: "Trust", as: "count" } }];
    expect(errorsOf(shown).some((error) => error.message.includes("never public"))).toBe(true);
  });

  it("refuses an agenda or schedule gate on an undeclared quality", () => {
    expect(errorsOf(withArin({ schedule: [{ when: { q: "nowhere", op: "==", v: true }, at: "docks" }] })).some((error) => error.path.includes("schedule.0.when"))).toBe(true);
  });

  it("refuses a clock with fewer than two times", () => {
    const story = copy();
    story.clock = { times: ["noon"] };
    expect(errorsOf(story).some((error) => error.path === "clock.times")).toBe(true);
  });
});
