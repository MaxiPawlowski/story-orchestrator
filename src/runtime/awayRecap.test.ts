import { AWAY_RECAP_MIN_MS, AwayRecapController, buildAwayRecap, shouldShowAwayRecap } from "./awayRecap";
import { buildNarrativeStatus } from "./narrative";
import { derivePipelineStatus } from "./pipeline";
import type { ExtractionRuntimeState } from "./types";
import { fakeDocument } from "../../test/support/fakeDocument";

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
    settings: { enabled: true, profileId: "p1", cadence: 3, stabilityLag: 0 },
    audits: [],
    reconciliationEvents: [],
    lastReadBoundary: 0,
    scheduler: { queueDepth: 0, inFlight: false, lastError: null },
  } as Partial<ExtractionRuntimeState> as ExtractionRuntimeState),
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
    expect(recap.render(fakeDocument().doc).textContent).toContain("The story so far");
  });

  it("renders dynamic content as text nodes, never as markup", () => {
    const dom = fakeDocument();
    const recap = buildAwayRecap(narrative({ storyTitle: "<img src=x onerror=alert(1)>" }), AWAY_RECAP_MIN_MS);
    const rendered = recap.render(dom.doc);
    expect(rendered.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(dom.created).not.toContain("img");
    expect(dom.markupWrites).toEqual([]);
  });
});

describe("AwayRecapController", () => {
  const away = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
  const recent = new Date().toISOString();

  const harness = () => {
    const opened: Array<{ render: (doc: Document) => HTMLElement; closed: number }> = [];
    const controller = new AwayRecapController((render) => {
      const handle = { render, closed: 0 };
      opened.push(handle);
      return { close: () => { handle.closed += 1; } };
    });
    return { controller, opened };
  };

  it("shows a detected recap once and then has nothing pending", () => {
    const { controller, opened } = harness();
    controller.detect(away, narrative(), "chat-a");
    expect(controller.show()).toBe(true);
    expect(opened).toHaveLength(1);
    expect(controller.get()).toBeNull();
    expect(controller.show()).toBe(false);
    expect(opened).toHaveLength(1);
  });

  it("shows nothing without a gap", () => {
    const { controller, opened } = harness();
    controller.detect(recent, narrative(), "chat-a");
    expect(controller.show()).toBe(false);
    expect(opened).toHaveLength(0);
  });

  it("leaves an open recap up while the same chat reloads", () => {
    const { controller, opened } = harness();
    controller.detect(away, narrative(), "chat-a");
    controller.show();
    controller.detect(recent, narrative(), "chat-a");
    controller.dismissUnless("chat-a");
    expect(opened[0].closed).toBe(0);
    expect(opened).toHaveLength(1);
  });

  it("closes an open recap and drops a queued one when another chat is open", () => {
    const { controller, opened } = harness();
    controller.detect(away, narrative(), "chat-a");
    controller.show();
    controller.detect(away, narrative(), "chat-a");
    controller.dismissUnless("chat-b");
    expect(opened[0].closed).toBe(1);
    expect(controller.get()).toBeNull();
    expect(controller.show()).toBe(false);
    expect(opened).toHaveLength(1);
  });

  it("never leaves two recaps on screen", () => {
    const { controller, opened } = harness();
    controller.detect(away, narrative(), "chat-a");
    controller.show();
    controller.detect(away, narrative(), "chat-a");
    controller.show();
    expect(opened).toHaveLength(2);
    expect(opened[0].closed).toBe(1);
    expect(opened[1].closed).toBe(0);
  });

  it("dismisses harmlessly when nothing is open", () => {
    const { controller, opened } = harness();
    controller.dismissUnless("chat-b");
    expect(opened).toHaveLength(0);
  });
});

describe("AwayRecapController with an unnamed chat", () => {
  it("keeps the recap when the host has not said which chat is open", () => {
    const opened: Array<{ closed: number }> = [];
    const controller = new AwayRecapController(() => { const handle = { closed: 0 }; opened.push(handle); return { close: () => { handle.closed += 1; } }; });
    controller.detect(new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), narrative(), "chat-a");
    controller.show();
    controller.dismissUnless("");
    expect(opened[0].closed).toBe(0);
    controller.dismissUnless("chat-b");
    expect(opened[0].closed).toBe(1);
  });
});
