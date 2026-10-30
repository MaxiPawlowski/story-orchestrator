import { STORY_FEATURE_IDS } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import { DEVICE_SETTING_PATHS } from "@runtime/deviceSettings";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import { FEATURE_INSTALL_HOMES, settingIntent, WORKSPACE_PAGES, workspaceCrumb } from "@runtime/workspaceRoutes";
import { deviceControlId } from "@runtime/deviceSettings";
import { AUTHOR_JUDGE_USES, BUILT_JUDGE_USES } from "@judge/settings";
import { JUDGE_USE_COPY } from "@judge/useCopy";
import { judgeUseControlId } from "@judge/useRows";
import { SETTING_COPY, type SettingCopy } from "./settingsCopy";

export interface SettingsSearchEntry {
  id: string;
  label: string;
  description: string;
  crumb: string;
  intent: WorkspaceIntent;
  text: string;
}

export const SETTING_CONTROLS: Record<string, string> = {
  "copilot.ask": "so-copilot-ask",
  "copilot.enabled": "so-copilot-enabled",
  "display.announceTransitions": "so-announce-transitions",
  "display.briefing": "so-briefing-enabled",
  "display.briefingDraft": "so-briefing-draft",
  "display.hudEnabled": "so-hud-enabled",
  "display.inline.level": "so-inline-level",
  "display.inline.window": "so-inline-window",
  "display.inline.categories": "so-inline-categories",
  "display.playerSetup": "so-player-setup-enabled",
  "display.yourMove": "so-your-move-enabled",
  "extraction.fallbackProfileId": "so-extraction-fallback",
  "extraction.profileId": "so-extraction-profile",
  "extraction.profiles": "so-role-profiles",
  "image.automaticRoute": "so-image-automatic-route",
  "image.automation.everyN": "so-image-every-n",
  "image.automation.mode": "so-image-mode",
  "image.backend": "so-image-backend",
  "image.comfyUrl": "so-image-comfy-url",
  "image.directorProfileId": "so-image-profile",
  "image.enabled": "so-image-enabled",
  "image.safeMode": "so-image-safe-mode",
  "judge.enabled": "so-judge-enabled",
  "judge.expansion.pick": "so-judge-expansion-pick",
  "judge.expansion.variants": "so-judge-expansion-variants",
  "memory.chapters.chronicleTokens": "so-chapter-budget",
  "memory.epistemicLedgerCapable": "so-epistemic-capable",
  "sprites.blink": "so-sprite-blink",
  "sprites.breathing": "so-sprite-breathing",
  "sprites.enabled": "so-sprite-enabled",
  "sprites.focus": "so-sprite-focus",
  "sprites.liveHead": "so-live-head-enabled",
  "sprites.liveHeadFrames": "so-live-head-frames",
  "sprites.mouth": "so-sprite-mouth",
  "sprites.onDemand": "so-sprite-on-demand",
  "sprites.poses": "so-sprite-poses",
  "sprites.profileId": "so-sprite-profile",
  "sprites.stage": "so-sprite-stage",
  "talk.keepLastQuestion": "so-keep-last-question",
  "worldInfo.gatingMode": "so-wi-gating-mode",
  "worldInfo.lorePins": "so-wi-lore-pins",
  "memory.historyNotes": "so-history-notes",
  "memory.outwardNarration": "so-outward-narration",
  "talk.swipeContrast": "so-swipe-contrast",
};

const AUTHOR_SETTINGS: ReadonlySet<string> = new Set(["worldInfo.lorePins", "memory.historyNotes", "memory.outwardNarration", "talk.swipeContrast"]);

const firstSentence = (text: string): string => /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
const copyOf = (key: string): SettingCopy | undefined => (SETTING_COPY as Record<string, SettingCopy>)[key];

const entry = (id: string, label: string, description: string, intent: WorkspaceIntent, leaf = label): SettingsSearchEntry => {
  const crumb = workspaceCrumb(intent, leaf);
  return { id, label, description, crumb, intent, text: `${label} ${description} ${crumb}`.toLowerCase() };
};

export const buildSettingsIndex = (authorView: boolean): SettingsSearchEntry[] => {
  const pages = WORKSPACE_PAGES.orchestrator.map((page) =>
    entry(`page:${page.id}`, page.label, page.description ?? "", { context: "orchestrator", page: page.id }, page.label));
  const listed = STORY_FEATURE_IDS.filter((feature) => !FEATURE_INSTALL_HOMES[feature]);
  const featurePaths = new Set(listed.flatMap((feature) => FEATURE_CONTROLS[feature].controls.map((control) => control.path)));
  const features = listed.flatMap((feature) => {
    const config = FEATURE_CONTROLS[feature];
    return config.controls.map((control) => {
      const copy = copyOf(control.path);
      const label = control.field === "enabled" ? config.name : `${config.name}: ${control.label}`;
      const intent: WorkspaceIntent = { context: "orchestrator", page: "features", feature, control: `so-feature-${feature}-${control.field}` };
      return entry(`feature:${feature}.${control.field}`, label, control.field === "enabled" ? config.description : firstSentence(copy?.help ?? config.description),
        intent, control.field === "enabled" ? config.name : `${config.name} › ${control.label}`);
    });
  });
  const settings = Object.entries(SETTING_CONTROLS).filter(([key]) => !featurePaths.has(key) && (authorView || !AUTHOR_SETTINGS.has(key))).flatMap(([key, control]) => {
    const copy = copyOf(key);
    return copy ? [entry(`setting:${key}`, copy.label, firstSentence(copy.help), settingIntent(control))] : [];
  });
  const judge = BUILT_JUDGE_USES.filter((use) => authorView || !AUTHOR_JUDGE_USES.includes(use)).map((use) =>
    entry(`judge:${use}`, JUDGE_USE_COPY[use].label, firstSentence(JUDGE_USE_COPY[use].description), { context: "orchestrator", page: "judge", control: judgeUseControlId(use) }));
  const device = DEVICE_SETTING_PATHS.flatMap((path) => {
    const copy = copyOf(path);
    const control = deviceControlId(path);
    return copy ? [entry(`device:${path}`, `${copy.label} on this device`, "Use a different value in this browser only.", settingIntent(control))] : [];
  });
  return [...pages, ...features, ...settings, ...judge, ...device];
};

export const searchSettings = (index: readonly SettingsSearchEntry[], query: string, limit = 12): SettingsSearchEntry[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index.filter((item) => words.every((word) => item.text.includes(word)))
    .map((item) => ({ item, score: words.reduce((sum, word) => sum + (item.label.toLowerCase().includes(word) ? 2 : 0), 0) }))
    .sort((left, right) => right.score - left.score).slice(0, limit).map(({ item }) => item);
};
