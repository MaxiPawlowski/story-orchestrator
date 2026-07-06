import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow } from "@engine/index";
import { runCodeChecks } from "./critic";
import { computeStateDelta } from "./delta";
import { mergeExpansions } from "./merge";
import { parseGeneratedBeats } from "./parse";
import { findStubExpansionCandidate, planExpansion } from "./planner";
import { revalidateExpansion } from "./revalidate";
import type { ExpansionCacheEntry } from "./types";

jest.mock("@services/STAPI", () => ({
  sendConnectionProfileRequest: jest.fn(async () => "{}"),
}));

const root = join(__dirname, "..", "..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf-8"));
const readText = (path: string) => readFileSync(join(root, path), "utf-8");
const story = parseStoryV2OrThrow(readJson("test/fixtures/background-generation.story.json"));

const candidate = () => {
  const found = findStubExpansionCandidate(story, "start");
  if (!found) throw new Error("candidate not found");
  return found;
};

const parsedBeats = () => {
  const parsed = parseGeneratedBeats(readText("test/goldens/background-generator1.response.txt"), story);
  expect(parsed.issues).toEqual([]);
  return parsed.beats;
};

const cacheEntry = (): ExpansionCacheEntry => ({
  key: "start->bridge_stub->finish",
  status: "inserted",
  sourceCheckpointId: "start",
  stubId: "bridge_stub",
  targetAnchorId: "finish",
  basis: { key_found: false, approach: "unknown" },
  blackboardVersionSum: 0,
  beats: parsedBeats(),
  needsReview: false,
  verdicts: [],
  codeCheck: null,
  insertedCheckpointIds: ["gen_bridge_stub_1", "gen_bridge_stub_2"],
  lastError: null,
  attempts: 1,
  updatedAt: "2026-07-05T00:00:00.000Z",
});

describe("background generation", () => {
  it("computes target state deltas", () => {
    const delta = computeStateDelta({ values: { key_found: false, approach: "unknown" }, versions: {}, latched: {} }, story.checkpointById.finish.state_snapshot, story);
    expect(delta.map((entry) => [entry.q, entry.current, entry.target])).toEqual([
      ["key_found", false, true],
      ["approach", "unknown", "safe"],
    ]);
  });

  it("finds and plans the stub expansion", () => {
    const input = planExpansion(story, { values: { tension_current: 0.25, key_found: false, approach: "unknown" } }, candidate(), "canon", ["fact"]);
    expect(input.candidate.stubId).toBe("bridge_stub");
    expect(input.candidate.targetAnchorId).toBe("finish");
    expect(input.beats).toBeGreaterThanOrEqual(2);
    expect(input.tensionTrajectory.length).toBe(input.beats);
  });

  it("carries latched blackboard values into the plan (F1 bridge)", () => {
    const input = planExpansion(
      story,
      { values: { key_found: true, approach: "unknown" }, latched: { key_found: true, approach: false } },
      candidate(),
      "",
      [],
    );
    expect(input.latched).toEqual({ key_found: true });
  });

  it("parses generated beat JSON strictly", () => {
    const parsed = parseGeneratedBeats(readText("test/goldens/background-generator1.response.txt"), story);
    expect(parsed.issues).toEqual([]);
    expect(parsed.beats).toHaveLength(2);
    expect(parsed.beats[0].outcomes[0].progress?.amount).toBe(1);

    const fenced = parseGeneratedBeats(`\n\`\`\`json\n${readText("test/goldens/background-generator1.response.txt")}\n\`\`\``, story);
    expect(fenced.issues).toEqual([]);
    expect(fenced.beats).toHaveLength(2);

    const embedded = parseGeneratedBeats(`Here is the JSON:\n\`\`\`json\n${readText("test/goldens/background-generator1.response.txt")}\n\`\`\``, story);
    expect(embedded.issues).toEqual([]);

    const invalid = parseGeneratedBeats("{\"beats\":[{\"objective\":\"Bad\",\"guidance\":\"Bad\",\"tension_target\":\"tense\",\"outcomes\":[{\"label\":\"bad\",\"gate\":{\"q\":\"missing\",\"op\":\"==\",\"v\":true}}]}]}", story);
    expect(invalid.issues.some((issue) => issue.includes("unknown quality"))).toBe(true);
  });

  it("coerces stringified bool/number gate and delta values against the quality type (gemma live quirk)", () => {
    const parsed = parseGeneratedBeats(JSON.stringify({ beats: [{
      objective: "Search the ruins",
      guidance: "Cross the bridge",
      tension_target: "stirring",
      outcomes: [{ label: "Key found", gate: { q: "key_found", op: "==", v: "false" }, deltas: [{ q: "key_found", v: "true" }] }],
    }] }), story);
    expect(parsed.issues).toEqual([]);
    expect(parsed.beats[0].outcomes[0].gate).toEqual({ q: "key_found", op: "==", v: false });
    expect(parsed.beats[0].outcomes[0].deltas).toEqual([{ q: "key_found", v: true }]);

    const enumStays = parseGeneratedBeats(JSON.stringify({ beats: [{
      objective: "Approach",
      guidance: "Pick a path",
      tension_target: "tense",
      outcomes: [{ label: "Safe", gate: { q: "approach", op: "==", v: "unknown" } }],
    }] }), story);
    expect(enumStays.issues).toEqual([]);
    expect(enumStays.beats[0].outcomes[0].gate).toEqual({ q: "approach", op: "==", v: "unknown" });
  });

  it("runs hard arithmetic checks before critic judgement", () => {
    const input = planExpansion(story, { values: { key_found: false, approach: "unknown" } }, candidate(), "", []);
    const result = runCodeChecks(story, input, parsedBeats());
    expect(result.ok).toBe(true);
    expect(result.progressTotal).toBe(1);

    const broken = parsedBeats().map((beat) => ({ ...beat, outcomes: beat.outcomes.map((outcome) => ({ ...outcome, progress: undefined })) }));
    const failed = runCodeChecks(story, input, broken);
    expect(failed.ok).toBe(false);
  });

  it("revalidates cached chains against the current blackboard", () => {
    const pass = revalidateExpansion(story, cacheEntry(), { key_found: false, approach: "unknown" });
    expect(pass.status).toBe("pass");

    const entry = cacheEntry();
    entry.beats = [entry.beats[0]];
    const partial = revalidateExpansion(story, entry, { key_found: false, approach: "unknown" });
    expect(partial.status).toBe("partial");
  });

  it("does not treat values missing from the basis as drift when beats still bridge to target", () => {
    const entry = { ...cacheEntry(), basis: {} };
    const midFlight = revalidateExpansion(story, entry, { key_found: true, approach: "unknown", tension_current: 0.25 });
    expect(midFlight.status).toBe("pass");
    expect(midFlight.issues).toEqual([]);
  });

  it("still flags drift for basis-tracked values that moved off-plan", () => {
    const drifted = revalidateExpansion(story, cacheEntry(), { key_found: false, approach: "risky" });
    expect(drifted.status).toBe("fail");
    expect(drifted.issues).toEqual(["approach drifted from expansion basis"]);
  });

  it("merges generated intermediates into a runtime-only story", () => {
    const merged = mergeExpansions(readJson("test/fixtures/background-generation.story.json"), { [cacheEntry().key]: cacheEntry() });
    expect(merged.checkpointById.gen_bridge_stub_1.guidance).toContain("key matters");
    expect(merged.outgoingByCheckpoint.start[0].to).toBe("gen_bridge_stub_1");
    expect(merged.outgoingByCheckpoint.gen_bridge_stub_2[0].to).toBe("finish");
  });

  it("reports critic pass metrics over deterministic generation goldens", () => {
    const input = planExpansion(story, { values: { key_found: false, approach: "unknown" } }, candidate(), "", []);
    const results = [1, 2, 3, 4, 5].map((index) => {
      const parsed = parseGeneratedBeats(readText(`test/goldens/background-generator${index}.response.txt`), story);
      return !parsed.issues.length && runCodeChecks(story, input, parsed.beats).ok;
    });
    const passRate = results.filter(Boolean).length / results.length;
    expect(passRate).toBe(1);
  });
});
