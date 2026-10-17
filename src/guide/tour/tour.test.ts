import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STORY_FEATURE_IDS } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import { DEFAULT_REPLY_EFFORT } from "@utils/reasoningEffort";
import { JUDGE_USES_OFF_BY_DEFAULT } from "@judge/settings";
import { TALK_CHAIN_MAX_DEFAULT } from "@engine/schema";
import { jargonIn } from "@features/jargon";
import { TOUR_AUTHOR_TERMS, TOUR_COPY, TOUR_TERMS } from "@features/tourCopy";
import { FEATURES } from "@features/registry";
import { GUIDE_PAGES } from "../pages.generated";
import { targetForDoc } from "../links";
import { onTourRequest, requestTour, tourViewOf, TOUR_VIEWS } from "./request";
import { AUTOMATIC_FEATURES, POLICY_NOTES, SETUP_ROUTE } from "./setupPath";
import { allSteps, findSteps, plainText, stepsOf, TOUR_ROUTES } from "./tourRoutes";
import { emptyProgress, memoryProgressStore, sanitizeProgress, tourProgressStore } from "./tourProgress";
import { guideCommand, TourStep } from "./TourStep";
import { TourMock, TOUR_MOCK_IDS } from "./TourMocks";
import { termsIn } from "./TourText";
import type { TourStep as TourStepData } from "./tourTypes";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf-8").replace(/\r\n/g, "\n");
const stepText = (step: TourStepData) =>
  [step.title, step.lead, ...step.do, ...step.see, ...step.off, step.unlocks ?? "", step.cost ?? "", step.where ?? "", step.docTitle ?? ""];

describe("tour request door", () => {
  it("parses the view word, and an unknown word is a usage error, not a view", () => {
    expect(tourViewOf(undefined)).toBeNull();
    expect(tourViewOf("Setup")).toBe("setup");
    expect(tourViewOf("player")).toBe("player");
    expect(tourViewOf("authors")).toBeUndefined();
  });

  it("says whether anything listened, and hands the view to the listener", () => {
    expect(requestTour("setup")).toBe(false);
    const seen: unknown[] = [];
    const stop = onTourRequest((view) => seen.push(view));
    expect(requestTour("author")).toBe(true);
    expect(requestTour()).toBe(true);
    stop();
    expect(requestTour("player")).toBe(false);
    expect(seen).toEqual(["author", null]);
  });
});

describe("tour progress per device", () => {
  const storage = () => {
    const items = new Map<string, string>();
    return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, items };
  };

  it("starts empty, round-trips a saved place, and keys it by user", () => {
    const backing = storage();
    const alice = tourProgressStore(() => backing, () => "alice");
    expect(alice.read()).toEqual(emptyProgress());
    const progress = { view: "setup" as const, current: { player: 2, author: 0, setup: 4 }, done: { player: ["start-a-story"], author: [], setup: ["memory-model"] } };
    expect(alice.write(progress)).toBe(true);
    expect(alice.read()).toEqual(progress);
    expect(tourProgressStore(() => backing, () => "bob").read()).toEqual(emptyProgress());
    expect([...backing.items.keys()]).toEqual(["story-orchestrator.tour.alice"]);
  });

  it("survives a broken entry, a throwing store and no store at all", () => {
    const backing = storage();
    backing.setItem("story-orchestrator.tour.u", "{not json");
    expect(tourProgressStore(() => backing, () => "u").read()).toEqual(emptyProgress());
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(tourProgressStore(() => throwing, () => "u").read()).toEqual(emptyProgress());
    expect(tourProgressStore(() => throwing, () => "u").write(emptyProgress())).toBe(false);
    expect(tourProgressStore(() => null, () => "u").write(emptyProgress())).toBe(false);
  });

  it("drops what it does not know", () => {
    expect(sanitizeProgress({ view: "nope", current: { player: -1, setup: 2.5, author: 3 }, done: { player: ["a", "a", 4], setup: "x" } }))
      .toEqual({ view: "player", current: { player: 0, author: 3, setup: 0 }, done: { player: ["a"], author: [], setup: [] } });
    const memory = memoryProgressStore();
    memory.write({ ...emptyProgress(), view: "author" });
    expect(memory.read().view).toBe("author");
  });
});

describe("tour routes", () => {
  it("has three views, unique step ids per view, and every block filled", () => {
    expect(Object.keys(TOUR_ROUTES)).toEqual([...TOUR_VIEWS]);
    for (const view of TOUR_VIEWS) {
      const ids = stepsOf(view).map((step) => step.id);
      expect([view, new Set(ids).size]).toEqual([view, ids.length]);
      for (const step of stepsOf(view)) {
        expect([step.id, step.do.length > 0, step.see.length > 0, step.off.length > 0]).toEqual([step.id, true, true, true]);
        if (step.mock === "setting") expect([step.id, Boolean(step.setting)]).toEqual([step.id, true]);
        if (step.mock === "policies") expect([step.id, Boolean(step.features?.length)]).toEqual([step.id, true]);
      }
    }
  });

  it("every mock a step names exists", () => {
    const named = new Set(allSteps().map(({ step }) => step.mock));
    expect([...named].filter((mock) => !["setting", "policies", ...TOUR_MOCK_IDS].includes(mock))).toEqual([]);
  });

  it("every term a step uses has a definition", () => {
    const terms = allSteps().flatMap(({ step }) => stepText(step).flatMap(termsIn));
    expect(terms.filter((term) => !(term in TOUR_TERMS) && !(term in TOUR_AUTHOR_TERMS))).toEqual([]);
  });

  it("finds steps by title, text and keyword across views", () => {
    expect(findSteps("judge key").map(({ step }) => step.id)).toContain("judge-key");
    expect(findSteps("lightbulb").map(({ view }) => view)).toEqual(["player"]);
    expect(findSteps("zzzz nothing")).toEqual([]);
    expect(findSteps("").length).toBe(allSteps().length);
  });
});

describe("tour and guide do not drift", () => {
  const pageOf = (doc: string) => {
    const target = targetForDoc(doc);
    const page = GUIDE_PAGES.find((candidate) => candidate.id === target.id);
    return { page, target };
  };

  it("every Read more target is a bundled guide page, and its anchor a heading on that page", () => {
    const docs = allSteps().flatMap(({ step }) => (step.doc ? [step.doc] : []));
    expect(docs.length).toBe(allSteps().length);
    const broken = docs.filter((doc) => {
      const { page, target } = pageOf(doc);
      return !page || (target.anchor !== undefined && !page.headings.some((heading) => heading.slug === target.anchor));
    });
    expect(broken).toEqual([]);
    expect(docs.filter((doc) => !existsSync(join(ROOT, "docs/guide", doc.split("#")[0])))).toEqual([]);
  });

  it("catches a planted missing page and a planted missing anchor (control)", () => {
    expect(pageOf("player/nowhere.md").page).toBeUndefined();
    const { page, target } = pageOf("player/playing.md#no-such-heading");
    expect(page?.headings.some((heading) => heading.slug === target.anchor)).toBe(false);
  });

  it("the chat command opens the same page", () => {
    expect(guideCommand("player/playing.md#restart")).toBe("/story guide player/playing");
    expect(guideCommand("setup/judge.md")).toBe("/story guide setup/judge");
  });

  it("the setup path page names every setup step's control and every feature default, with the tour's own words", () => {
    const doc = read("docs/guide/setup/setup-path.md");
    for (const step of stepsOf("setup")) {
      if (step.show?.control) expect([step.id, doc.includes(`\`${step.show.control}\``)]).toEqual([step.id, true]);
      expect([step.id, doc.includes(`**${step.title}**`) || doc.includes(`## ${step.title}`) || Boolean(step.features)]).toEqual([step.id, true]);
    }
    for (const id of STORY_FEATURE_IDS) {
      const level5 = doc.slice(doc.indexOf("## Level 5"), doc.indexOf("## Level 6"));
      const row = level5.split("\n").find((line) => line.startsWith(`| **${FEATURE_CONTROLS[id].name}** |`)) ?? "";
      expect([id, row.includes(`\`so-feature-${id}-enabled\``), row.includes(FEATURE_CONTROLS[id].description),
        row.includes(POLICY_NOTES[id].cost), row.includes(POLICY_NOTES[id].off)]).toEqual([id, true, true, true, true]);
    }
  });

  it("the guide index and the quick start link the setup path, and contributing links the style guide", () => {
    expect(read("docs/guide/README.md")).toContain("](setup/setup-path.md)");
    expect(read("docs/guide/quick-start.md")).toContain("](setup/setup-path.md)");
    expect(read("docs/dev/contributing.md")).toContain("](style.md)");
  });
});

describe("setup path claims match the code", () => {
  const defaults = defaultGlobalSettings();

  it("level 5 covers every feature once, with a cost and a reason to turn it off", () => {
    const covered = SETUP_ROUTE.groups.flatMap((group) => group.steps.flatMap((step) => step.features ?? []));
    expect([...covered].sort()).toEqual([...STORY_FEATURE_IDS].sort());
    expect(Object.keys(POLICY_NOTES).sort()).toEqual([...STORY_FEATURE_IDS].sort());
    const areas = SETUP_ROUTE.groups.find((group) => group.title.startsWith("Level 5"))?.steps ?? [];
    for (const step of areas) for (const id of step.features ?? []) expect([id, FEATURE_CONTROLS[id].area]).toEqual([id, step.title]);
  });

  it("every feature is on by default, and only the stage is automatic", () => {
    const resolved = resolveFeatures(defaults, null);
    expect(STORY_FEATURE_IDS.filter((id) => !resolved[id].enabled)).toEqual([]);
    expect(STORY_FEATURE_IDS.filter((id) => resolved[id].automatic)).toEqual([...AUTOMATIC_FEATURES]);
  });

  it("the defaults the steps quote", () => {
    expect(defaults.extraction.profileId).toBeNull();
    expect(defaults.extraction.cadence).toBe(3);
    expect(DEFAULT_REPLY_EFFORT).toBe("medium");
    expect(defaults.worldInfo.gatingMode).toBe("scan");
    expect([defaults.worldInfo.scanMemory, defaults.worldInfo.lateLore]).toEqual([true, true]);
    expect([defaults.judge.enabled, JUDGE_USES_OFF_BY_DEFAULT]).toEqual([true, []]);
    expect([defaults.copilot.enabled, defaults.copilot.ask, defaults.display.briefingDraft]).toEqual([true, true, true]);
    expect([defaults.image.enabled, defaults.image.backend, defaults.image.automation.mode]).toEqual([true, "st", "story"]);
    expect(defaults.sprites.stage).toBe("vn");
    expect(TALK_CHAIN_MAX_DEFAULT).toBe(3);
    expect([defaults.memory.innerBeat, defaults.memory.promises, defaults.memory.witness, defaults.memory.rumors]).toEqual([true, true, true, true]);
  });

  it("levels run 0 to 6 in order, and every setup step can open the workspace", () => {
    const levels = stepsOf("setup").map((step) => step.level);
    expect([...new Set(levels)]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(stepsOf("setup").filter((step) => !step.show)).toEqual([]);
    expect(stepsOf("setup").every((step) => step.cost && step.unlocks)).toBe(true);
  });

  it("a Defaults deep link names a real feature control", () => {
    const links = allSteps().flatMap(({ step }) => (step.show?.feature ? [step.show] : []));
    expect(links.length).toBeGreaterThan(1);
    for (const link of links) {
      const fields = link.feature ? FEATURE_CONTROLS[link.feature].controls.map((control) => `so-feature-${link.feature}-${control.field}`) : [];
      expect([link.control, fields.includes(link.control ?? "")]).toEqual([link.control, true]);
    }
  });
});

const LEAKS: Array<[string, RegExp]> = [
  ["repo path", /(?:^|[\s(])(?:docs|src|scripts|test)\/|\.md\b|\.tsx?\b/],
  ["plan id", /\bplan \d+\b|\bv2\.\d\b/i],
  ["camelCase key", /\b[a-z]+[A-Z][A-Za-z]*\b/],
  ["snake_case id", /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/],
];

describe("tour player copy is plain", () => {
  const playerCopy = () => [
    ...Object.values(TOUR_COPY), ...Object.values(TOUR_TERMS),
    ...stepsOf("player").flatMap((step) => stepText(step).map(plainText)),
  ];

  it("has no jargon, ids, paths or keys", () => {
    const found = playerCopy().flatMap((text) => [...jargonIn(text).map((entry) => `jargon "${entry.term}": ${text}`),
      ...LEAKS.filter(([, pattern]) => pattern.test(text)).map(([name]) => `${name}: ${text}`)]);
    expect(found).toEqual([]);
  });

  it("the checks catch a planted leak (control)", () => {
    expect(jargonIn("Open the checkpoint").length).toBe(1);
    expect(LEAKS.some(([, pattern]) => pattern.test("trust_guide rises"))).toBe(true);
  });
});

describe("tour examples are illustrations only", () => {
  const sources = readdirSync(join(ROOT, "src/guide/tour")).filter((name) => /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name));
  const importsOf = (file: string) => [...read(`src/guide/tour/${file}`).matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";?$/gms)]
    .filter((match) => !match[1]).map((match) => match[2]);

  it("only the mount touches SillyTavern or opens the workspace", () => {
    const host = sources.filter((file) => importsOf(file).some((specifier) => specifier.startsWith("@services/") || specifier === "@runtime/workspaceNavigation"));
    expect(host).toEqual(["tourMount.tsx"]);
  });

  it("the examples read copy and feature names, nothing that writes", () => {
    expect(importsOf("TourMocks.tsx").sort()).toEqual(["@features/tourCopy", "@runtime/featureControls", "react"]);
  });

  it("every example renders on its own", () => {
    for (const mock of TOUR_MOCK_IDS) expect([mock, renderToStaticMarkup(createElement(TourMock, { mock })).includes("data-so=\"tour-mock\"")]).toEqual([mock, true]);
    for (const step of stepsOf("setup")) {
      const html = renderToStaticMarkup(createElement(TourMock, { mock: step.mock, setting: step.setting, features: step.features }));
      expect([step.id, html.includes(TOUR_COPY.example)]).toEqual([step.id, true]);
    }
  });

  it("a step renders Read more as an in-app button, never a link out", () => {
    const step = stepsOf("player")[0];
    const html = renderToStaticMarkup(createElement(TourStep, { step, index: 0, total: 3, done: false, nextTitle: "Next one",
      onTried: () => undefined, onBack: () => undefined, onNext: () => undefined, onReadMore: () => undefined, onShow: () => undefined }));
    expect(html).toContain(`data-doc="${step.doc}"`);
    expect(html).not.toMatch(/<a\s/);
    expect(html).toContain(guideCommand(step.doc ?? ""));
  });
});

describe("tour feature entry", () => {
  it("is in the registry, opens from Help, and documents the setup path", () => {
    const tour = FEATURES.find((feature) => feature.id === "tour");
    expect(tour?.where.workspace).toEqual({ context: "orchestrator", page: "help", control: "so-help-tour" });
    expect(tour?.doc).toBe("setup/setup-path.md");
  });
});
