import { defaultContextLimit, usableContextLimit, type ContextLimit } from "@extraction/inputBudget";
import { getContext } from "./context";
import type { HostConnectApiMap } from "./hostTypes";
import { isRecord } from "@utils/guards";
import { log } from "@utils/log";

const PRESET_CONTEXT_KEY: Record<string, string> = {
  textgenerationwebui: "max_length",
  openai: "openai_max_context",
};

export function contextLimitFromPreset(selectedApi: string | undefined, presetName: string, preset: unknown): ContextLimit {
  const key = selectedApi ? PRESET_CONTEXT_KEY[selectedApi] : undefined;
  if (!key) return defaultContextLimit(`the profile's API (${selectedApi || "none"}) has no preset context size`);
  if (!isRecord(preset)) return defaultContextLimit(`the preset "${presetName}" could not be read`);
  const value = usableContextLimit(preset[key]);
  if (value === null) return defaultContextLimit(`the preset "${presetName}" has no usable ${key}`);
  return { value, source: "preset" };
}

export interface ContextRow {
  source: string;
  model?: RegExp;
  value: number;
}

const OPENAI_MODELS: Array<[RegExp, number]> = [
  [/^gpt-6-astra/, 1050000],
  [/^gpt-5\.6/, 1050000],
  [/^gpt-5\.[45]/, 1000000],
  [/^gpt-5/, 400000],
  [/gpt-4\.1/, 1000000],
  [/gpt-audio/, 128000],
  [/^o1/, 128000],
  [/^o[34]/, 200000],
  [/chatgpt-4o-latest|gpt-4-turbo|gpt-4o|gpt-4-1106|gpt-4-0125|gpt-4-vision/, 128000],
  [/gpt-3\.5-turbo-1106/, 16383],
  [/^(gpt-4|gpt-4-0314|gpt-4-0613)$/, 8191],
  [/^(gpt-4-32k|gpt-4-32k-0314|gpt-4-32k-0613)$/, 32767],
  [/gpt-realtime/, 32767],
  [/^(gpt-3\.5-turbo-16k|gpt-3\.5-turbo-16k-0613)$/, 16383],
  [/gpt-3/, 4095],
];

const GEMINI_MODELS: Array<[RegExp, number]> = [
  [/gemini-2\.5-flash-image/, 32767],
  [/gemini-3\.1-flash-image/, 128000],
  [/gemini-3-pro-image/, 65535],
  [/gemini-(?:3[.\d]*|2\.(?:5|0))-(pro|flash)/, 1000000],
  [/(gemini-exp|learnlm-2\.0-flash|gemini-robotics)/, 1000000],
  [/gemma-3-27b-it/, 128000],
  [/gemma-3n-e4b-it/, 8191],
  [/gemma-3/, 32767],
  [/gemma-4/, 256000],
];

const XAI_MODELS: Array<[RegExp, number]> = [
  [/grok-2-vision/, 32767],
  [/grok-4-fast/, 2000000],
  [/grok-4/, 256000],
  [/grok-code/, 256000],
];

const modelRows = (sources: string[], models: Array<[RegExp, number]>): ContextRow[] =>
  sources.flatMap((source) => models.map(([model, value]) => ({ source, model, value })));

export const CONTEXT_TABLE: readonly ContextRow[] = [
  { source: "deepseek", value: 131072 },
  { source: "claude", value: 200000 },
  ...modelRows(["openai", "azure_openai"], OPENAI_MODELS),
  { source: "openai", value: 128000 },
  { source: "azure_openai", value: 128000 },
  ...modelRows(["makersuite", "vertexai"], GEMINI_MODELS),
  { source: "makersuite", value: 128000 },
  { source: "vertexai", value: 128000 },
  ...modelRows(["xai"], XAI_MODELS),
  { source: "xai", value: 128000 },
];

export function contextLimitFromTable(source: string | undefined, model: string | undefined, why = "the profile names no settings preset"): ContextLimit | null {
  if (!source) return null;
  const rows = CONTEXT_TABLE.filter((row) => row.source === source);
  const byModel = model ? rows.find((row) => row.model?.test(model)) : undefined;
  if (byModel) return { value: byModel.value, source: "source", reason: `known for ${model} on ${source}; ${why}` };
  const bySource = rows.find((row) => !row.model);
  return bySource ? { value: bySource.value, source: "source", reason: `known for ${source}; ${why}` } : null;
}

const findProfile = (profileId: string): Record<string, unknown> | "unavailable" | null => {
  const settings = getContext().extensionSettings as Record<string, unknown>;
  const disabled = Array.isArray(settings.disabledExtensions) ? settings.disabledExtensions : [];
  if (disabled.includes("connection-manager")) return "unavailable";
  const manager = isRecord(settings.connectionManager) ? settings.connectionManager : {};
  const profiles = Array.isArray(manager.profiles) ? manager.profiles.filter(isRecord) : [];
  return profiles.find((entry) => entry.id === profileId) ?? null;
};

export function readProfilePresetName(profileId: string | null | undefined): string | null {
  try {
    const profile = profileId ? findProfile(profileId) : null;
    return isRecord(profile) && typeof profile.preset === "string" ? profile.preset.trim() : null;
  } catch {
    return null;
  }
}

const chatPreset = (presetName: string, read: () => ContextLimit, table: (why: string) => ContextLimit | null): ContextLimit => {
  const limit = read();
  if (limit.source !== "default") return limit;
  return table(limit.reason ?? `the preset "${presetName}" gave no context size`) ?? limit;
};

export function readProfileContextLimit(profileId: string | null | undefined): ContextLimit {
  try {
    if (!profileId) return defaultContextLimit("no memory model profile is selected");
    const context = getContext();
    const profile = findProfile(profileId);
    if (profile === "unavailable") return defaultContextLimit("Connection Manager is not available");
    if (!profile) return defaultContextLimit(`the profile ${profileId} no longer exists`);
    const api = typeof profile.api === "string" ? profile.api : "";
    const apiMap: HostConnectApiMap | undefined = api ? context.CONNECT_API_MAP?.[api] : undefined;
    const selected = typeof apiMap?.selected === "string" ? apiMap.selected : undefined;
    const presetName = typeof profile.preset === "string" ? profile.preset.trim() : "";
    const chat = selected === "openai";
    const model = typeof profile.model === "string" && profile.model.trim() ? profile.model.trim() : undefined;
    const table = (why: string) => (chat ? contextLimitFromTable(apiMap?.source ?? undefined, model, why) : null);
    if (!presetName) return table("the profile names no settings preset") ?? defaultContextLimit("the profile names no settings preset");
    if (!selected || !PRESET_CONTEXT_KEY[selected]) return contextLimitFromPreset(selected, presetName, undefined);
    const presets = typeof context.getPresetManager === "function" ? context.getPresetManager(selected) : null;
    if (!presets || typeof presets.getCompletionPresetByName !== "function") return table(`no preset manager for ${selected}`) ?? defaultContextLimit(`no preset manager for ${selected}`);
    const read = () => contextLimitFromPreset(selected, presetName, presets.getCompletionPresetByName(presetName));
    return chat ? chatPreset(presetName, read, table) : read();
  } catch (error) {
    log.warn("the memory model's preset could not be read", error);
    return defaultContextLimit("the preset could not be read");
  }
}
