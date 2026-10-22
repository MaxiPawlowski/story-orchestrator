import { isRecord } from "@utils/guards";

export interface PolicyField {
  kind: "boolean" | "number" | "choice";
  min?: number;
  max?: number;
  options?: readonly string[];
}

const toggle = { kind: "boolean" } as const;
const count = (min: number, max: number): PolicyField => ({ kind: "number", min, max });
const choice = (...options: string[]): PolicyField => ({ kind: "choice", options });
const approval = choice("review", "auto", "off");

export const FEATURE_POLICY_FIELDS = {
  reading: { enabled: toggle, cadence: count(1, 100), stabilityLag: count(0, 100) },
  memory: { enabled: toggle },
  chapters: { enabled: toggle, recap: toggle, storySoFar: toggle, fold: toggle },
  continuity: { enabled: toggle, acceptMode: approval },
  agency: { enabled: toggle, acceptMode: approval },
  pacing: { enabled: toggle },
  thinking: { enabled: toggle, effort: choice("off", "low", "medium", "high") },
  speakers: { enabled: toggle },
  voices: { enabled: toggle, max: count(1, 6) },
  inner: { enabled: toggle, fanOut: choice("next", "top2"), harvestReasoning: toggle },
  delivery: { enabled: toggle, repetition: toggle },
  promises: { enabled: toggle },
  witness: { enabled: toggle },
  rumors: { enabled: toggle },
  meanwhile: { enabled: toggle, acceptMode: choice("auto", "review") },
  living: { enabled: toggle },
  branching: { enabled: toggle },
  prefetch: { enabled: toggle },
  curator: { enabled: toggle, acceptMode: approval, create: toggle, requireMeasured: toggle },
  memoryLore: { enabled: toggle },
  lateLore: { enabled: toggle, depth: count(0, 20) },
  illustrations: { enabled: toggle, mode: choice("manual", "story", "everyN", "tool"), everyN: count(1, 100) },
  sprites: { enabled: toggle, stage: choice("vn", "always") },
  poses: { enabled: toggle },
  cardState: { enabled: toggle },
} as const satisfies Record<string, Record<string, PolicyField>>;

export type StoryFeatureId = keyof typeof FEATURE_POLICY_FIELDS;
export const STORY_FEATURE_IDS = Object.keys(FEATURE_POLICY_FIELDS) as StoryFeatureId[];
export type FeaturePolicyValue = boolean | number | string;
export type FeatureTuning = { enabled?: boolean } & Record<string, FeaturePolicyValue>;
export type StoryFeatures = Partial<Record<StoryFeatureId, "off" | FeatureTuning>>;

export const validPolicyValue = (field: PolicyField, value: unknown): value is FeaturePolicyValue => {
  if (field.kind === "boolean") return typeof value === "boolean";
  if (field.kind === "number") return typeof value === "number" && Number.isSafeInteger(value) && value >= (field.min ?? 0) && value <= (field.max ?? Infinity);
  return typeof value === "string" && Boolean(field.options?.includes(value));
};

export const readFeaturePolicies = (raw: unknown, issue: (path: string, message: string) => void = () => undefined): StoryFeatures => {
  if (raw === undefined) return {};
  if (!isRecord(raw)) { issue("features", "features must be an object"); return {}; }
  const result: StoryFeatures = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(FEATURE_POLICY_FIELDS, key)) { issue(`features.${key}`, "unknown story feature"); continue; }
    const id = key as StoryFeatureId;
    if (value === "off") { result[id] = "off"; continue; }
    if (!isRecord(value)) { issue(`features.${id}`, "use off or an object of feature controls"); continue; }
    const fields: Record<string, PolicyField> = FEATURE_POLICY_FIELDS[id];
    const tuning: FeatureTuning = {};
    for (const [name, item] of Object.entries(value)) {
      const field = Object.hasOwn(fields, name) ? fields[name] : undefined;
      if (!field || !validPolicyValue(field, item)) issue(`features.${id}.${name}`, "unknown control or invalid feature value");
      else tuning[name] = item;
    }
    if (Object.keys(tuning).length) result[id] = tuning;
  }
  return result;
};
