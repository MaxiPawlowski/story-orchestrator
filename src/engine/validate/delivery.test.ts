import { readFileSync } from "fs";
import { join } from "path";
import { parseStory, parseStoryOrThrow } from "../validate";
import { diffStories } from "../storyDiff";
import type { ValidationError } from "../schema";
import { readDeliverySheet, readNarrationSheet, readRosterPolish } from "./delivery";
import { DELIVERY_CAPS } from "../deliverySchema";

const load = (name: string) => JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}`), "utf8")) as Raw;

type Raw = Record<string, unknown> & { roster: Array<Record<string, unknown>> };

const errorsOf = (json: unknown): ValidationError[] => {
  const parsed = parseStory(json);
  return Array.isArray(parsed) ? parsed : [];
};

const withPolish = (polish: unknown, name = "delivery.story.json", at = 0): Raw => {
  const story = load(name);
  story.roster[at] = { ...story.roster[at], polish };
  return story;
};

const ctx = (names: string[] = []) => ({ path: "p", errors: [] as ValidationError[], names });

describe("v2.9 plan 02 S1: roster[].polish schema and validation", () => {
  it("reads a sheet-only story with no game layer fields", () => {
    const story = parseStoryOrThrow(load("delivery.story.json"));
    expect(story.roster[0].polish).toEqual({
      notes: "Short sentences. Talks in river terms. Never says sorry out loud.", prefer: ["current", "mind the rope"], avoid: ["indeed", "perhaps"], tics: ["smirks"], rhythm: "clipped",
    });
    expect(story.life).toBeUndefined();
  });

  it("trims, dedupes and drops an empty block", () => {
    const story = parseStoryOrThrow(withPolish({ notes: "  ", prefer: [" ", ""], avoid: [] }));
    expect(story.roster[0].polish).toBeUndefined();
    const kept = parseStoryOrThrow(withPolish({ prefer: [" current ", "Current", "eddy"] }));
    expect(kept.roster[0].polish).toEqual({ prefer: ["current", "eddy"] });
  });

  it("errors past every cap", () => {
    const long = "x".repeat(DELIVERY_CAPS.notes + 1);
    const paths = errorsOf(withPolish({
      notes: long, prefer: Array.from({ length: 13 }, (_, index) => `word${index}`), avoid: ["y".repeat(41)], tics: Array.from({ length: 13 }, (_, index) => `tic${index}`),
    })).map((error) => error.path);
    expect(paths).toEqual(expect.arrayContaining(["roster.0.polish.notes", "roster.0.polish.prefer", "roster.0.polish.avoid.0", "roster.0.polish.tics"]));
  });

  it("refuses prefer and avoid naming the same word, case-folded", () => {
    expect(errorsOf(withPolish({ prefer: ["Current"], avoid: ["current"] }))).toEqual([expect.objectContaining({ path: "roster.0.polish.prefer.0" })]);
  });

  it("refuses a tic or avoid entry that is a name, alias or codex name", () => {
    expect(errorsOf(withPolish({ tics: ["Orrin"] })).map((error) => error.path)).toEqual(["roster.0.polish.tics.0"]);
    expect(errorsOf(withPolish({ avoid: ["the clerk"] })).map((error) => error.path)).toEqual(["roster.0.polish.avoid.0"]);
    expect(readDeliverySheet({ avoid: ["Saltmarsh"] }, { ...ctx(["Saltmarsh"]) })?.avoid).toEqual(["Saltmarsh"]);
    const check = ctx(["Saltmarsh"]);
    readDeliverySheet({ avoid: ["saltmarsh"] }, check);
    expect(check.errors.map((error) => error.path)).toEqual(["p.avoid.0"]);
  });

  it("refuses an unknown key, rhythm, dialogue or enabled value", () => {
    const paths = errorsOf(withPolish({ rhythm: "fast", dialogue: "rewrite", enabled: "yes", banned_tics: ["x"] })).map((error) => error.path).sort();
    expect(paths).toEqual(["roster.0.polish.banned_tics", "roster.0.polish.dialogue", "roster.0.polish.enabled", "roster.0.polish.rhythm"]);
  });

  it("keeps dialogue and enabled false", () => {
    const story = parseStoryOrThrow(withPolish({ notes: "Dry.", dialogue: "voice", enabled: false }));
    expect(story.roster[0].polish).toEqual({ notes: "Dry.", dialogue: "voice", enabled: false });
  });

  it("refuses by_mood without a mood, or with a mood the member does not have", () => {
    expect(errorsOf(withPolish({ notes: "Dry.", by_mood: { calm: "slow" } })).map((error) => error.path)).toEqual(["roster.0.polish.by_mood"]);
    const story = load("delivery-mood.story.json");
    expect(parseStoryOrThrow(story).roster[0].polish?.by_mood).toEqual({ calm: "Slow and dry, a joke under every warning.", angry: "Bitten-off words, no jokes at all." });
    const wrong = withPolish({ by_mood: { elated: "loud" } }, "delivery-mood.story.json");
    expect(errorsOf(wrong).map((error) => error.path)).toEqual(["roster.0.polish.by_mood.elated"]);
  });

  it("accepts by_mood keys from the default mood values", () => {
    const story = load("delivery-mood.story.json");
    story.roster[0] = { ...story.roster[0], mood: { baseline: "calm" }, polish: { by_mood: { afraid: "Whispers." } } };
    expect(parseStoryOrThrow(story).roster[0].polish).toEqual({ by_mood: { afraid: "Whispers." } });
  });

  it("refuses by_mood, dialogue and enabled on the narration sheet", () => {
    const check = ctx();
    expect(readNarrationSheet({ notes: "Present tense.", by_mood: {}, dialogue: "keep", enabled: true }, check)).toEqual({ notes: "Present tense." });
    expect(check.errors.map((error) => error.path).sort()).toEqual(["p.by_mood", "p.dialogue", "p.enabled"]);
  });

  it("shares the field rules between the member and narration readers", () => {
    const member = ctx();
    const narration = ctx();
    readRosterPolish({ prefer: ["a"], avoid: ["A"] }, {}, member);
    readNarrationSheet({ prefer: ["a"], avoid: ["A"] }, narration);
    expect(member.errors.map((error) => error.message)).toEqual(narration.errors.map((error) => error.message));
  });

  it("keeps a changed sheet a compatible story update", () => {
    const before = parseStoryOrThrow(load("delivery.story.json"));
    const after = parseStoryOrThrow(withPolish({ notes: "Now she rambles." }));
    const diff = diffStories(before, after, null);
    expect(diff.classification).toBe("compatible");
    expect(diff.entries.map((entry) => entry.code)).toContain("roster-member-changed");
  });
});
