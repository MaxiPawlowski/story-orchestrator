import * as fs from "node:fs";
import * as path from "node:path";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";
import { isValidationErrorList, type StoryV2 } from "./schema";
import { runReplay, type ReplayStep } from "./replay";
import { runDiagnostics } from "../studio/diagnostics";
import { deriveScope } from "../extraction/scope";

const exampleJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples/sun-ruins/quest-for-the-sun-ruins.json"), "utf8")) as StoryV2;

const advance = (q: string, v: unknown): ReplayStep[] => [
  { type: "write", entry: { source: "extractor", blackboardVersionSum: 0, deltas: [{ q, v: v as never, source: "extractor" }] } },
  { type: "boundary" },
];

describe("example story: Quest for the Sun Ruins", () => {
  it("parses with no validation errors", () => {
    const parsed = parseStoryV2(exampleJson);
    expect(isValidationErrorList(parsed)).toBe(false);
  });

  it("has zero diagnostics, warnings included", () => {
    expect(runDiagnostics(exampleJson)).toEqual([]);
  });

  it("plays the Luke-accepted / riddle-solved path to the finale, reaching every anchor", () => {
    const steps: ReplayStep[] = [
      { type: "assert", activeCheckpointId: "cp1", visitedAnchors: ["cp1"] },
      ...advance("approached_board", true),
      { type: "assert", activeCheckpointId: "cp2" },
      ...advance("mission_accepted", true),
      { type: "assert", activeCheckpointId: "cp3" },
      ...advance("luke_decision", "accepted"),
      { type: "assert", activeCheckpointId: "cp-4a" },
      ...advance("riddle_answer", "moon"),
      { type: "assert", activeCheckpointId: "cp-4a1" },
      ...advance("chamber_entered", true),
      { type: "assert", activeCheckpointId: "cp-5" },
      ...advance("artifact_secured", true),
      { type: "assert", activeCheckpointId: "cp-6", visitedAnchors: ["cp1", "cp2", "cp3", "cp-5", "cp-6"] },
    ];
    const result = runReplay(exampleJson, steps);
    expect(result.assertions).toBe(7);
  });

  it("plays the Luke-declined branch and still converges on the finale", () => {
    const steps: ReplayStep[] = [
      ...advance("approached_board", true),
      ...advance("mission_accepted", true),
      ...advance("luke_decision", "declined"),
      { type: "assert", activeCheckpointId: "cp-4b" },
      ...advance("riddle_answer", "moon"),
      { type: "assert", activeCheckpointId: "cp-5" },
      ...advance("artifact_secured", true),
      { type: "assert", activeCheckpointId: "cp-6", visitedAnchors: ["cp1", "cp2", "cp3", "cp-5", "cp-6"] },
    ];
    runReplay(exampleJson, steps);
  });

  it("plays the riddle-failed branch: Luke dies, the party still reaches the finale", () => {
    const steps: ReplayStep[] = [
      ...advance("approached_board", true),
      ...advance("mission_accepted", true),
      ...advance("luke_decision", "accepted"),
      { type: "assert", activeCheckpointId: "cp-4a" },
      ...advance("riddle_answer", "wrong"),
      { type: "assert", activeCheckpointId: "cp-4a2" },
      ...advance("chamber_entered", true),
      { type: "assert", activeCheckpointId: "cp-5" },
      ...advance("artifact_secured", true),
      { type: "assert", activeCheckpointId: "cp-6", visitedAnchors: ["cp1", "cp2", "cp3", "cp-5", "cp-6"] },
    ];
    runReplay(exampleJson, steps);
  });

  it("passes the sphinx through earned respect without solving the riddle", () => {
    const steps: ReplayStep[] = [
      ...advance("approached_board", true),
      ...advance("mission_accepted", true),
      ...advance("luke_decision", "accepted"),
      ...advance("guardian_respect", 4),
      { type: "assert", activeCheckpointId: "cp-4a1" },
    ];
    runReplay(exampleJson, steps);
  });

  it("keeps every extractor quality reachable in extraction scope somewhere on the graph", () => {
    const story = parseStoryV2OrThrow(exampleJson);
    const empty = { values: {}, versions: {}, latched: {} };
    const inScopeAnywhere = new Set<string>();
    story.checkpoints.forEach((checkpoint) => {
      deriveScope(story, checkpoint.id, empty).forEach((entry) => inScopeAnywhere.add(entry.key));
    });
    const extractorKeys = story.qualities.filter((quality) => quality.source === "extractor").map((quality) => quality.key);
    const dead = extractorKeys.filter((key) => !inScopeAnywhere.has(key));
    expect(dead).toEqual([]);
  });

  it("scopes riddle_answer to the sphinx segment only", () => {
    const story = parseStoryV2OrThrow(exampleJson);
    const empty = { values: {}, versions: {}, latched: {} };
    expect(deriveScope(story, "cp1", empty).map((entry) => entry.key)).not.toContain("riddle_answer");
    expect(deriveScope(story, "cp-4a", empty).map((entry) => entry.key)).toContain("riddle_answer");
    expect(deriveScope(story, "cp-6", empty).map((entry) => entry.key)).not.toContain("riddle_answer");
  });
});
