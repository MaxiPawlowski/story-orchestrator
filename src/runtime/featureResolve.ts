import { FEATURE_POLICY_FIELDS, STORY_FEATURE_IDS, readFeaturePolicies, type FeaturePolicyValue, type StoryFeatureId, type StoryFeatures } from "@engine/featurePolicy";
import type { Story } from "@engine/schema";
import { isRecord } from "@utils/guards";
import { DEFAULT_CHAPTER_SETTINGS } from "./chapters";
import { DEFAULT_REPLY_EFFORT } from "@utils/reasoningEffort";
import type { GlobalSettings } from "./settingsModel";
import { FEATURE_CONTROLS } from "./featureControls";

export type FeatureSource = "install" | "story" | "chat" | "device";
export interface ResolvedControl {
  value: FeaturePolicyValue;
  source: FeatureSource;
}
export interface ResolvedFeature {
  enabled: boolean;
  source: FeatureSource;
  declined: boolean;
  masterOff: boolean;
  reenabled: boolean;
  automatic?: boolean;
  controls: Record<string, ResolvedControl>;
}

export const AUTOMATIC_STAGE = "Automatic: on when the story directs the stage";

export type ResolvedFeatures = Record<StoryFeatureId, ResolvedFeature>;

export const readSettingPath = (root: unknown, path: string): unknown => path.split(".").reduce<unknown>((value, part) => isRecord(value) ? value[part] : undefined, root);

export const writeSettingPath = (root: object, path: string, value: unknown): void => {
  const parts = path.split(".");
  let target = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const child = target[part];
    target[part] = isRecord(child) ? { ...child } : {};
    target = target[part] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = value;
};

const defaultValue = (global: GlobalSettings, id: StoryFeatureId, field: string, path: string): FeaturePolicyValue => {
  const value = readSettingPath(global, path);
  if (id === "thinking" && field === "effort" && value === undefined) return DEFAULT_REPLY_EFFORT;
  if (id === "sprites" && field === "enabled" && !global.sprites.explicit) return true;
  if (id === "inner" && field === "fanOut") return value === "top2" ? "top2" : "next";
  if (path.startsWith("memory.chapters.")) return (value ?? readSettingPath(DEFAULT_CHAPTER_SETTINGS, path.replace("memory.chapters.", ""))) as FeaturePolicyValue;
  if (field === "enabled" && value === undefined) return true;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  const spec = (FEATURE_POLICY_FIELDS[id] as Record<string, { kind: string; options?: readonly string[]; min?: number }>)[field];
  return spec.kind === "boolean" ? true : spec.kind === "number" ? spec.min ?? 0 : spec.options?.[0] ?? "";
};

export const resolveFeatures = (global: GlobalSettings, story: Pick<Story, "features" | "reasoning" | "polish"> | null, rawOverrides: StoryFeatures = {}): ResolvedFeatures => {
  const authored = readFeaturePolicies(story?.features);
  const overrides = readFeaturePolicies(rawOverrides);
  return Object.fromEntries(STORY_FEATURE_IDS.map((id) => {
    const policy = authored[id];
    const chat = overrides[id];
    const master = FEATURE_CONTROLS[id].controls[0];
    const masterOff = id === "sprites" ? global.sprites.explicit && !global.sprites.enabled : defaultValue(global, id, "enabled", master.path) === false;
    const declined = policy === "off" || policy?.enabled === false;
    const controls: Record<string, ResolvedControl> = {};
    for (const control of FEATURE_CONTROLS[id].controls) {
      const value = defaultValue(global, id, control.field, control.path);
      const authoredValue = policy && policy !== "off" ? policy[control.field] : undefined;
      const storyValue = authoredValue ?? (id === "thinking" && control.field === "effort" ? story?.reasoning : id === "polish" && control.field === "mode" ? story?.polish?.mode : undefined);
      const chatValue = chat && chat !== "off" ? chat[control.field] : undefined;
      controls[control.field] = chatValue !== undefined ? { value: chatValue, source: "chat" }
        : storyValue !== undefined ? { value: storyValue, source: "story" } : { value, source: "install" };
    }
    if (declined && !(chat && chat !== "off" && chat.enabled === true)) controls.enabled = { value: false, source: "story" };
    if (chat === "off") controls.enabled = { value: false, source: "chat" };
    if (masterOff) controls.enabled = { value: false, source: "install" };
    const enabled = controls.enabled.value === true;
    const automatic = id === "sprites" ? { automatic: enabled && controls.enabled.source === "install" && !global.sprites.explicit } : {};
    return [id, { enabled, source: controls.enabled.source, declined, masterOff, reenabled: declined && enabled, ...automatic, controls }];
  })) as ResolvedFeatures;
};

export const featureSettings = (global: GlobalSettings, features: ResolvedFeatures): GlobalSettings => {
  const result = { ...global };
  for (const id of STORY_FEATURE_IDS) {
    const feature = features[id];
    for (const control of FEATURE_CONTROLS[id].controls) {
      let value = feature.controls[control.field].value;
      if (id === "inner" && control.field === "fanOut") value = value === "top2" ? "top2" : "next";
      writeSettingPath(result, control.path, value);
    }
    if (!feature.enabled) {
      if (id === "agency") writeSettingPath(result, "stagecraft.agencyAcceptMode", "off");
      if (id === "meanwhile") writeSettingPath(result, "stagecraft.meanwhileAcceptMode", "off");
      if (id === "inner") writeSettingPath(result, "memory.harvestReasoning", false);
      if (id === "chapters") for (const field of ["seal", "storySoFar", "fold"]) writeSettingPath(result, `memory.chapters.${field}`, false);
    }
  }
  if (!features.branching.enabled) writeSettingPath(result, "stagecraft.prefetchEnabled", false);
  if (!features.sprites.enabled || features.sprites.source !== "install") writeSettingPath(result, "sprites.explicit", true);
  return result;
};
