import { buildNarrativeStatus, renderNarrativeHtml, type NarrativeInput } from "./narrative";
import { derivePipelineStatus } from "./pipeline";
import type { ExtractionRuntimeState } from "./types";

const pipeline = (overrides: Partial<ExtractionRuntimeState["settings"]> = {}) => derivePipelineStatus({
  settings: { enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0, ...overrides },
  audits: [],
  reconciliationEvents: [],
  lastReadBoundary: 0,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
});

const input = (overrides: Partial<NarrativeInput> = {}): NarrativeInput => ({
  storyTitle: "Quest for the Sun Ruins",
  checkpointName: "The Ruined Gate",
  objective: "Breach the sanctum.",
  lastTransition: { fromName: "Camp", toName: "The Ruined Gate" },
  openThreads: ["The missing sun-heart"],
  canon: "The party crossed the dunes.",
  tensionLevel: "tense",
  pendingCount: 2,
  pipeline: pipeline(),
  ...overrides,
});

describe("buildNarrativeStatus", () => {
  it("composes the whole player view in one order", () => {
    const status = buildNarrativeStatus(input());
    expect(status.sections.map((section) => section.id)).toEqual(["now", "recently", "threads", "story", "pending", "status"]);
    expect(status.title).toBe("Quest for the Sun Ruins");
    expect(status.text).toContain("The Ruined Gate");
    expect(status.text).toContain("The missing sun-heart");
  });

  it("names checkpoints, never ids, counters or gates", () => {
    const status = buildNarrativeStatus(input());
    expect(status.text).toMatch(/Camp/);
    expect(status.text).not.toMatch(/\bcp\d|boundary|gate expression|extractor/i);
  });

  it("drops sections it has nothing to say about", () => {
    const status = buildNarrativeStatus(input({ lastTransition: null, openThreads: [], canon: "   ", pendingCount: 0 }));
    expect(status.sections.map((section) => section.id)).toEqual(["now", "status"]);
  });

  it("counts pending deltas as things noted, not as qualities", () => {
    expect(buildNarrativeStatus(input({ pendingCount: 1 })).text).toContain("1 thing");
    expect(buildNarrativeStatus(input({ pendingCount: 3 })).text).toContain("3 things");
  });

  it("carries the pipeline line as the status section", () => {
    const status = buildNarrativeStatus(input({ pipeline: pipeline({ profileId: null }) }));
    expect(status.sections[status.sections.length - 1]).toMatchObject({ id: "status" });
    expect(status.text).toContain("memory model");
  });

  it("escapes html when rendered into a popup", () => {
    const status = buildNarrativeStatus(input({ storyTitle: "<script>", checkpointName: "<b>gate</b>" }));
    const html = renderNarrativeHtml(status);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;gate&lt;/b&gt;");
  });

  it("excerpts a long canon", () => {
    const status = buildNarrativeStatus(input({ canon: "x".repeat(900) }));
    const story = status.sections.find((section) => section.id === "story");
    expect(story?.lines[0].length).toBeLessThanOrEqual(601);
    expect(story?.lines[0].endsWith("…")).toBe(true);
  });

  it("says where the scene is, right after the checkpoint name, only when the tracker knows (v2.2 plan 03)", () => {
    const now = (status: ReturnType<typeof buildNarrativeStatus>) => status.sections.find((section) => section.id === "now")?.lines;
    expect(now(buildNarrativeStatus(input({ sceneLocation: "the desert road" })))?.slice(0, 2)).toEqual(["The Ruined Gate", "At the desert road."]);
    expect(now(buildNarrativeStatus(input({ sceneLocation: null })))?.some((line) => line.startsWith("At "))).toBe(false);
  });
});

