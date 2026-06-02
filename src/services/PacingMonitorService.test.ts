import { PacingMonitorService } from "./PacingMonitorService";
import { computeExpectedTension, PacingPhase } from "@utils/arc-templates";
import type { NormalizedStory } from "@utils/story-validator";

const createStory = (
  arcTemplate: string,
  progressOverrides: number[] = [0.1, 0.4, 0.6, 0.8, 0.95],
): NormalizedStory => ({
  schemaVersion: "2.0",
  title: "Pacing Story",
  description: "desc",
  global_lorebook: "Lorebook",
  arc_template: arcTemplate,
  checkpoints: progressOverrides.map((progress, index) => ({
    id: `cp-${index + 1}`,
    name: `CP${index + 1}`,
    objective: `obj-${index + 1}`,
    progress_override: progress,
  })),
  transitions: [],
  startId: "cp-1",
});

describe("PacingMonitorService", () => {
  it("returns expected tension for each arc template at known progress points", () => {
    const cases = [
      { template: "freytag", progress: 0.6, expected: 1 },
      { template: "vonnegut_man_in_hole", progress: 0.3, expected: 0.12 },
      { template: "vonnegut_icarus", progress: 0.55, expected: 1 },
      { template: "three_act", progress: 0.82, expected: 1 },
    ];

    for (const entry of cases) {
      const service = new PacingMonitorService({
        story: createStory(entry.template, [entry.progress]),
      });

      expect(service.computeState(0.5, 0).expected_tension).toBeCloseTo(entry.expected, 5);
      expect(service.computeState(0.5, 0).expected_tension).toBeCloseTo(
        computeExpectedTension(entry.template, entry.progress),
        5,
      );
    }
  });

  it("updates EMA across successive calls with the configured alpha", () => {
    const service = new PacingMonitorService({
      story: createStory("freytag", [0.1]),
      emaAlpha: 0.5,
    });

    expect(service.computeState(0.2, 0).tension_ema).toBeCloseTo(0.2, 5);
    expect(service.computeState(1, 0).tension_ema).toBeCloseTo(0.6, 5);
    expect(service.computeState(0, 0).tension_ema).toBeCloseTo(0.3, 5);
  });

  it("computes drift as ema minus expected tension", () => {
    const service = new PacingMonitorService({
      story: createStory("freytag", [0.6]),
    });

    const state = service.computeState(0.7, 0);

    expect(state.expected_tension).toBeCloseTo(1, 5);
    expect(state.tension_ema).toBeCloseTo(0.7, 5);
    expect(state.drift).toBeCloseTo(-0.3, 5);
  });

  it("returns a non-empty hint for every phase and drift direction", () => {
    const cases: Array<{ phase: PacingPhase; progress: number; reading: number }> = [
      { phase: PacingPhase.Setup, progress: 0.1, reading: 0 },
      { phase: PacingPhase.Setup, progress: 0.1, reading: 1 },
      { phase: PacingPhase.Setup, progress: 0.1, reading: computeExpectedTension("freytag", 0.1) },
      { phase: PacingPhase.Rising, progress: 0.4, reading: 0 },
      { phase: PacingPhase.Rising, progress: 0.4, reading: 1 },
      { phase: PacingPhase.Rising, progress: 0.4, reading: computeExpectedTension("freytag", 0.4) },
      { phase: PacingPhase.Climax, progress: 0.6, reading: 0 },
      { phase: PacingPhase.Climax, progress: 0.6, reading: 1 },
      { phase: PacingPhase.Climax, progress: 0.6, reading: computeExpectedTension("freytag", 0.6) },
      { phase: PacingPhase.Falling, progress: 0.8, reading: 0 },
      { phase: PacingPhase.Falling, progress: 0.8, reading: 1 },
      { phase: PacingPhase.Falling, progress: 0.8, reading: computeExpectedTension("freytag", 0.8) },
      { phase: PacingPhase.Denouement, progress: 0.95, reading: 0 },
      { phase: PacingPhase.Denouement, progress: 0.95, reading: 1 },
      { phase: PacingPhase.Denouement, progress: 0.95, reading: computeExpectedTension("freytag", 0.95) },
    ];

    for (const entry of cases) {
      const service = new PacingMonitorService({
        story: createStory("freytag", [entry.progress]),
      });
      const state = service.computeState(entry.reading, 0);

      expect(state.phase).toBe(entry.phase);
      expect(typeof state.hint).toBe("string");
      expect(state.hint.length).toBeGreaterThan(0);
    }
  });

  it("sets shouldEscalate only when absolute drift exceeds the threshold", () => {
    const story = createStory("freytag", [0.6]);

    const escalating = new PacingMonitorService({ story, driftThreshold: 0.2 });
    const steady = new PacingMonitorService({ story, driftThreshold: 0.4 });

    expect(escalating.computeState(0.7, 0).shouldEscalate).toBe(true);
    expect(steady.computeState(0.7, 0).shouldEscalate).toBe(false);
  });

  it("hydrates and resets the internal EMA accumulator", () => {
    const service = new PacingMonitorService({
      story: createStory("freytag", [0.1]),
      emaAlpha: 0.5,
    });

    expect(service.hydrateEma(0.8)).toBeCloseTo(0.8, 5);
    expect(service.computeState(0.2, 0).tension_ema).toBeCloseTo(0.5, 5);

    service.reset();

    expect(service.computeState(0.2, 0).tension_ema).toBeCloseTo(0.2, 5);
    expect(service.hydrateEma(Number.NaN)).toBeUndefined();
  });
});
