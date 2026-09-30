export const HARNESS_IDS = ["claude", "codex", "opencode"] as const;

export type HarnessId = typeof HARNESS_IDS[number];

export const HARNESS_LABELS: Record<HarnessId, string> = { claude: "Claude Code", codex: "Codex", opencode: "opencode" };

export const isHarnessId = (value: unknown): value is HarnessId => HARNESS_IDS.includes(value as HarnessId);

export const HARNESS_KEY_PREFIX = "harness:";

export const harnessKey = (harness: HarnessId, model: string): string => `${HARNESS_KEY_PREFIX}${harness}:${model}`;

export const isHarnessKey = (key: string | null | undefined): key is string => typeof key === "string" && key.startsWith(HARNESS_KEY_PREFIX);

export const parseHarnessKey = (key: string): { harness: HarnessId; model: string } | null => {
  const [, harness, ...model] = key.split(":");
  return isHarnessKey(key) && isHarnessId(harness) && model.length ? { harness, model: model.join(":") } : null;
};

export const harnessVendor = (harness: HarnessId, model: string): string => {
  if (harness === "claude") return "Anthropic";
  if (harness === "codex") return "OpenAI";
  const provider = model.split("/")[0];
  return provider === "openai" ? "OpenAI" : provider || "the model's provider";
};
