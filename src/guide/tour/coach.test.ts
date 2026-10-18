/**
 * @jest-environment jsdom
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STORY_FEATURE_IDS } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import { workspaceNavigation } from "@runtime/workspaceNavigation";
import { DEFAULT_REPLY_EFFORT } from "@utils/reasoningEffort";
import { jargonIn } from "@features/jargon";
import { COACH_COPY, TOUR_COPY } from "@features/tourCopy";
import { GUIDE_COPY } from "@features/helpCopy";
import { FEATURES } from "@features/registry";
import { GUIDE_PAGES } from "../pages.generated";
import { GuideMarkdown } from "../GuideMarkdown";
import { parseMarkdown, plainText, type Inline } from "../markdown";
import { onGuideRequest } from "../request";
import { QUICK_START_CHECKS, quickStartState } from "../quickStart";
import { guideShowOf } from "../showTarget";
import { onTourRequest, requestTour, tourRequestOf, tourViewOf, TOUR_VIEWS } from "./request";
import { COACH_FLOWS, copyOf, stopIndex } from "./coachFlows";
import { findTarget, place, ringBox, topModal } from "./coachGeometry";
import { coachHost } from "./coachMount";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf-8").replace(/\r\n/g, "\n");
const stops = () => TOUR_VIEWS.flatMap((view) => COACH_FLOWS[view].stops.map((stop) => ({ view, stop })));

const actionsIn = (nodes: Inline[]): Array<{ name: string; value: string }> => nodes.flatMap((node) => {
  if (node.kind === "action") return [{ name: node.name, value: node.value }];
  return "children" in node ? actionsIn(node.children) : [];
});

const pageActions = (body: string) => parseMarkdown(body).flatMap((block) => {
  if (block.kind === "list") {
    const walk = (items: typeof block.items): Array<{ name: string; value: string }> => items.flatMap((item) => [...actionsIn(item.children), ...(item.sub ? walk(item.sub.items) : [])]);
    return walk(block.items);
  }
  if (block.kind === "table") return [...block.head, ...block.rows.flat()].flatMap(actionsIn);
  return "children" in block ? actionsIn(block.children) : [];
});

describe("tour request door", () => {
  it("parses the view word and a view:stop value", () => {
    expect(tourViewOf(undefined)).toBeNull();
    expect(tourViewOf("Setup")).toBe("setup");
    expect(tourViewOf("authors")).toBeUndefined();
    expect(tourRequestOf("setup:memory")).toEqual({ view: "setup", stop: "memory" });
    expect(tourRequestOf("player")).toEqual({ view: "player" });
    expect(tourRequestOf("nowhere:memory")).toBeNull();
  });

  it("says whether anything listened, and hands the view and stop to the listener", () => {
    expect(requestTour("setup")).toBe(false);
    const seen: unknown[] = [];
    const stop = onTourRequest((request) => seen.push(request));
    expect(requestTour("author", "studio")).toBe(true);
    expect(requestTour()).toBe(true);
    stop();
    expect(requestTour("player")).toBe(false);
    expect(seen).toEqual([{ view: "author", stop: "studio" }, { view: null }]);
  });
});

describe("coach flows", () => {
  it("each flow is short, with unique stops and copy for every stop", () => {
    for (const view of TOUR_VIEWS) {
      const ids = COACH_FLOWS[view].stops.map((stop) => stop.id);
      expect([view, ids.length >= 4 && ids.length <= 7]).toEqual([view, true]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const { view, stop } of stops()) {
      const copy = COACH_COPY[`${view}.${stop.id}`];
      expect([view, stop.id, Boolean(copy?.title && copy.text && copy.missing)]).toEqual([view, stop.id, true]);
      expect([view, stop.id, stop.anchors.length > 0]).toEqual([view, stop.id, true]);
      expect([view, stop.id, Boolean(copy.alt)]).toEqual([view, stop.id, stop.anchors.some((anchor) => anchor.alt)]);
    }
    expect(Object.keys(COACH_COPY).sort()).toEqual(stops().map(({ view, stop }) => `${view}.${stop.id}`).sort());
  });

  it("a stop says one or two sentences", () => {
    const sentences = (text: string) => text.split(/[.?](?:\s|$)/).filter((part) => part.trim()).length;
    const long = stops().flatMap(({ view, stop }) => {
      const copy = copyOf(view, stop.id);
      return [copy.text, copy.alt ?? ""].filter((text) => sentences(text) > 2).map((text) => `${view}.${stop.id}: ${text}`);
    });
    expect(long).toEqual([]);
  });

  it("starts at a named stop, and at the first for an unknown one", () => {
    expect(stopIndex("setup", "judge")).toBe(COACH_FLOWS.setup.stops.findIndex((stop) => stop.id === "judge"));
    expect(stopIndex("setup", "nowhere")).toBe(0);
    expect(stopIndex("player")).toBe(0);
  });
});

const LEAKS: Array<[string, RegExp]> = [
  ["repo path", /(?:^|[\s(])(?:docs|src|scripts|test)\/|\.md\b|\.tsx?\b/],
  ["plan id", /\bplan \d+\b|\bv2\.\d\b/i],
  ["camelCase key", /\b[a-z]+[A-Z][A-Za-z]*\b/],
  ["snake_case id", /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/],
  ["element id", /#?so-[a-z]/],
];

describe("tour copy is plain", () => {
  const texts = () => [...Object.values(TOUR_COPY), ...Object.values(COACH_COPY).flatMap((copy) => [copy.title, copy.text, copy.missing, copy.alt ?? ""])];

  it("has no jargon, ids, paths or keys", () => {
    const found = texts().flatMap((text) => [...jargonIn(text).map((entry) => `jargon "${entry.term}": ${text}`),
      ...LEAKS.filter(([, pattern]) => pattern.test(text)).map(([name]) => `${name}: ${text}`)]);
    expect(found).toEqual([]);
  });

  it("the checks catch a planted leak (control)", () => {
    expect(jargonIn("Open the checkpoint").length).toBe(1);
    expect(LEAKS.some(([, pattern]) => pattern.test("open #so-extraction-profile"))).toBe(true);
  });
});

describe("coach geometry", () => {
  const viewport = { width: 1400, height: 900 };
  const bubble = { width: 340, height: 190 };

  it("puts the card below, above, beside or over the target, and centres it with no target", () => {
    expect(place({ top: 100, left: 600, width: 100, height: 40 }, bubble, viewport)).toMatchObject({ mode: "float", side: "below", top: 158 });
    expect(place({ top: 800, left: 600, width: 100, height: 40 }, bubble, viewport)).toMatchObject({ mode: "float", side: "above" });
    expect(place({ top: 100, left: 20, width: 200, height: 760 }, bubble, viewport)).toMatchObject({ mode: "float", side: "right", left: 238 });
    expect(place({ top: 100, left: 1100, width: 200, height: 760 }, bubble, viewport)).toMatchObject({ mode: "float", side: "left" });
    expect(place({ top: 0, left: 0, width: 1400, height: 900 }, bubble, viewport)).toMatchObject({ mode: "float", side: "over" });
    expect(place(null, bubble, viewport)).toEqual({ mode: "center" });
  });

  it("keeps the card inside the screen", () => {
    const edge = place({ top: 100, left: 1380, width: 20, height: 20 }, bubble, viewport);
    expect(edge.mode === "float" && edge.left + bubble.width <= viewport.width - 16).toBe(true);
  });

  it("is a bottom sheet at phone width, and a top sheet when the target is low", () => {
    const phone = { width: 390, height: 844 };
    expect(place({ top: 100, left: 10, width: 100, height: 40 }, bubble, phone)).toEqual({ mode: "sheet", edge: "bottom" });
    expect(place({ top: 780, left: 10, width: 100, height: 40 }, bubble, phone)).toEqual({ mode: "sheet", edge: "top" });
    expect(place(null, bubble, phone)).toEqual({ mode: "sheet", edge: "bottom" });
  });

  it("pads the ring and clamps it to the screen", () => {
    expect(ringBox({ top: 2, left: 2, width: 50, height: 20 }, viewport)).toEqual({ top: 0, left: 0, width: 58, height: 28 });
  });

  it("finds the first shown anchor, reports a hidden one, and opens closed details on the way", () => {
    document.body.innerHTML = "<div id=\"a\" hidden></div><details><summary>More</summary><button id=\"b\">B</button></details>";
    const rects = jest.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
      const shown = !this.closest("[hidden]") && !this.closest("details:not([open]) > :not(summary)");
      return (shown ? [{}] : []) as unknown as DOMRectList;
    });
    expect(findTarget(document, [{ selector: "#missing" }])).toEqual({ state: "missing" });
    expect(findTarget(document, [{ selector: "#a" }])).toEqual({ state: "hidden", anchor: { selector: "#a" } });
    const found = findTarget(document, [{ selector: "#a" }, { selector: "#b", alt: true }]);
    expect(found.state === "found" && found.element.id).toBe("b");
    expect(document.querySelector("details")?.open).toBe(true);
    expect(findTarget(document, [{ selector: "##broken" }])).toEqual({ state: "missing" });
    document.body.innerHTML = "<details id=\"own\"><summary id=\"s\">Memory</summary><p>rows</p></details>";
    expect(findTarget(document, [{ selector: "#s" }]).state).toBe("found");
    expect((document.getElementById("own") as HTMLDetailsElement).open).toBe(false);
    rects.mockRestore();
  });

  it("mounts into the open modal dialog, or the page when none is open", () => {
    document.body.innerHTML = "<dialog id=\"d\" open></dialog>";
    const dialog = document.getElementById("d") as HTMLElement;
    expect(topModal(document)).toBe(document.body);
    const supports = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = { supports: (query: string) => query === "selector(:modal)" };
    const matches = jest.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) { return selector === ":modal" && this === dialog; });
    expect(topModal(document)).toBe(dialog);
    matches.mockRestore();
    (globalThis as { CSS?: unknown }).CSS = supports;
    document.body.innerHTML = "";
    expect(topModal(document)).toBe(document.body);
  });
});

describe("coach host actions", () => {
  it("opens the workspace, returns to the chat, opens the guide and the Studio once", () => {
    const intents: unknown[] = [];
    const stopNav = workspaceNavigation.subscribe(() => intents.push(workspaceNavigation.read()));
    const guides: unknown[] = [];
    const stopGuide = onGuideRequest((target) => guides.push(target));
    let studio = false;
    const calls: string[] = [];
    const host = coachHost({ openStudio: () => { studio = true; calls.push("open"); }, closeStudio: () => { studio = false; calls.push("close"); }, studioOpen: () => studio });
    host.run({ kind: "workspace", intent: { context: "orchestrator", page: "connections" } });
    host.run({ kind: "chat" });
    host.run({ kind: "guide", doc: "setup/setup-path.md" });
    host.run({ kind: "studio" });
    host.run({ kind: "studio" });
    host.run({ kind: "chat" });
    stopNav();
    stopGuide();
    expect(intents).toEqual([{ context: "orchestrator", page: "connections" }, null, null, null]);
    expect(guides).toEqual([{ id: "setup/setup-path" }]);
    expect(calls).toEqual(["open", "close"]);
  });

  it("leaves a Studio it did not open", () => {
    let closed = false;
    const host = coachHost({ openStudio: () => undefined, closeStudio: () => { closed = true; }, studioOpen: () => true });
    host.run({ kind: "studio" });
    host.run({ kind: "chat" });
    expect(closed).toBe(false);
  });
});

describe("quick start checklist", () => {
  const settings = (profileId: string | null) => ({ extraction: { ...defaultGlobalSettings().extraction, profileId } });

  it("ticks each item from real state", () => {
    const fresh = quickStartState({ snapshot: { ready: false, boundary: 0, noChat: { notice: "x" } }, settings: settings(null), groupOpen: false });
    expect(fresh).toEqual({ memory: false, group: false, story: false, reply: false });
    const loaded = quickStartState({ snapshot: { ready: true, boundary: 0, noChat: null }, settings: settings("p1"), groupOpen: true });
    expect(loaded).toEqual({ memory: true, group: true, story: true, reply: false });
    expect(quickStartState({ snapshot: { ready: true, boundary: 3, noChat: null }, settings: settings("p1"), groupOpen: true }).reply).toBe(true);
    expect(quickStartState({ snapshot: { ready: true, boundary: 3, noChat: null }, settings: settings("p1"), groupOpen: false }).story).toBe(false);
  });

  it("the quick start page carries one check per item and opens every Show me", () => {
    const page = GUIDE_PAGES.find((entry) => entry.id === "quick-start");
    const actions = pageActions(page?.body ?? "");
    expect(actions.filter((action) => action.name === "check").map((action) => action.value)).toEqual([...QUICK_START_CHECKS]);
    expect(actions.filter((action) => action.name === "show").length).toBeGreaterThanOrEqual(4);
  });

  it("renders checks and Show me in the app, and nothing extra on the website", () => {
    const body = "1. <!-- so:check memory --> **Pick a memory model.** <!-- so:show setup:memory -->\n2. <!-- so:check story --> Load it.";
    const app = renderToStaticMarkup(createElement(GuideMarkdown, { doc: "quick-start.md", body, homePage: "", checks: { memory: true, story: false }, onShow: () => undefined, actionLabels: GUIDE_COPY }));
    expect(app).toContain("data-check=\"memory\" data-done=\"true\"");
    expect(app).toContain("data-check=\"story\" data-done=\"false\"");
    expect(app).toContain("data-show=\"setup:memory\"");
    const plain = renderToStaticMarkup(createElement(GuideMarkdown, { doc: "quick-start.md", body, homePage: "" }));
    expect(plain).not.toContain("guide-check");
    expect(plain).not.toContain("guide-show");
    expect(plain).toContain("<ol");
    expect(plainText(body)).not.toMatch(/so:|check|setup:memory/);
  });
});

describe("guide Show me targets resolve", () => {
  const all = () => GUIDE_PAGES.flatMap((page) => pageActions(page.body).filter((action) => action.name === "show").map((action) => ({ page: page.id, value: action.value })));

  it("every tour Show me names a flow and one of its stops", () => {
    const broken = all().filter(({ value }) => {
      const target = guideShowOf(value);
      if (!target) return true;
      if (target.kind === "open") return false;
      const view = target.request.view;
      return !view || !COACH_FLOWS[view].stops.some((stop) => stop.id === target.request.stop);
    });
    expect(all().length).toBeGreaterThan(15);
    expect(broken).toEqual([]);
  });

  it("an open Show me names a real page, and a Defaults control opens its feature card", () => {
    expect(guideShowOf("open:orchestrator.defaults.so-feature-sprites-enabled")).toEqual({ kind: "open",
      intent: { context: "orchestrator", page: "defaults", feature: "sprites", control: "so-feature-sprites-enabled" } });
    expect(guideShowOf("open:orchestrator.connections.so-capabilities")).toEqual({ kind: "open", intent: { context: "orchestrator", page: "connections", control: "so-capabilities" } });
    expect(guideShowOf("open:orchestrator.nowhere.x")).toBeNull();
    expect(guideShowOf("open:somewhere.play")).toBeNull();
    expect(guideShowOf("setup:nowhere")).toEqual({ kind: "tour", request: { view: "setup", stop: "nowhere" } });
    expect(guideShowOf("nowhere")).toBeNull();
  });

  it("catches a planted broken Show me (control)", () => {
    const target = guideShowOf("setup:nowhere");
    expect(target?.kind === "tour" && COACH_FLOWS.setup.stops.some((stop) => stop.id === target.request.stop)).toBe(false);
  });
});

describe("setup path page", () => {
  const doc = () => read("docs/guide/setup/setup-path.md");

  it("runs levels 0 to 6, each step says what it does, its cost, where and how to check", () => {
    const levels = [...doc().matchAll(/^## Level (\d):/gm)].map((match) => Number(match[1]));
    expect(levels).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const steps = doc().split(/^### /m).slice(1);
    expect(steps.length).toBeGreaterThan(15);
    for (const step of steps) {
      const title = step.split("\n")[0];
      expect([title, ["**What it does:**", "**Cost:**", "**Where:**", "**How to check:**"].every((label) => step.includes(label))]).toEqual([title, true]);
    }
  });

  it("level 5 names every feature once, with what it does, a cost and when to turn it off", () => {
    const level5 = doc().slice(doc().indexOf("## Level 5"), doc().indexOf("## Level 6"));
    for (const id of STORY_FEATURE_IDS) {
      const rows = level5.split("\n").filter((line) => line.startsWith(`| **${FEATURE_CONTROLS[id].name}** |`));
      expect([id, rows.length]).toEqual([id, 1]);
      expect([id, rows[0].split("|").slice(1, -1).every((cell) => cell.trim().length > 0)]).toEqual([id, true]);
    }
  });

  it("names no element ids, and the claims it makes match the code", () => {
    expect(doc()).not.toMatch(/`so-[a-z-]+`/);
    const defaults = defaultGlobalSettings();
    const resolved = resolveFeatures(defaults, null);
    expect(STORY_FEATURE_IDS.filter((id) => !resolved[id].enabled)).toEqual([]);
    expect(STORY_FEATURE_IDS.filter((id) => resolved[id].automatic)).toEqual(["sprites"]);
    expect([defaults.extraction.profileId, defaults.extraction.cadence, DEFAULT_REPLY_EFFORT, defaults.worldInfo.gatingMode]).toEqual([null, 3, "medium", "scan"]);
    expect([defaults.copilot.enabled, defaults.copilot.ask]).toEqual([true, true]);
  });

  it("the guide index and the quick start link it", () => {
    expect(read("docs/guide/README.md")).toContain("](setup/setup-path.md)");
    expect(read("docs/guide/quick-start.md")).toContain("](setup/setup-path.md)");
  });
});

describe("tour sources", () => {
  const sources = readdirSync(join(ROOT, "src/guide/tour")).filter((name) => /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name));
  const importsOf = (file: string) => [...read(`src/guide/tour/${file}`).matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";?$/gms)]
    .filter((match) => !match[1]).map((match) => match[2]);

  it("only the mount opens the workspace or the guide, and nothing touches SillyTavern directly", () => {
    expect(sources.filter((file) => importsOf(file).some((specifier) => specifier.startsWith("@services/")))).toEqual([]);
    expect(sources.filter((file) => importsOf(file).some((specifier) => specifier === "@runtime/workspaceNavigation" || specifier === "@guide/request"))).toEqual(["coachMount.tsx"]);
  });

  it("the feature entry opens from Help and documents the setup path", () => {
    const tour = FEATURES.find((feature) => feature.id === "tour");
    expect(tour?.where.workspace).toEqual({ context: "orchestrator", page: "help", control: "so-help-tour" });
    expect(tour?.doc).toBe("setup/setup-path.md");
  });
});
