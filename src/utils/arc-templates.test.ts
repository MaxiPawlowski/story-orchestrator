import {
  ARC_TEMPLATE_CURVES,
  ARC_TEMPLATE_OPTIONS,
  PacingPhase,
  computeExpectedTension,
  derivePacingPhase,
  interpolateTensionTarget,
} from "./arc-templates";

describe("arc-templates", () => {
  it("keeps every template in range across sampled progress values", () => {
    for (const [templateId, curve] of Object.entries(ARC_TEMPLATE_CURVES)) {
      for (let step = 0; step <= 100; step += 1) {
        const progress = step / 100;
        const tension = curve(progress);

        expect(tension).toBeGreaterThanOrEqual(0);
        expect(tension).toBeLessThanOrEqual(1);
        expect(computeExpectedTension(templateId, progress)).toBe(tension);
      }
    }
  });

  it("returns expected anchor values for each template", () => {
    expect(computeExpectedTension("freytag", 0.6)).toBeCloseTo(1, 6);
    expect(computeExpectedTension("vonnegut_man_in_hole", 0.3)).toBeCloseTo(0.12, 6);
    expect(computeExpectedTension("vonnegut_man_in_hole", 0.8)).toBeCloseTo(1, 6);
    expect(computeExpectedTension("vonnegut_icarus", 0.55)).toBeCloseTo(1, 6);
    expect(computeExpectedTension("three_act", 0.82)).toBeCloseTo(1, 6);
  });

  it("derives pacing phases for each template segment", () => {
    expect(derivePacingPhase(0.1, "freytag")).toBe(PacingPhase.Setup);
    expect(derivePacingPhase(0.4, "freytag")).toBe(PacingPhase.Rising);
    expect(derivePacingPhase(0.6, "freytag")).toBe(PacingPhase.Climax);
    expect(derivePacingPhase(0.8, "freytag")).toBe(PacingPhase.Falling);
    expect(derivePacingPhase(0.95, "freytag")).toBe(PacingPhase.Denouement);

    expect(derivePacingPhase(0.1, "vonnegut_man_in_hole")).toBe(PacingPhase.Setup);
    expect(derivePacingPhase(0.25, "vonnegut_man_in_hole")).toBe(PacingPhase.Falling);
    expect(derivePacingPhase(0.6, "vonnegut_man_in_hole")).toBe(PacingPhase.Rising);
    expect(derivePacingPhase(0.82, "vonnegut_man_in_hole")).toBe(PacingPhase.Climax);
    expect(derivePacingPhase(0.96, "vonnegut_man_in_hole")).toBe(PacingPhase.Denouement);

    expect(derivePacingPhase(0.1, "vonnegut_icarus")).toBe(PacingPhase.Setup);
    expect(derivePacingPhase(0.35, "vonnegut_icarus")).toBe(PacingPhase.Rising);
    expect(derivePacingPhase(0.6, "vonnegut_icarus")).toBe(PacingPhase.Climax);
    expect(derivePacingPhase(0.8, "vonnegut_icarus")).toBe(PacingPhase.Falling);
    expect(derivePacingPhase(0.96, "vonnegut_icarus")).toBe(PacingPhase.Denouement);

    expect(derivePacingPhase(0.2, "three_act")).toBe(PacingPhase.Setup);
    expect(derivePacingPhase(0.6, "three_act")).toBe(PacingPhase.Rising);
    expect(derivePacingPhase(0.82, "three_act")).toBe(PacingPhase.Climax);
    expect(derivePacingPhase(0.9, "three_act")).toBe(PacingPhase.Falling);
    expect(derivePacingPhase(0.98, "three_act")).toBe(PacingPhase.Denouement);
  });

  it("respects authored targets and falls back to the arc curve", () => {
    const checkpoints = [
      { progress_override: 0, tension_target: 0.1 },
      { progress_override: 0.3 },
      { progress_override: 0.6, tension_target: 0.9 },
      { progress_override: 0.9 },
    ];

    expect(interpolateTensionTarget(checkpoints, 0, "freytag")).toBeCloseTo(0.1, 6);
    expect(interpolateTensionTarget(checkpoints, 2, "freytag")).toBeCloseTo(0.9, 6);

    const expectedInterpolated = 0.1 + ((computeExpectedTension("freytag", 0.3) - computeExpectedTension("freytag", 0))
      / (computeExpectedTension("freytag", 0.6) - computeExpectedTension("freytag", 0))) * 0.8;
    expect(interpolateTensionTarget(checkpoints, 1, "freytag")).toBeCloseTo(expectedInterpolated, 6);
    expect(interpolateTensionTarget(checkpoints, 3, "freytag")).toBeCloseTo(computeExpectedTension("freytag", 0.9), 6);
  });

  it("exposes studio options for all four templates", () => {
    expect(ARC_TEMPLATE_OPTIONS).toEqual([
      expect.objectContaining({ id: "freytag" }),
      expect.objectContaining({ id: "vonnegut_man_in_hole" }),
      expect.objectContaining({ id: "vonnegut_icarus" }),
      expect.objectContaining({ id: "three_act" }),
    ]);
    expect(ARC_TEMPLATE_OPTIONS).toHaveLength(4);
  });
});
