import * as recorded from "../../test/fixtures/t1-6-road-in.expansion.json";
import * as longNight from "../../test/fixtures/t1-5-long-night.expansion.json";
import { StoryEngine, parseStoryV2OrThrow, type PrimitiveValue } from "@engine/index";
import { runCodeChecks } from "./critic";
import { mergeExpansions } from "./merge";
import { parseGeneratedBeats } from "./parse";
import { findStubExpansionCandidate, planExpansion } from "./planner";
import { renderGenerationPrompt } from "./prompts";
import type { ExpansionCacheEntry } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
}));

const story = parseStoryV2OrThrow(recorded.story);
const basis = recorded.basis as Record<string, PrimitiveValue>;
const latched = { esha_at_border: true };
const parsed = parseGeneratedBeats(JSON.stringify({ beats: recorded.beats }), story);
const candidate = () => {
  const found = findStubExpansionCandidate(story, "esha-the-guardians");
  if (!found) throw new Error("no candidate");
  return found;
};
const input = () => planExpansion(story, { values: basis, latched }, candidate(), "", []);

describe("T1-6: a generated beat gated on a value that already holds is passed unplayed (journal.jsonl:795, :798)", () => {
  it("parses the recorded chain, which the recorded code check passed", () => {
    expect(parsed.issues).toEqual([]);
    expect(recorded.codeCheck).toEqual({ ok: true, issues: [], progressTotal: 1 });
  });

  it("control: merged, the chain runs from the shrine stones to court in two boundaries with no new write", () => {
    const entry = { key: "k", status: "validated", contract: 2, sourceCheckpointId: "esha-the-guardians", stubId: "esha-the-road-in",
      targetAnchorId: "esha-the-court", beats: parsed.beats } as unknown as ExpansionCacheEntry;
    const engine = new StoryEngine();
    engine.loadStory(mergeExpansions(recorded.story, { k: entry }));
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "esha_at_border", v: true }, { q: "esha_led_in", v: true }] });
    expect(engine.commitBoundary({ lastMessageId: 35, chatLength: 36 }).activeCheckpointId).toBe("gen_esha-the-road-in_1");
    expect(engine.commitBoundary({ lastMessageId: 37, chatLength: 38 }).activeCheckpointId).toBe("gen_esha-the-road-in_2");
    expect(engine.commitBoundary({ lastMessageId: 38, chatLength: 39 }).activeCheckpointId).toBe("esha-the-court");
  });

  it("fails the code check on both beats: the latched border value and the entry gate's own value", () => {
    const check = runCodeChecks(story, input(), parsed.beats);
    expect(check.ok).toBe(false);
    expect(check.issues).toEqual([
      "beat 1 outcome 'success' gate esha_at_border == true already holds when the beat starts, so the beat would pass without being played",
      "beat 2 outcome 'success' gate esha_led_in == true already holds when the beat starts, so the beat would pass without being played",
    ]);
  });

  it("tells the generator which values already hold when the chain starts", () => {
    expect(renderGenerationPrompt(story, input())).toContain('Already true when the chain starts: {"esha_at_border":true,"esha_led_in":true}');
  });

  it("a beat gated on something its own play changes passes", () => {
    const played = parsed.beats.map((beat, index) => ({ ...beat, outcomes: beat.outcomes.map((outcome) => ({ ...outcome,
      gate: index === 0 ? { q: "esha_out_of_the_trees", op: "==" as const, v: true } : { q: "esha_city_reached", op: "==" as const, v: true } })) }));
    const check = runCodeChecks(story, input(), played);
    expect(check.issues.filter((issue) => issue.includes("already holds"))).toEqual([]);
  });
});

describe("T1-5: the generated Long Night chain passed its first beat on the fog value that entered it (journal.jsonl:782, :798)", () => {
  const nightStory = parseStoryV2OrThrow(longNight.story);
  const beats = parseGeneratedBeats(JSON.stringify({ beats: longNight.beats }), nightStory);
  const candidate = findStubExpansionCandidate(nightStory, "night-the-kelger-falls");

  it("is the same root: beat 1 is gated on the entry gate's own value", () => {
    expect(beats.issues).toEqual([]);
    expect(longNight.codeCheck).toMatchObject({ ok: true, issues: [] });
    if (!candidate) throw new Error("no candidate");
    const check = runCodeChecks(nightStory, planExpansion(nightStory, { values: longNight.basis as Record<string, PrimitiveValue> }, candidate, "", []), beats.beats);
    expect(check.issues).toContain("beat 1 outcome 'success' gate night_fog_broken == true already holds when the beat starts, so the beat would pass without being played");
  });
});
