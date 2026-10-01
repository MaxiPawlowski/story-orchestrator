import * as recorded from "../../test/fixtures/t2-6-on-the-road.expansion.json";
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
const latched = recorded.latched as Record<string, boolean>;
const parsed = parseGeneratedBeats(JSON.stringify({ beats: recorded.beats }), story);
const candidate = () => {
  const found = findStubExpansionCandidate(story, "road-to-wendhope");
  if (!found) throw new Error("no candidate");
  return found;
};
const input = () => planExpansion(story, { values: basis, latched }, candidate(), "", []);

describe("T2-6: a generated beat gated on a live, unlatched value that already holds (journal.jsonl:901)", () => {
  it("parses the recorded chain, which the recorded code check passed", () => {
    expect(parsed.issues).toEqual([]);
    expect(recorded.codeCheck).toEqual({ ok: true, issues: [], progressTotal: 1 });
  });

  it("control: merged, The Empty Mile passes at the first boundary after entry with no new write", () => {
    const entry = { key: "k", status: "validated", contract: 2, sourceCheckpointId: "road-to-wendhope", stubId: "on-the-road",
      targetAnchorId: "at-the-walls", beats: parsed.beats } as unknown as ExpansionCacheEntry;
    const engine = new StoryEngine();
    engine.loadStory(mergeExpansions(recorded.story, { k: entry }));
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "location", v: "north_road" }, { q: "first_camp", v: true }] });
    expect(engine.commitBoundary({ lastMessageId: 20, chatLength: 21 }).activeCheckpointId).toBe("gen_on-the-road_1");
    expect(engine.commitBoundary({ lastMessageId: 22, chatLength: 23 }).activeCheckpointId).toBe("gen_on-the-road_2");
  });

  it("fails the code check: location is not latched, but it already reads north_road when the chain is planned", () => {
    expect(latched).not.toHaveProperty("location");
    expect(basis.location).toBe("north_road");
    expect(runCodeChecks(story, input(), parsed.beats).issues).toContain(
      "beat 1 outcome 'success' gate location == \"north_road\" already holds when the beat starts, so the beat would pass without being played");
  });

  it("tells the generator the live value too", () => {
    expect(renderGenerationPrompt(story, input())).toMatch(/Already true when the chain starts: \{[^}]*"location":"north_road"/);
  });

  it("control: a beat gated on what its own play changes passes", () => {
    const played = parsed.beats.map((beat, index) => ({ ...beat, outcomes: beat.outcomes.map((outcome) => ({ ...outcome,
      gate: index === 0 ? { q: "reached_walls", op: "==" as const, v: true } : outcome.gate })) }));
    expect(runCodeChecks(story, input(), played).issues.filter((issue) => issue.includes("already holds"))).toEqual([]);
  });
});
