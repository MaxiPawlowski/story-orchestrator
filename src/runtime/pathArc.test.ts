import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryOrThrow, type EngineState } from "@engine/index";
import { computeExpectedTension } from "./snapshot";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";

const story = parseStoryOrThrow(JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/branching.story.json"), "utf8")));

const state = (path: string[]): EngineState => ({
  visitedPath: path, activeCheckpointId: path[path.length - 1], visitedAnchors: path.filter((id) => story.checkpointById[id]?.type === "anchor"),
}) as unknown as EngineState;

describe("v3.0 42a F5: pacing.pathArc", () => {
  it("is on by default and survives sanitising", () => {
    expect(defaultGlobalSettings().pacing.pathArc).toBe(true);
    expect(sanitizeGlobalSettings({ pacing: { pathArc: false } }).pacing.pathArc).toBe(false);
    expect(sanitizeGlobalSettings({}).pacing.pathArc).toBe(true);
  });

  it("before: the stealth route ends short of the shape's end; after: the final anchor lands on it", () => {
    const end = state(["start", "stealth", "exit"]);
    expect(computeExpectedTension(story, end, undefined, "rising")).toBeCloseTo(2 / 3);
    expect(computeExpectedTension(story, end, undefined, "rising", { mode: "path", playerTurns: 6, relax: false })).toBe(1);
    expect(computeExpectedTension(story, end, undefined, "rising", { mode: "path", playerTurns: 6, relax: true })).toBe(0.5);
    expect(computeExpectedTension(story, end, "peak", "rising", { mode: "path", playerTurns: 6, relax: true })).toBe(1);
    expect(computeExpectedTension(story, end, "critical", "rising", { mode: "path", playerTurns: 0, relax: true })).toBe(0.5);
  });
});
