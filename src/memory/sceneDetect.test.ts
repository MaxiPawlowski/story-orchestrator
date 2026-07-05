import { detectSceneBreakHeuristic } from "./sceneDetect";

describe("detectSceneBreakHeuristic", () => {
  it("reports no hit on ordinary continuing prose", () => {
    const result = detectSceneBreakHeuristic("She draws her sword and lunges at the guard.", false, false);
    expect(result).toEqual({ hit: false, signals: [] });
  });

  it("detects a time-skip phrase", () => {
    const result = detectSceneBreakHeuristic("Hours later, they finally reached the summit.", false, false);
    expect(result.hit).toBe(true);
    expect(result.reason).toBe("time_skip");
  });

  it("detects an explicit divider marker", () => {
    const result = detectSceneBreakHeuristic("---", false, false);
    expect(result.hit).toBe(true);
    expect(result.reason).toBe("divider");
  });

  it("detects a location-phrase transition", () => {
    const result = detectSceneBreakHeuristic("They arrived at the old lighthouse as the storm broke.", false, false);
    expect(result.hit).toBe(true);
    expect(result.reason).toBe("location");
  });

  it("treats a location-quality change as a location break even without matching prose", () => {
    const result = detectSceneBreakHeuristic("Nothing special happens here.", true, false);
    expect(result.hit).toBe(true);
    expect(result.reason).toBe("location");
  });

  it("prioritizes cast change over other simultaneous signals", () => {
    const result = detectSceneBreakHeuristic("---", true, true);
    expect(result.hit).toBe(true);
    expect(result.reason).toBe("cast");
  });

  it("prioritizes divider over a location phrase when both are present", () => {
    const result = detectSceneBreakHeuristic("---\nThey arrived at the tavern.", false, false);
    expect(result.reason).toBe("divider");
  });
});
