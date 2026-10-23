import { canShow } from "@components/help/HelpPanel";
import { FEATURES } from "@features/registry";
import { helpWhere } from "@features/where";
import { AUTHOR_JUDGE_USES, BUILT_JUDGE_USES } from "@judge/settings";
import { judgeUseControlId } from "@judge/useRows";
import { defaultGlobalSettings, type GlobalSettings } from "./settingsModel";
import { pageRenders, SHOW_ME_CONDITIONAL, showMeRenders, UNKNOWN_HOST, type ShowMeContext, type ShowMeHostFacts } from "./showMeRenders";
import { DRAWER_TAB_OF_CONTROL, MEMORY_SEARCH_FROM } from "./surfaceShown";
import type { RuntimeSnapshot } from "./types";

const SHOW_ME_ALWAYS = [
  "#so-player-overview", "#so-open-activity", "#so-author-view",
  "#so-area-setup", "#so-capabilities", "#so-epistemic-capable", "#so-extraction-profile", "#so-image-settings", "#so-judge-enabled",
  "#so-live-head-enabled", "#so-lorebooks-header", "#so-model-sources", "#so-role-profiles", "#so-self-test",
  "#so-sprite-mouth", "#so-wi-gating-mode", "#so-copilot-ask", "#so-help-open-guide", "#so-help-open-panel", "#so-help-tour",
  "#so-announce-transitions", "#so-briefing-draft", "#so-briefing-enabled", "#so-hud-enabled", "#so-inline-level", "#so-player-setup-enabled",
  "#so-presence-chapter-card", "#so-presence-continue-list", "#so-presence-group-card", "#so-presence-list-badges", "#so-presence-roll-chips",
  "#so-presence-wand", "#so-your-move-enabled", "#so-entry-repair", "#so-group-story-select", "#so-new-story-wizard", "#so-open-studio",
  "#story-library-select",
  ...BUILT_JUDGE_USES.filter((use) => !AUTHOR_JUDGE_USES.includes(use)).map((use) => `#${judgeUseControlId(use)}`),
];

const settingsWith = (change?: (settings: GlobalSettings) => void): GlobalSettings => {
  const settings = structuredClone(defaultGlobalSettings());
  change?.(settings);
  return settings;
};

const snap = (patch: Record<string, unknown> = {}, authorView = false): RuntimeSnapshot => ({
  ready: true, storyId: "s", ui: { authorView }, presence: { shown: { journal: true, statSheet: true, widgets: true, suggestions: true } },
  memory: { entries: [] }, ...patch,
} as unknown as RuntimeSnapshot);

const game = (patch: Record<string, unknown>) => ({ journal: [], milestones: [], codex: null, statSheet: null, widgets: [], ...patch });

const context = (snapshot: RuntimeSnapshot | null, patch: Partial<ShowMeContext> = {}): ShowMeContext => ({
  snapshot, authorView: snapshot?.ui.authorView ?? false, settings: settingsWith(), host: UNKNOWN_HOST, ...patch,
});

const host = (facts: Partial<ShowMeHostFacts>): ShowMeHostFacts => ({ ...UNKNOWN_HOST, ...facts });
const entries = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `m${index}`, text: "x", tier: "facts" }));
const localJudge = (settings: GlobalSettings) => {
  settings.judge.enabled = true;
  settings.judge.provider = { ...settings.judge.provider, director: "systemone-local" };
  settings.judge.uses = { ...settings.judge.uses, director: true };
};
const memoryReady = (settings: GlobalSettings) => { settings.extraction.enabled = true; settings.extraction.profileId = "p"; };

const ARMS: Record<string, { renders: ShowMeContext; hidden: ShowMeContext }> = {
  ...Object.fromEntries(AUTHOR_JUDGE_USES.map((use) => [`#${judgeUseControlId(use)}`, { renders: context(null, { authorView: true }), hidden: context(null) }])),
  "#so-open-journal": { renders: context(snap({ game: game({ journal: [{ id: "j" }] }) })), hidden: context(snap({ game: game({}) })) },
  "#so-open-stat-sheet": { renders: context(snap({ game: game({ statSheet: { rows: [] } }) })), hidden: context(snap({ game: game({}) })) },
  "#so-open-widgets": { renders: context(snap({ game: game({ widgets: [{ id: "w" }] }) })), hidden: context(snap({ game: game({}) })) },
  "#so-open-suggestions": { renders: context(snap()), hidden: context(snap({ presence: { shown: { suggestions: false } } })) },
  "#so-player-promises": { renders: context(snap({ promises: [{ id: "p" }] })), hidden: context(snap({ promises: [] })) },
  "#so-carry-heritage": { renders: context(snap({ carry: { state: { values: [] } } })), hidden: context(snap({ carry: { state: null } })) },
  "#so-living-save": { renders: context(snap({ living: { canSave: true } })), hidden: context(snap({ living: { canSave: false } })) },
  "#so-memory-search": {
    renders: context(snap({ memory: { entries: entries(MEMORY_SEARCH_FROM + 1) } })),
    hidden: context(snap({ memory: { entries: entries(MEMORY_SEARCH_FROM + 1) }, memoryShown: entries(3) })),
  },
  "#so-character-life": { renders: context(snap({ lifeAuthor: { rows: [] } }, true)), hidden: context(snap({ lifeAuthor: null }, true)) },
  "#so-living-scene-tests": {
    renders: context(snap({ living: { author: { sceneTest: true } } }, true)), hidden: context(snap({ living: { author: { sceneTest: false } } }, true)),
  },
  "#so-cast-scene": { renders: context(snap({}, true)), hidden: context(snap({}, false)) },
  "#so-judge-expansion-variants": { renders: context(null, { authorView: true }), hidden: context(null) },
  "#so-gpu-broker": { renders: context(null, { host: host({ gpuBroker: true }) }), hidden: context(null, { host: host({ gpuBroker: null }) }) },
  "#so-judge-local-systemone-local": { renders: context(null, { settings: settingsWith(localJudge) }), hidden: context(null) },
  "#so-getting-started": {
    renders: context(null),
    hidden: context(null, { settings: settingsWith((settings) => { memoryReady(settings); settings.help.checklistDismissed = true; }) }),
  },
};

const whereOf = (selector: string) => {
  const feature = FEATURES.find((entry) => entry.where.selector === selector);
  if (!feature) throw new Error(`no registry where ${selector}`);
  return feature.where;
};

describe("Show me renders", () => {
  test("every conditional target has both arms", () => {
    expect(Object.keys(ARMS).sort()).toEqual(Object.keys(SHOW_ME_CONDITIONAL).sort());
  });

  test.each(Object.entries(ARMS))("%s renders in one arm and not the other", (selector, arms) => {
    const where = whereOf(selector);
    expect(showMeRenders(where, arms.renders)).toBe(true);
    expect(showMeRenders(where, arms.hidden)).toBe(false);
  });

  test("every Help target is conditional, always rendered or a Features control", () => {
    const listed = new Set([...Object.keys(SHOW_ME_CONDITIONAL), ...SHOW_ME_ALWAYS]);
    const unlisted = FEATURES.map((feature) => feature.where)
      .filter((where) => canShow(where) && where.workspace?.page !== "features" && !listed.has(where.selector))
      .map((where) => where.selector);
    expect([...new Set(unlisted)]).toEqual([]);
    expect(SHOW_ME_ALWAYS.filter((selector) => selector in SHOW_ME_CONDITIONAL)).toEqual([]);
  });

  test("an author page target needs Author view, its placeholder needs player view", () => {
    expect(pageRenders(whereOf("#so-open-activity"), context(snap({}, false)))).toBe(false);
    expect(pageRenders(whereOf("#so-open-activity"), context(snap({}, true)))).toBe(true);
    expect(pageRenders(whereOf("#so-author-view"), context(snap({}, true)))).toBe(false);
    expect(pageRenders(whereOf("#so-author-view"), context(snap({}, false)))).toBe(true);
  });

  test("a Play target needs a loaded story", () => {
    expect(pageRenders(whereOf("#so-player-overview"), context(snap({ ready: false })))).toBe(false);
    expect(pageRenders(whereOf("#so-player-overview"), context(snap()))).toBe(true);
    expect(pageRenders(whereOf("#so-hud-enabled"), context(null))).toBe(true);
  });

  test("conditional author targets inside a drawer tab open that tab", () => {
    expect(Object.keys(DRAWER_TAB_OF_CONTROL).sort()).toEqual(["so-character-life", "so-living-scene-tests"]);
    Object.keys(DRAWER_TAB_OF_CONTROL).forEach((control) => expect(whereOf(`#${control}`).workspace?.page).toBe("author"));
  });

  test("the transition note routes to the library, where its row renders", () => {
    expect(whereOf("#so-announce-transitions").workspace?.page).toBe("library");
  });

  test("getting started waits on unknown host facts only when they decide it", () => {
    const optionalLeft = settingsWith((settings) => { memoryReady(settings); settings.judge.enabled = true; settings.image.enabled = false; });
    expect(showMeRenders(whereOf("#so-getting-started"), context(null, { settings: optionalLeft }))).toBe(true);
    const unknownOnly = settingsWith((settings) => { memoryReady(settings); settings.judge.enabled = true; settings.image.enabled = true; settings.image.backend = "comfy"; settings.image.comfyUrl = "u"; });
    expect(showMeRenders(whereOf("#so-getting-started"), context(null, { settings: unknownOnly }))).toBe(false);
    expect(showMeRenders(whereOf("#so-getting-started"), context(null, { settings: unknownOnly, host: host({ judgeConfigured: false }) }))).toBe(true);
    expect(showMeRenders(whereOf("#so-getting-started"), context(null, { settings: unknownOnly, host: host({ judgeConfigured: true }) }))).toBe(false);
  });

  test("no story keeps story pages out before the render check", () => {
    expect(helpWhere(whereOf("#so-open-journal"), false)).toBeNull();
  });
});
