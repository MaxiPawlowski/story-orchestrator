export const HARNESS_IDS = ["claude", "codex", "opencode"] as const;

export type HarnessId = typeof HARNESS_IDS[number];

export const isHarnessId = (value: unknown): value is HarnessId => HARNESS_IDS.includes(value as HarnessId);

export const HARNESS_KEY_PREFIX = "harness:";

export const harnessKey = (harness: HarnessId, model: string): string => `${HARNESS_KEY_PREFIX}${harness}:${model}`;

export const isHarnessKey = (key: string | null | undefined): key is string => typeof key === "string" && key.startsWith(HARNESS_KEY_PREFIX);

export const parseHarnessKey = (key: string): { harness: HarnessId; model: string } | null => {
  const [prefix, harness, ...model] = key.split(":");
  return prefix === "harness" && isHarnessId(harness) && model.length ? { harness, model: model.join(":") } : null;
};
