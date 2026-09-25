export type SamplerApi = "textgen" | "chat";

export type SamplerValues = Record<string, number>;

const REPETITION = ["repetition_penalty", "rep_pen", "repeat_penalty"];
const REPETITION_RANGE = ["rep_pen_range", "repetition_penalty_range", "repeat_last_n"];

const SHARED: Record<string, string[]> = {
  temperature: ["temperature"],
  top_p: ["top_p"],
  top_k: ["top_k"],
  min_p: ["min_p"],
  top_a: ["top_a"],
  frequency_penalty: ["frequency_penalty"],
  presence_penalty: ["presence_penalty"],
  repetition_penalty: REPETITION,
};

const TEXTGEN_KEYS: Record<string, string[]> = {
  ...SHARED,
  temp: ["temperature"],
  typical_p: ["typical_p", "typical"],
  tfs: ["tfs"],
  rep_pen: REPETITION,
  rep_pen_range: REPETITION_RANGE,
  freq_pen: ["frequency_penalty"],
  presence_pen: ["presence_penalty"],
  xtc_threshold: ["xtc_threshold"],
  xtc_probability: ["xtc_probability"],
  dry_multiplier: ["dry_multiplier"],
  dry_base: ["dry_base"],
  dry_allowed_length: ["dry_allowed_length"],
  smoothing_factor: ["smoothing_factor"],
  smoothing_curve: ["smoothing_curve"],
};

const CHAT_KEYS: Record<string, string[]> = {
  ...SHARED,
  repetition_penalty: ["repetition_penalty"],
  temp_openai: ["temperature"],
  temp: ["temperature"],
  top_p_openai: ["top_p"],
  top_k_openai: ["top_k"],
  min_p_openai: ["min_p"],
  top_a_openai: ["top_a"],
  freq_pen_openai: ["frequency_penalty"],
  pres_pen_openai: ["presence_penalty"],
  repetition_penalty_openai: ["repetition_penalty"],
};

export const SAMPLER_OVERLAY_NEVER: ReadonlySet<string> = new Set(["messages", "prompt", "stop", "stopping_strings", "model", "chat_completion_source", "type", "stream", "max_tokens", "max_new_tokens", "api_type", "api_server"]);

export function resolveSamplerOverlay(settings: Record<string, unknown>, api: SamplerApi): { values: SamplerValues; unknown: string[] } {
  const table = api === "textgen" ? TEXTGEN_KEYS : CHAT_KEYS;
  const values: SamplerValues = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    const targets = table[key];
    if (!targets || typeof value !== "number" || !Number.isFinite(value)) {
      unknown.push(key);
      continue;
    }
    targets.forEach((target) => { values[target] = value; });
  }
  return { values, unknown };
}

export function applySamplerOverlay(payload: Record<string, unknown>, values: SamplerValues): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (SAMPLER_OVERLAY_NEVER.has(key)) continue;
    if (payload[key] === undefined) {
      skipped.push(key);
      continue;
    }
    payload[key] = value;
    applied.push(key);
  }
  return { applied, skipped };
}
