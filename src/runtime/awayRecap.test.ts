import { AWAY_RECAP_MIN_MS, buildAwayRecap, shouldShowAwayRecap } from "./awayRecap";
import { buildNarrativeStatus } from "./narrative";
import { derivePipelineStatus } from "./pipeline";

const narrative = (overrides: Parameters<typeof buildNarrativeStatus>[0] extends infer T ? Partial<T> : never = {}) => buildNarrativeStatus({
  storyTitle: "Sun Ruins",
  checkpointName: "The Ruined Gate",
  objective: "Reach the sanctum.",
  lastTransition: null,
  openThreads: ["The missing sun-heart", "Ponticius's true loyalty"],
  canon: "The party crossed the dunes and reached the gate.",
  tensionLevel: "critical",
  pendingCount: 0,
  pipeline: derivePipelineStatus({
    settings: { enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 },
    audits: [],
    reconciliationEvents: [],
    lastReadBoundary: 0,
    scheduler: { queueDepth: 0, inFlight: false, lastError: null },
  }),
  ...overrides,
});

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
  it("shows the standing player composition under a welcome-back heading", () => {
    const recap = buildAwayRecap(narrative(), 26 * 60 * 60 * 1000);
    expect(recap.title).toContain("Sun Ruins");
    expect(recap.title).toContain("1d");
    expect(recap.lines[0]).toContain("The Ruined Gate");
    expect(recap.lines.some((line) => line.includes("The missing sun-heart"))).toBe(true);
    expect(recap.html).toContain("The story so far");
  });

  it("escapes html in dynamic content", () => {
    const recap = buildAwayRecap(narrative({ storyTitle: "<script>" }), AWAY_RECAP_MIN_MS);
    expect(recap.html).not.toContain("<script>");
    expect(recap.html).toContain("&lt;script&gt;");
  });
});
