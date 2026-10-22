import type { StoryFeatureId } from "@engine/featurePolicy";
import type { Feature } from "@features/registry";
import { FEATURE_STATE, type FeatureStateRow } from "@features/featureState";
import type { FeatureSource, ResolvedFeature } from "./featureResolve";
import { FEATURE_WORDS, featureStatus, offWord, waitingCount, type FeatureStatusSnapshot } from "./featureStatus";
import { CHECKS } from "./checks";
import { setupFindings, type RepairStep } from "./repair";
import type { GlobalSettings } from "./settingsModel";
import type { RuntimeSnapshot } from "./types";

export const MODE_WORDS: Readonly<Record<string, string>> = { auto: "Applies automatically", review: "Review before applying" };

export const HELP_STATE_WORDS = {
  needsStory: "Needs a story",
  inStory: "In this story",
  notInStory: "Not in this story",
  defaults: "Default for new stories",
  on: "On",
  off: "Off",
} as const;

export interface HelpStatePart {
  label?: string;
  word: string;
  source?: FeatureSource;
  on: boolean;
  setup?: string;
}

export interface HelpRowState {
  parts: HelpStatePart[];
  defaults: boolean;
}

export type HelpStateSnapshot = FeatureStatusSnapshot & Pick<RuntimeSnapshot, "storyDeclares">;

const asDefault = (word: string): string => `${HELP_STATE_WORDS.defaults}: ${word.charAt(0).toLowerCase()}${word.slice(1)}`;

const masterPart = (snapshot: HelpStateSnapshot, id: StoryFeatureId, resolved: ResolvedFeature, label?: string): HelpStatePart => {
  const view = featureStatus(resolved, snapshot, id, false, waitingCount(snapshot, id));
  const named = label ? { label } : {};
  if (!snapshot.ready) return { ...named, word: resolved.enabled ? asDefault(resolved.automatic ? view.short : HELP_STATE_WORDS.on) : view.short, source: view.source, on: resolved.enabled };
  return { ...named, word: view.short, source: view.source, on: resolved.enabled, ...(view.setup === "ready" ? {} : { setup: view.word }) };
};

const controlPart = (snapshot: HelpStateSnapshot, id: StoryFeatureId, resolved: ResolvedFeature, field: string, words: (value: unknown) => string | null): HelpStatePart => {
  const master = masterPart(snapshot, id, resolved);
  if (!resolved.enabled) return master;
  const control = resolved.controls[field];
  const word = words(control.value);
  if (word === null) return { word: offWord(control.source), source: control.source, on: false };
  return { word: snapshot.ready ? word : asDefault(word), source: control.source, on: true, ...(master.setup ? { setup: master.setup } : {}) };
};

const rowState = (row: FeatureStateRow, snapshot: HelpStateSnapshot): HelpStatePart[] | null => {
  const features = snapshot.features;
  if (row.kind === "authored") {
    if (!snapshot.ready) return [{ word: HELP_STATE_WORDS.needsStory, on: false }];
    const declared = snapshot.storyDeclares?.[row.declares] === true;
    return [{ word: declared ? HELP_STATE_WORDS.inStory : HELP_STATE_WORDS.notInStory, source: "story", on: declared }];
  }
  if (!features) return null;
  if (row.kind === "master") return [masterPart(snapshot, row.feature, features[row.feature])];
  if (row.kind === "parts") return row.parts.map((part) => masterPart(snapshot, part.feature, features[part.feature], part.label));
  if (row.kind === "control") return [controlPart(snapshot, row.feature, features[row.feature], row.control, (value) => (value === true ? FEATURE_WORDS.enabled : null))];
  return [controlPart(snapshot, row.feature, features[row.feature], row.control, (value) => (value === "off" ? null : MODE_WORDS[String(value)] ?? String(value)))];
};

export const helpFeatureState = (feature: Feature, snapshot: HelpStateSnapshot | null, settings: GlobalSettings): HelpRowState | null => {
  const row = FEATURE_STATE[feature.id];
  if (row) {
    const parts = snapshot ? rowState(row, snapshot) : null;
    return parts ? { parts, defaults: !snapshot?.ready } : null;
  }
  if (!feature.isOn) return null;
  const on = feature.isOn(settings);
  return { parts: [{ word: on ? HELP_STATE_WORDS.on : HELP_STATE_WORDS.off, source: "install", on }], defaults: false };
};

export const findingsByFeature = (snapshot: RuntimeSnapshot): Map<string, RepairStep[]> => {
  const featureOf = new Map(CHECKS.flatMap((check) => (check.feature ? [[check.id, check.feature] as const] : [])));
  const findings = setupFindings(snapshot);
  const result = new Map<string, RepairStep[]>();
  for (const step of [...findings.blocks, ...findings.degrades, ...findings.info]) {
    const feature = featureOf.get(step.check);
    if (feature) result.set(feature, [...(result.get(feature) ?? []), step]);
  }
  return result;
};
