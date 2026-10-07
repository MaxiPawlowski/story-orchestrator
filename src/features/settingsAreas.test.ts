import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_OPEN_SECTIONS, DEV_ONLY_CHAPTER_KEYS, DEV_ONLY_JUDGE_USES, TALK_CHAIN_FIXED, defaultGlobalSettings, sanitizeGlobalSettings, withoutDevOnlySettings,
} from "@runtime/settingsModel";
import { offeredJudgeUses } from "@components/settings/JudgeSettingsGroup";
import { BUILT_JUDGE_USES } from "@judge/settings";
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

describe("v2.7 plan 29 dev-only settings", () => {
  const stored = sanitizeGlobalSettings({
    memory: { innerBeat: true, innerFanOut: "top2", harvestReasoning: true, chapters: { seal: true, storySoFar: true, fold: true, chronicleTokens: 700, recap: false } },
    judge: { uses: { loreExclusive: true, expressions: true, director: true } },
  });

  it("a dev build keeps them as stored", () => {
    expect(withoutDevOnlySettings(stored, true)).toBe(stored);
    expect(stored.memory.innerBeat).toBe(true);
  });

  it("a release build reads every dev-only setting at its default and keeps the rest", () => {
    const prod = withoutDevOnlySettings(stored, false);
    expect(prod.memory).not.toHaveProperty("innerBeat");
    expect(prod.memory).not.toHaveProperty("innerFanOut");
    expect(prod.memory).not.toHaveProperty("harvestReasoning");
    expect(DEV_ONLY_CHAPTER_KEYS.filter((key) => prod.memory.chapters && key in prod.memory.chapters)).toEqual([]);
    expect(prod.memory.chapters?.recap).toBe(false);
    expect(DEV_ONLY_JUDGE_USES.map((use) => prod.judge.uses[use])).toEqual([false, false]);
    expect(prod.judge.uses.director).toBe(true);
  });

  it("offers the dev-only judge uses only in a dev build", () => {
    expect(offeredJudgeUses(BUILT_JUDGE_USES, true, false).filter((use) => (DEV_ONLY_JUDGE_USES as readonly string[]).includes(use))).toEqual([]);
    expect(offeredJudgeUses(BUILT_JUDGE_USES, true, true)).toEqual(expect.arrayContaining([...DEV_ONLY_JUDGE_USES].filter((use) => BUILT_JUDGE_USES.includes(use))));
  });

  it("loads the dev-only controls only behind the dev flag", () => {
    expect(read("src/components/settings/PlayGroups.tsx")).toContain('__SO_DEV__ ? lazyRetry(() => import("./InnerVoiceControls")) : null');
    expect(read("src/components/settings/ChapterControls.tsx")).toContain('__SO_DEV__ ? lazyRetry(() => import("./ChapterRecordControls")) : null');
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
