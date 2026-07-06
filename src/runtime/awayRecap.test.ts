import { AWAY_RECAP_MIN_MS, buildAwayRecap, shouldShowAwayRecap } from "./awayRecap";

describe("shouldShowAwayRecap", () => {
  const now = Date.parse("2026-07-06T12:00:00.000Z");

  it("returns false without a prior session", () => {
    expect(shouldShowAwayRecap(null, now)).toBe(false);
  });

  it("returns false for a short gap", () => {
    expect(shouldShowAwayRecap(new Date(now - 60 * 60 * 1000).toISOString(), now)).toBe(false);
  });

  it("returns true once the gap exceeds the threshold", () => {
    expect(shouldShowAwayRecap(new Date(now - AWAY_RECAP_MIN_MS - 1000).toISOString(), now)).toBe(true);
  });

  it("ignores an unparseable timestamp", () => {
    expect(shouldShowAwayRecap("not-a-date", now)).toBe(false);
  });
});

describe("buildAwayRecap", () => {
  it("summarizes checkpoint, tension, arcs and canon", () => {
    const recap = buildAwayRecap({
      storyTitle: "Sun Ruins",
      activeCheckpointName: "The Ruined Gate",
      activeObjective: "Reach the sanctum.",
      openArcs: ["The missing sun-heart", "Ponticius's true loyalty"],
      canon: "The party crossed the dunes and reached the gate.",
      tensionLevel: "high",
      gapMs: 26 * 60 * 60 * 1000,
    });
    expect(recap.title).toContain("Sun Ruins");
    expect(recap.title).toContain("1d");
    expect(recap.lines[0]).toBe("Checkpoint: The Ruined Gate — Reach the sanctum.");
    expect(recap.lines.some((line) => line.includes("The missing sun-heart"))).toBe(true);
    expect(recap.html).toContain("Canon so far");
  });

  it("escapes html in dynamic content", () => {
    const recap = buildAwayRecap({
      storyTitle: "<script>",
      activeCheckpointName: null,
      activeObjective: null,
      openArcs: [],
      canon: "",
      tensionLevel: null,
      gapMs: AWAY_RECAP_MIN_MS,
    });
    expect(recap.html).not.toContain("<script>");
    expect(recap.html).toContain("&lt;script&gt;");
  });
});
