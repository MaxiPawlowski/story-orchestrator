import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultGlobalSettings, defaultExtractionSettings, defaultMemorySettings, sanitizeGlobalSettings, type GlobalSettings } from "@runtime/settingsModel";
import type { ExtractionRuntimeSettings, MemoryRuntimeSettings } from "@runtime/types";
import { DEFAULT_CHAPTER_SETTINGS } from "@runtime/chapters";
import { JUDGE_USE_COPY } from "@judge/settings";
import { JUDGE_READINESS_BY_PROVIDER } from "@judge/readiness";
import { EDIT_CATCH_UP_TEXT, HUD_COPY, PIPELINE_ACTION_COPY, REPAIR_PLAYER_COPY, hudChipLabel } from "@runtime/pipeline";
import { PLAYER_COPY } from "@runtime/narrative";
import { CP_HELP_STRING, SO_MEM_HELP_STRING, STORY_HELP_STRING, STORY_VERBS, storyHelpText, soMemHelpText } from "@runtime/slashHelp";
import { gettingStartedShown, gettingStartedSteps } from "@runtime/repair";
import { THINKING_CHECK, THINKING_PLAYER_TEXT } from "@runtime/checks";
import { GUIDE_TOPIC_IDS } from "@copilot/guideTopics";
import {
  AREA_LABELS, FEATURE_AREAS, FEATURES, HOME_PAGE, NEED_LABELS, authorGuideDoc, compareVersions, coversSetting, featuresForSetting, guideUrl, newestSince,
  visibleFeatures, whatsNew, type FeatureAudience,
} from "./registry";
import { SETTING_COPY } from "./settingsCopy";
import { JARGON, jargonIn } from "./jargon";
import { BRIEFING_COPY, HELP_COPY, ONBOARDING_LINES } from "./helpCopy";
import { INLINE_CATEGORY_HELP, INLINE_LEGEND_COPY, INLINE_LEVEL_HELP, INLINE_LEVEL_LABELS, INLINE_STATE_LABELS } from "./inlineCopy";

const ROOT = resolve(__dirname, "../..");

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const leaves = (value: unknown, prefix = ""): string[] => {
  if (!isRecord(value) || !Object.keys(value).length) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
};

const OPTIONAL_EXTRACTION: Record<Exclude<keyof ExtractionRuntimeSettings, keyof ReturnType<typeof defaultExtractionSettings>>, true> = {
  fallbackProfileId: true, profiles: true, routes: true, reasoningBudget: true, replyEffort: true,
};

const OPTIONAL_MEMORY: Record<Exclude<keyof MemoryRuntimeSettings, keyof ReturnType<typeof defaultMemorySettings>>, true> = {
  scoreWeights: true, innerBeat: true, innerFanOut: true, harvestReasoning: true, chapters: true,
};

const settingKeys = (): string[] => {
  const defaults: GlobalSettings = defaultGlobalSettings();
  const product = { ...defaults, memory: { ...defaults.memory, chapters: DEFAULT_CHAPTER_SETTINGS } };
  const optional = [
    ...Object.keys(OPTIONAL_EXTRACTION).map((key) => `extraction.${key}`),
    ...Object.keys(OPTIONAL_MEMORY).filter((key) => key !== "chapters").map((key) => `memory.${key}`),
  ];
  return [...new Set([...leaves(product), ...optional])];
};

const KEYS = settingKeys();

const staticPrefix = (pattern: string) => pattern.split(".*")[0];

const patternResolves = (pattern: string) => {
  const parts = pattern.split(".");
  return KEYS.some((key) => {
    const keyParts = key.split(".");
    const shared = Math.min(keyParts.length, parts.length);
    return keyParts.slice(0, shared).every((part, index) => parts[index] === "*" || parts[index] === part);
  });
};

const ownersOf = (pattern: string) => {
  const prefix = staticPrefix(pattern);
  return FEATURES.filter((feature) => feature.settings.some((owned) => coversSetting(owned, prefix) || coversSetting(prefix, owned)));
};

const audienceOfSetting = (pattern: string): FeatureAudience | null => ownersOf(pattern)[0]?.audience ?? null;

interface CopyItem {
  source: string;
  audience: FeatureAudience;
  text: string;
}

const copyItems = (): CopyItem[] => [
  ...FEATURES.flatMap((feature) => [feature.name, feature.oneLine, feature.what, feature.where.label]
    .map((text) => ({ source: `feature ${feature.id}`, audience: feature.audience, text }))),
  ...Object.entries(SETTING_COPY).flatMap(([key, copy]) => [copy.label, copy.help]
    .map((text) => ({ source: `setting ${key}`, audience: audienceOfSetting(key) ?? "setup", text }))),
  ...Object.entries(JUDGE_USE_COPY).flatMap(([key, copy]) => [copy.label, copy.description, copy.sends].map((text) => ({ source: `judge use ${key}`, audience: "setup" as const, text }))),
  ...Object.entries(JUDGE_READINESS_BY_PROVIDER).flatMap(([provider, facts]) => Object.entries(facts)
    .map(([key, fact]) => ({ source: `readiness ${provider}.${key}`, audience: "setup" as const, text: fact?.recommendation ?? "" }))),
  ...[PLAYER_COPY, HUD_COPY, REPAIR_PLAYER_COPY, PIPELINE_ACTION_COPY, HELP_COPY, INLINE_LEGEND_COPY, INLINE_CATEGORY_HELP, INLINE_STATE_LABELS, INLINE_LEVEL_HELP]
    .flatMap((table, index) => Object.values(table).map((text) => ({ source: `player copy table ${index}`, audience: "player" as const, text: String(text) }))),
  ...Object.values(INLINE_LEVEL_LABELS).map((text) => ({ source: "inline level", audience: "player" as const, text })),
  ...[...Object.values(BRIEFING_COPY), ...ONBOARDING_LINES.map((line) => line.text)].map((text) => ({ source: "briefing copy", audience: "player" as const, text })),
  ...[STORY_HELP_STRING, storyHelpText(), SO_MEM_HELP_STRING, soMemHelpText()].map((text) => ({ source: "slash help", audience: "player" as const, text })),
  { source: "slash help /cp", audience: "author", text: CP_HELP_STRING },
  ...Object.values(AREA_LABELS).map((text) => ({ source: "area", audience: "player" as const, text })),
  ...Object.values(NEED_LABELS).map((text) => ({ source: "need", audience: "player" as const, text })),
];

const LEAKS: Array<[string, RegExp]> = [
  ["repo path", /(?:^|[\s(])(?:docs|src|scripts|test)\/|\.md\b|\.tsx?\b/],
  ["plan id", /\bplan \d+\b|\bv2\.\d+ plan\b|\bv2\.\d\b/i],
  ["internal id", /\b(?:[A-Z]{1,2}\d+(?:[.\-–]\d+)+|AS-\d+|CR-[A-Z0-9]+)\b/],
  ["camelCase key", /\b[a-z]+[A-Z][A-Za-z]*\b/],
];

const PLAYER_ONLY_LEAKS: Array<[string, RegExp]> = [["snake_case id", /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/]];

describe("v2.7 plan 01 feature registry", () => {
  it("gives every feature a unique id, a known area, a guide page path and a version", () => {
    const ids = FEATURES.map((feature) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of FEATURES) {
      expect(FEATURE_AREAS).toContain(feature.area);
      expect(feature.doc).toMatch(/^(player|author|setup)\/[A-Za-z0-9/-]+\.md$/);
      expect(feature.since).toMatch(/^\d+\.\d+\.\d+$/);
      expect(feature.oneLine.trim().length).toBeGreaterThan(0);
      expect(feature.what.trim().length).toBeGreaterThan(feature.oneLine.length / 2);
      if (feature.guideTopic) expect(GUIDE_TOPIC_IDS).toContain(feature.guideTopic);
    }
  });

  it("points every feature's doc at a guide page that exists", () => {
    const missing = FEATURES.filter((feature) => !existsSync(join(ROOT, "docs", "guide", feature.doc))).map((feature) => `${feature.id}: ${feature.doc}`);
    expect(missing).toEqual([]);
  });

  it("points every author's guide topic at a page that exists", () => {
    expect(GUIDE_TOPIC_IDS.filter((topic) => !existsSync(join(ROOT, "docs", "guide", authorGuideDoc(topic))))).toEqual([]);
  });

  it("assigns every install-wide setting key to exactly one feature", () => {
    const owners = KEYS.map((key) => ({ key, owners: featuresForSetting(key).map((feature) => feature.id) }));
    expect(owners.filter((row) => row.owners.length !== 1)).toEqual([]);
  });

  it("names only settings that exist", () => {
    const dangling = FEATURES.flatMap((feature) => feature.settings.filter((owned) => !KEYS.some((key) => coversSetting(owned, key))).map((owned) => `${feature.id}: ${owned}`));
    expect(dangling).toEqual([]);
  });

  it("catches a key no feature owns (control)", () => {
    expect(featuresForSetting("display.somethingNew")).toEqual([]);
    expect(featuresForSetting("extraction.cadence").map((feature) => feature.id)).toEqual(["memory"]);
  });

  it("links to the repository guide named by the manifest", () => {
    expect(HOME_PAGE).toMatch(/^https:\/\/github\.com\/[^/]+\/story-orchestrator$/);
    expect(guideUrl("player/memory.md")).toBe(`${HOME_PAGE}/blob/master/docs/guide/player/memory.md`);
    expect(guideUrl("player/memory.md", "")).toBeNull();
  });

  it("lists only player and setup features unless Author view is on", () => {
    expect(visibleFeatures(false).some((feature) => feature.audience === "author")).toBe(false);
    expect(visibleFeatures(true).length).toBe(FEATURES.length);
    expect(visibleFeatures(false).length).toBeGreaterThan(5);
  });
});

describe("v2.7 plan 01 settings help", () => {
  it("has a label and a help string for every control's setting", () => {
    for (const [key, copy] of Object.entries(SETTING_COPY)) {
      expect([key, copy.label.trim().length > 0]).toEqual([key, true]);
      expect([key, copy.help.trim().length > 20]).toEqual([key, true]);
    }
  });

  it("keys help only by settings that exist and that a feature owns", () => {
    expect(Object.keys(SETTING_COPY).filter((key) => !patternResolves(key))).toEqual([]);
    expect(Object.keys(SETTING_COPY).filter((key) => ownersOf(key).length === 0)).toEqual([]);
  });

  const CONTROL_FILES = [
    ...readdirSync(join(ROOT, "src/components/settings")).filter((name) => name.endsWith(".tsx") && !name.endsWith(".stories.tsx")).map((name) => `src/components/settings/${name}`),
    "src/image/ImageGroup.tsx", "src/sprites/SpriteSettingsView.tsx", "src/components/drawer/DrawerTabs.tsx",
  ];

  it("renders every labelled settings control through a field that carries help", () => {
    const problems = CONTROL_FILES.flatMap((file) => {
      const source = readFileSync(join(ROOT, file), "utf-8");
      const tags = source.match(/<(?:CheckRow|FieldLabel)\b[^>]*?\/>/gs) ?? [];
      const unhelped = tags.filter((tag) => !/\bsetting=|\bhelp=/.test(tag)).map((tag) => `${file}: ${tag.slice(0, 80)}`);
      const rawLabels = file.endsWith("Field.tsx") || file.endsWith("DrawerTabs.tsx") ? [] : (source.match(/<label\b/g) ?? []).map(() => `${file}: raw <label>`);
      return [...unhelped, ...rawLabels];
    });
    expect(problems).toEqual([]);
  });

  it("names a settings key that exists in every setting= prop", () => {
    const named = CONTROL_FILES.flatMap((file) => [...readFileSync(join(ROOT, file), "utf-8").matchAll(/setting="([^"]+)"/g)].map((match) => match[1]));
    expect(named.length).toBeGreaterThan(30);
    expect(named.filter((key) => !(key in SETTING_COPY))).toEqual([]);
  });
});

describe("v2.7 plan 01 UI copy", () => {
  it("never shows a repo path, a plan id, a raw internal id or a code key", () => {
    const leaks = copyItems().flatMap((item) => LEAKS.filter(([, pattern]) => pattern.test(item.text)).map(([name]) => `${item.source} (${name}): ${item.text.slice(0, 100)}`));
    expect(leaks).toEqual([]);
  });

  it("keeps snake_case ids out of copy a player can see", () => {
    const leaks = copyItems().filter((item) => item.audience !== "author")
      .flatMap((item) => PLAYER_ONLY_LEAKS.filter(([, pattern]) => pattern.test(item.text)).map(([name]) => `${item.source} (${name}): ${item.text.slice(0, 100)}`));
    expect(leaks).toEqual([]);
  });

  it("keeps jargon out of player copy", () => {
    const found = copyItems().filter((item) => item.audience === "player")
      .flatMap((item) => jargonIn(item.text).map((entry) => `${item.source}: "${entry.term}" (say "${entry.plain}") in: ${item.text.slice(0, 100)}`));
    expect(found).toEqual([]);
  });

  it("gives every jargon entry a plain replacement, and the matcher finds a planted term (control)", () => {
    for (const entry of JARGON) expect(entry.plain.trim().length).toBeGreaterThan(0);
    expect(jargonIn("Smoothing α controls it").map((entry) => entry.term)).toContain("Smoothing α");
    expect(jargonIn("The Lag field").map((entry) => entry.term)).toContain("Lag");
    expect(jargonIn("Raise the flag")).toEqual([]);
  });

  it("detects a planted leak (control)", () => {
    const leak = (text: string) => LEAKS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
    expect(leak("see docs/plans/v2.6/12-provider-matrix.md")).toEqual(expect.arrayContaining(["repo path", "plan id"]));
    expect(leak("measured in v2.5 plan 08")).toContain("plan id");
    expect(leak("after the T6-2 play check")).toContain("internal id");
    expect(leak("As sceneTrigger: measured")).toContain("camelCase key");
    expect(leak("Where the story is right now.")).toEqual([]);
  });
});

describe("v2.7 plan 01 slash help", () => {
  it("lists every /story verb, help included", () => {
    expect(STORY_VERBS.map((entry) => entry.verb)).toEqual(["recap", "threads", "intro", "chapters", "chapter", "chronicle", "flag", "guide", "help"]);
    for (const entry of STORY_VERBS) expect(STORY_HELP_STRING).toContain(entry.what);
    expect(SO_MEM_HELP_STRING).not.toMatch(/\bv2\b/);
  });
});

describe("v2.7 plan 01 what's new and getting started", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("2.10.0", "2.9.1")).toBe(1);
    expect(compareVersions("2.6.0", "2.6.0")).toBe(0);
    expect(compareVersions("2.4.0", "2.6.0")).toBe(-1);
  });

  it("shows nothing on a fresh install, everything since 2.4 on an upgraded one, nothing once seen", () => {
    expect(whatsNew({ lastSeen: null, configured: false, authorView: false })).toEqual([]);
    const upgraded = whatsNew({ lastSeen: null, configured: true, authorView: false });
    expect(upgraded.length).toBeGreaterThan(0);
    expect(upgraded.every((feature) => compareVersions(feature.since, "2.4.0") > 0 && feature.audience !== "author")).toBe(true);
    expect(whatsNew({ lastSeen: newestSince(), configured: true, authorView: true })).toEqual([]);
  });

  it("stores the last seen version install-wide and keeps only a version", () => {
    expect(defaultGlobalSettings().help).toEqual({ lastSeenVersion: null, checklistDismissed: false, dismissedChecks: [], onboardingSeen: false });
    expect(sanitizeGlobalSettings({ help: { lastSeenVersion: "2.7.0", checklistDismissed: true } }).help).toEqual({ lastSeenVersion: "2.7.0", checklistDismissed: true, dismissedChecks: [], onboardingSeen: false });
    expect(sanitizeGlobalSettings({ help: { lastSeenVersion: "soon" } }).help.lastSeenVersion).toBeNull();
  });

  it("keeps the checklist until the memory model is set, and folds it when done or hidden", () => {
    const none = gettingStartedSteps({ memoryModel: false, judgeReady: false, imagesReady: false });
    expect(none.map((step) => step.id)).toEqual(["memory-model", "judge", "images"]);
    expect(gettingStartedShown(none, true)).toBe(true);
    const memory = gettingStartedSteps({ memoryModel: true, judgeReady: false, imagesReady: false });
    expect(gettingStartedShown(memory, false)).toBe(true);
    expect(gettingStartedShown(memory, true)).toBe(false);
    expect(gettingStartedShown(gettingStartedSteps({ memoryModel: true, judgeReady: true, imagesReady: true }), false)).toBe(false);
  });
});

describe("v2.7 plan 03 (K3): stories play in group chats", () => {
  it("the stories feature needs a group chat", () => {
    expect(FEATURES.find((feature) => feature.id === "stories")?.needs).toContain("group-chat");
  });

  it("the guide says so up front and in the FAQ, and no longer says a one-on-one chat works", () => {
    const faq = readFileSync(join(ROOT, "docs/guide/player/troubleshooting.md"), "utf-8").replace(/\r\n/g, "\n");
    expect(faq).toContain("**Does it work in a one-on-one chat?** No: stories play in group chats.");
    expect(faq).not.toMatch(/one-on-one chat\?\*\* Yes/);
    expect(readFileSync(join(ROOT, "docs/guide/README.md"), "utf-8")).toContain("**Stories play in group chats.**");
  });
});

describe("v2.7 plan 08 (A11): the guide shows the thinking warning as players see it", () => {
  it("the check is a player check, and the troubleshooting page quotes its player copy", () => {
    expect(THINKING_CHECK.audience).toBe("player");
    const faq = readFileSync(join(ROOT, "docs/guide/player/troubleshooting.md"), "utf-8").replace(/\r\n/g, "\n");
    expect(faq).toContain(`"${THINKING_PLAYER_TEXT}"`);
    expect(faq).toContain("These show in player mode too");
  });
});

describe("v2.7 plan 10 (C guide line): the guide explains catching up after an edit", () => {
  it("the HUD page names the chip and the troubleshooting page quotes the status line", () => {
    const read = (page: string) => readFileSync(join(ROOT, `docs/guide/player/${page}`), "utf-8").replace(/\r\n/g, "\n");
    expect(read("drawer-and-hud.md")).toContain(`| \`${hudChipLabel("catching-up", false)}\` |`);
    expect(read("troubleshooting.md")).toContain(`| "${EDIT_CATCH_UP_TEXT}" |`);
    expect(read("troubleshooting.md")).toContain("a reply is built from the pre-edit state");
  });
});
