import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_OPEN_SECTIONS, TALK_CHAIN_FIXED, defaultGlobalSettings, sanitizeGlobalSettings } from "@runtime/settingsModel";
import { offeredJudgeUses } from "@components/settings/JudgeSettingsGroup";
import { chapterSettings } from "@runtime/chapters";
import { BUILT_JUDGE_USES, JUDGE_USES_OFF_BY_DEFAULT } from "@judge/settings";
import { AREA_LABELS, FEATURE_AREAS, FEATURES } from "./registry";
import { SETTINGS_AREA_COPY, SETTING_COPY, settingsGuideLabel } from "./settingsCopy";
import { jargonIn } from "./jargon";

const ROOT = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf-8");

const ENTRY_POINTS = ["Start", "Continue", "Repair", "Author", "Help"];

const SECTION_EXCEPTIONS: Record<string, string> = {
  "private-knowledge": "Memory",
  "road-ahead": "Judge",
};

describe("v2.7 plan 29 settings by area", () => {
  it("names every area in the README's order, Images split out of World", () => {
    expect(FEATURE_AREAS).toEqual(["play", "memory", "characters", "world", "images", "judge", "authoring", "setup"]);
    expect(Object.values(SETTINGS_AREA_COPY).map((copy) => copy.label)).toEqual(["Playing", "Memory", "Characters", "World", "Images", "Judge", "Authoring", "Setup"]);
    expect(AREA_LABELS.images).toBe("Images");
  });

  it("gives every area a label, a one-line description, a guide page that exists and a guide button label", () => {
    for (const area of FEATURE_AREAS) {
      const copy = SETTINGS_AREA_COPY[area];
      expect([area, copy.oneLine.trim().length > 10]).toEqual([area, true]);
      expect([area, existsSync(join(ROOT, "docs", "guide", copy.doc))]).toEqual([area, true]);
      expect(jargonIn(`${copy.label} ${copy.oneLine}`)).toEqual([]);
      expect(settingsGuideLabel(area)).toBe(`Read the guide: ${copy.label}`);
    }
  });

  it("renders one section per area, in registry order", () => {
    const panel = read("src/components/settings/SettingsPanel.tsx");
    expect([...panel.matchAll(/<SettingsArea \{\.\.\.area\("([a-z]+)"\)\}/g)].map((match) => match[1])).toEqual([...FEATURE_AREAS]);
    expect(panel).not.toMatch(/so-general-setup|so-author-services|so-current-chat|so-diagnostics/);
  });

  it("places every settings feature in the section of its own area, or names why not", () => {
    const labels = new Map(FEATURE_AREAS.map((area) => [area, SETTINGS_AREA_COPY[area].label]));
    const misplaced = FEATURES.filter((feature) => feature.where.surface === "settings").flatMap((feature) => {
      const section = feature.where.label.replace(/^Settings › /, "").split(/ [›→] /)[0];
      if (ENTRY_POINTS.includes(section)) return [];
      if (feature.id.startsWith("judge-use-")) return section === "Judge" ? [] : [`${feature.id}: ${section}`];
      const expected = SECTION_EXCEPTIONS[feature.id] ?? labels.get(feature.area);
      return section === expected ? [] : [`${feature.id}: ${section}, expected ${expected}`];
    });
    expect(misplaced).toEqual([]);
  });
});

describe("v2.7 plan 29 fixed defaults", () => {
  const stored = {
    extraction: { cadence: 4, reconciliationMultiplier: 3 },
    pacing: { alpha: 0.9, hintEnabled: false },
    talk: { chain: { enabled: true, max: 2, stopOnTransition: false, holdExtraction: true } },
  };

  it("drops the removed keys from a stored value and from the defaults", () => {
    const settings = sanitizeGlobalSettings(stored);
    expect(settings.extraction).not.toHaveProperty("reconciliationMultiplier");
    expect(settings.extraction.cadence).toBe(4);
    expect(settings.pacing).toEqual({ hintEnabled: false });
    expect(settings.talk.chain).toEqual({ enabled: true, max: 2 });
    const defaults = defaultGlobalSettings();
    expect(defaults.extraction).not.toHaveProperty("reconciliationMultiplier");
    expect(defaults.pacing).toEqual({ hintEnabled: true });
    expect(defaults.talk.chain).not.toHaveProperty("stopOnTransition");
  });

  it("keeps the fixed values as code constants and no settings help for them", () => {
    expect(TALK_CHAIN_FIXED).toEqual({ stopOnTransition: true, holdExtraction: false });
    for (const key of ["extraction.reconciliationMultiplier", "pacing.alpha", "talk.chain.stopOnTransition", "talk.chain.holdExtraction"]) expect(SETTING_COPY).not.toHaveProperty(key);
    expect(read("src/runtime/boundaryWork.ts")).toContain("RECONCILIATION_MULTIPLIER");
    expect(read("src/runtime/runtimeManager.ts")).toContain("...TALK_CHAIN_FIXED");
  });
});

describe("one build (2026-10-07): the settings the release build used to strip are ordinary settings, on by default (owner decision 2026-10-09)", () => {
  const FORMERLY_STRIPPED_USES = ["loreExclusive", "expressions", "wardenVoice"] as const;

  it("a fresh install reads every one of them on", () => {
    const fresh = sanitizeGlobalSettings(undefined);
    expect(fresh.memory.innerBeat).toBe(true);
    expect(fresh.memory.innerFanOut).toBeUndefined();
    expect(fresh.memory.harvestReasoning).toBe(true);
    const chapters = chapterSettings(fresh.memory.chapters);
    expect([chapters.seal, chapters.storySoFar, chapters.fold]).toEqual([true, true, true]);
    expect(FORMERLY_STRIPPED_USES.map((use) => fresh.judge.uses[use])).toEqual([true, true, true]);
    expect(FORMERLY_STRIPPED_USES.filter((use) => JUDGE_USES_OFF_BY_DEFAULT.includes(use))).toEqual([]);
  });

  it("control: a measured use keeps its default on", () => {
    expect(sanitizeGlobalSettings(undefined).judge.uses.director).toBe(true);
    expect(sanitizeGlobalSettings(undefined).judge.uses.loreSelect).toBe(true);
  });

  it("a stored value is kept as stored, on or off", () => {
    const stored = sanitizeGlobalSettings({
      memory: { innerBeat: true, innerFanOut: "top2", harvestReasoning: true, chapters: { seal: true, storySoFar: true, fold: true, chronicleTokens: 700, recap: false } },
      judge: { uses: { loreExclusive: true, expressions: true, wardenVoice: true, director: false } },
    });
    expect([stored.memory.innerBeat, stored.memory.innerFanOut, stored.memory.harvestReasoning]).toEqual([true, "top2", true]);
    expect(stored.memory.chapters).toMatchObject({ seal: true, storySoFar: true, fold: true, chronicleTokens: 700, recap: false });
    expect(FORMERLY_STRIPPED_USES.map((use) => stored.judge.uses[use])).toEqual([true, true, true]);
    expect(stored.judge.uses.director).toBe(false);
  });

  it("offers every built judge use in author view", () => {
    expect(offeredJudgeUses(BUILT_JUDGE_USES, true)).toEqual([...BUILT_JUDGE_USES]);
    expect(offeredJudgeUses(BUILT_JUDGE_USES, true)).toEqual(expect.arrayContaining([...FORMERLY_STRIPPED_USES]));
  });

  it("loads the inner voice and chapter record controls lazily, with no build flag", () => {
    expect(read("src/components/settings/PlayGroups.tsx")).toContain('const InnerVoiceControls = lazyRetry(() => import("./InnerVoiceControls"));');
    expect(read("src/components/settings/ChapterControls.tsx")).toContain('const ChapterRecordControls = lazyRetry(() => import("./ChapterRecordControls"));');
    expect(read("src/components/settings/ChapterControls.tsx")).not.toContain("so-chapter-seal");
  });
});

describe("v2.7 plan 29 open sections", () => {
  it("opens Playing on a fresh install and remembers a stored choice", () => {
    expect(DEFAULT_OPEN_SECTIONS).toEqual(["play"]);
    expect(defaultGlobalSettings().help.openSections).toEqual(["play"]);
    expect(sanitizeGlobalSettings({ help: {} }).help.openSections).toEqual(["play"]);
    expect(sanitizeGlobalSettings({ help: { openSections: [] } }).help.openSections).toEqual([]);
    expect(sanitizeGlobalSettings({ help: { openSections: ["memory", "memory", " judge ", 3, "<x>"] } }).help.openSections).toEqual(["memory", "judge"]);
  });
});
