import * as pacingStory from "../../test/fixtures/pacing.story.json";
import { runReplay, type ReplayStep } from "@engine/replay";
import { expectedTension } from "./shapes";
import { getSteeringHint, getTensionTrajectory } from "./steering";
import { levelToNumeric, numericToLevel, updateEma } from "./tension";

describe("tension transforms", () => {
  it("maps levels to numeric anchors", () => {
    expect(levelToNumeric("calm")).toBe(0);
    expect(levelToNumeric("tense")).toBe(0.5);
    expect(levelToNumeric("peak")).toBe(1);
  });

  it("rounds smoothed values back to the nearest level", () => {
    expect(numericToLevel(0)).toBe("calm");
    expect(numericToLevel(0.3)).toBe("stirring");
    expect(numericToLevel(0.51)).toBe("tense");
    expect(numericToLevel(0.95)).toBe("peak");
  });

  it("seeds the EMA with the first sample then smooths", () => {
    const first = updateEma(null, 1, 0.5);
    expect(first).toBe(1);
    expect(updateEma(first, 0, 0.5)).toBe(0.5);
    expect(updateEma(0.5, 0, 0.25)).toBeCloseTo(0.375, 5);
  });

  it("clamps alpha into range", () => {
    expect(updateEma(0.2, 1, 5)).toBe(1);
    expect(updateEma(0.2, 1, -1)).toBe(0.2);
  });
});

describe("expectedTension shapes", () => {
  it("rises linearly", () => {
    expect(expectedTension("rising", 0)).toBe(0);
    expect(expectedTension("rising", 0.5)).toBe(0.5);
    expect(expectedTension("rising", 1)).toBe(1);
  });

  it("falls then recovers", () => {
    expect(expectedTension("fall_recovery", 0)).toBe(0.75);
    expect(expectedTension("fall_recovery", 0.5)).toBe(0.3);
    expect(expectedTension("fall_recovery", 1)).toBe(1);
  });

  it("interpolates three act midpoints", () => {
    expect(expectedTension("three_act", 0)).toBe(0.25);
    expect(expectedTension("three_act", 0.33)).toBeCloseTo(0.5, 5);
    expect(expectedTension("three_act", 1)).toBe(1);
  });

  it("interpolates and clamps custom points", () => {
    const custom = { points: [{ at: 0.2, tension: 0.2 }, { at: 0.8, tension: 0.8 }] };
    expect(expectedTension(custom, 0)).toBe(0.2);
    expect(expectedTension(custom, 0.5)).toBeCloseTo(0.5, 5);
    expect(expectedTension(custom, 1)).toBe(0.8);
  });
});

describe("steering", () => {
  it("escalates when below expected, eases when above, holds inside band", () => {
    expect(getSteeringHint(0.2, 0.8)?.direction).toBe("escalate");
    expect(getSteeringHint(0.9, 0.3)?.direction).toBe("ease");
    expect(getSteeringHint(0.5, 0.5)?.direction).toBe("hold");
  });

  it("returns null without a resolvable shape or reading", () => {
    expect(getSteeringHint(null, 0.5)).toBeNull();
    expect(getSteeringHint(0.5, null)).toBeNull();
  });

  it("names the expected tension level in the hint text", () => {
    expect(getSteeringHint(0.3, 0.75)?.text).toContain("critical");
    expect(getSteeringHint(0.5, 0.5)?.text).toContain("tense");
    expect(getSteeringHint(0.9, 0.25)?.text).toContain("stirring");
  });

  it("switches to strong wording past 0.5 drift", () => {
    expect(getSteeringHint(0.1, 0.9)?.text).toContain("escalate sharply toward peak");
    expect(getSteeringHint(0.25, 0.75)?.text).toContain("raise the tension toward critical");
    expect(getSteeringHint(0.9, 0.2)?.text).toContain("wind down decisively");
    expect(getSteeringHint(0.7, 0.3)?.text).toContain("ease the tension toward");
  });

  it("interpolates a tension trajectory", () => {
    expect(getTensionTrajectory(0, 1, 3)).toEqual([0, 0.5, 1]);
    expect(getTensionTrajectory(0.5, 0.5, 1)).toEqual([0.5]);
    expect(getTensionTrajectory(0, 1, 0)).toEqual([]);
  });
});

describe("curve-fit replay", () => {
  it("fits scripted rising tension within tolerance", () => {
    const steps: ReplayStep[] = [
      { type: "tension", level: "tense", alpha: 0.3 },
      { type: "boundary" },
      { type: "write", entry: { source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "has_key", v: true, source: "extractor" }] } },
      { type: "tension", level: "critical", alpha: 0.3 },
      { type: "boundary" },
      { type: "assert", activeCheckpointId: "door", visitedAnchors: ["start", "door"] },
      { type: "write", entry: { source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "door_open", v: true, source: "extractor" }] } },
      { type: "tension", level: "peak", alpha: 0.3 },
      { type: "boundary" },
      { type: "assert", activeCheckpointId: "end", visitedAnchors: ["start", "door", "end"] },
      { type: "assertCurveFit", template: "rising", maxMae: 0.3 },
    ];
    expect(() => runReplay(pacingStory, steps)).not.toThrow();
  });

  it("fails a mismatched shape past tolerance", () => {
    const steps: ReplayStep[] = [
      { type: "tension", level: "calm", alpha: 0.3 },
      { type: "boundary" },
      { type: "write", entry: { source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "has_key", v: true, source: "extractor" }] } },
      { type: "tension", level: "calm", alpha: 0.3 },
      { type: "boundary" },
      { type: "write", entry: { source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "door_open", v: true, source: "extractor" }] } },
      { type: "tension", level: "calm", alpha: 0.3 },
      { type: "boundary" },
      { type: "assertCurveFit", template: "rising", maxMae: 0.1 },
    ];
    expect(() => runReplay(pacingStory, steps)).toThrow(/curve fit MAE/);
  });
});
