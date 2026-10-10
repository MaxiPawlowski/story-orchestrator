import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow, readsByStep, resolveStep, stepWord, type Quality } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { STEP_READ_HEADER } from "./contract";
import { buildFixtureRun } from "./fixtureRun";
import { parseSharedReadResponse } from "./parse";
import { applyRatingGrounding } from "./ratingGuard";
import { STEP_READ_REMINDER, STEP_READ_RULE } from "./stepRead";

const raw = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8"));
const transcript = [
  { index: 0, speaker: "You", text: "I trust you with the map.", is_user: true },
  { index: 1, speaker: "Arin", text: "Arin takes the map and smiles." },
];

beforeAll(async () => {
  await loadGameLayer();
});

const story = () => parseStoryV2OrThrow(raw);
const relKey = () => Object.keys(story().qualityByKey).find((key) => key.startsWith("rel_")) ?? "";
const line = (key: string, value: string) => `DELTA q=${key} value=${value} evidence="Arin takes the map and smiles."`;

describe("v2.8 31 F6: a stepped relationship is read as a direction, never a level", () => {
  it("asks for up or down on every stepped axis, never for a number, and names the members", () => {
    const run = buildFixtureRun({ story: raw, transcript });
    const rel = run.prompt.split("\n").filter((entry) => entry.startsWith("- rel_"));
    expect(rel.length).toBeGreaterThan(0);
    for (const entry of rel) expect(entry).toContain("type=direction;");
    expect(run.prompt.split(STEP_READ_RULE)).toHaveLength(2);
    expect(run.prompt.split("\n")).toContain(STEP_READ_HEADER);
    expect(run.prompt.indexOf(STEP_READ_HEADER)).toBeLessThan(run.prompt.indexOf(rel[0]));
    const quality = story().qualityByKey[relKey()];
    const holder = story().roster.find((member) => relKey().startsWith(`rel_${member.id}_`));
    expect(quality.rubric).toContain(holder?.name ?? "missing");
  });

  it("ends with one reminder to go through the directions, only when a stepped axis is in scope", () => {
    const run = buildFixtureRun({ story: raw, transcript });
    expect(run.prompt.split(STEP_READ_REMINDER)).toHaveLength(2);
    expect(run.prompt.indexOf(STEP_READ_REMINDER)).toBeGreaterThan(run.prompt.lastIndexOf("Transcript:"));
    const plain = {
      format: 2, id: "plain", title: "Plain", description: "", roster: [],
      qualities: [{ key: "found", type: "int", source: "extractor", rubric: "How many clues?" }],
      checkpoints: [{ id: "a", name: "A", objective: "Look.", type: "anchor", start: true }, { id: "b", name: "B", objective: "Done.", type: "anchor" }],
      transitions: [{ from: "a", to: "b", priority: 0, gate: { q: "found", op: ">=", v: 1 } }],
    };
    expect(buildFixtureRun({ story: plain, transcript }).prompt).not.toContain(STEP_READ_REMINDER);
    expect(buildFixtureRun({ story: plain, transcript }).prompt).not.toContain(STEP_READ_RULE);
  });

  it("control: an int without a step rule and the cycling clock keep their own type", () => {
    const plain: Quality = { key: "count", type: "int", source: "extractor", rubric: "x" };
    const clock: Quality = { key: "time_of_day", type: "enum", values: ["day", "night"], source: "extractor", rubric: "t", step_rule: { step: 1, cycle: true } };
    expect(readsByStep(plain)).toBe(false);
    expect(readsByStep(clock)).toBe(false);
  });

  it("resolves up and down one step from the current value, from start when unread, inside the range", () => {
    const rule = { step: 1, min: -2, max: 2, start: 1 };
    expect(resolveStep(rule, "up", 0)).toBe(1);
    expect(resolveStep(rule, "down", 0)).toBe(-1);
    expect(resolveStep(rule, "up", undefined)).toBe(2);
    expect(resolveStep(rule, "up", 2)).toBe(2);
    expect(resolveStep(rule, "down", -2)).toBe(-2);
    expect(stepWord(" Down ")).toBe("down");
    expect(stepWord("sideways")).toBeNull();
  });

  it("parses a quoted or bare direction against the blackboard, and the clamp keeps it one step", () => {
    const key = relKey();
    const parsed = parseSharedReadResponse([line(key, "\"up\""), line(key, "down")].join("\n"), story(), { [key]: 2 });
    expect(parsed.deltas.map((entry) => entry.delta.v)).toEqual([3, 1]);
    const guarded = applyRatingGrounding(story().qualityByKey, { [key]: 2 }, parsed.deltas).accepted.map((entry) => entry.delta.v);
    expect(guarded).toEqual([3, 1]);
  });

  it("still takes a number (the judge and older replies) and clamps it to one step", () => {
    const key = relKey();
    const parsed = parseSharedReadResponse(line(key, "5"), story(), { [key]: 0 });
    expect(applyRatingGrounding(story().qualityByKey, { [key]: 0 }, parsed.deltas).accepted.map((entry) => entry.delta.v)).toEqual([1]);
  });

  it("refuses a direction on a quality that has no step rule (control)", () => {
    const parsed = parseSharedReadResponse("DELTA q=location value=up evidence=\"Arin takes the map and smiles.\"", story());
    expect(parsed.deltas).toEqual([]);
  });
});
