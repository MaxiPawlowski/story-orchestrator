import type { StoryFeatureId } from "@engine/featurePolicy";
import { SETTING_COPY, type SettingCopy } from "@features/settingsCopy";

const ACCEPT = { auto: "Apply automatically", review: "Review first", off: "Off" };

export const FEATURE_OPTION_LABELS: Partial<Record<StoryFeatureId, Record<string, Record<string, string>>>> = {
  continuity: { acceptMode: ACCEPT },
  agency: { acceptMode: ACCEPT },
  meanwhile: { acceptMode: ACCEPT },
  curator: { acceptMode: { ...ACCEPT, off: "Preview only" } },
  thinking: { effort: { off: "Off", low: "Low · 128 tokens", medium: "Medium · 400 tokens", high: "High · no cap" } },
  inner: { fanOut: { next: "Next speaker", top2: "Two likely speakers" } },
  polish: { mode: { shadow: "Record only", off: "Off" } },
  illustrations: { mode: { manual: "When asked", story: "Story moments", everyN: "Every few replies", tool: "When the model asks" } },
  sprites: { stage: { vn: "With Visual Novel mode", always: "Always" } },
};

export const optionLabel = (feature: StoryFeatureId, field: string, option: string): string =>
  FEATURE_OPTION_LABELS[feature]?.[field]?.[option] ?? option;

const firstSentence = (text: string): string => {
  const match = /^(.+?[.!?])(\s|$)/.exec(text);
  return match ? match[1] : text;
};

export const settingDescription = (path: string): { text: string; full: string } | null => {
  const copy = (SETTING_COPY as Record<string, SettingCopy>)[path];
  return copy ? { text: firstSentence(copy.help), full: copy.help } : null;
};
