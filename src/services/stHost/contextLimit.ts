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

export const CHAT_SOURCE_CONTEXT: Record<string, number> = {
  deepseek: 131072,
};

export function contextLimitFromSource(source: string | undefined): ContextLimit | null {
  const value = source ? CHAT_SOURCE_CONTEXT[source] : undefined;
  return value ? { value, source: "source", reason: `known for ${source}; the profile names no settings preset` } : null;
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
    if (!presetName) return (selected === "openai" ? contextLimitFromSource(apiMap?.source ?? undefined) : null) ?? defaultContextLimit("the profile names no settings preset");
    if (!selected || !PRESET_CONTEXT_KEY[selected]) return contextLimitFromPreset(selected, presetName, undefined);
    const presets = typeof context.getPresetManager === "function" ? context.getPresetManager(selected) : null;
    if (!presets || typeof presets.getCompletionPresetByName !== "function") return defaultContextLimit(`no preset manager for ${selected}`);
    return contextLimitFromPreset(selected, presetName, presets.getCompletionPresetByName(presetName));
  } catch (error) {
    log.warn("the memory model's preset could not be read", error);
    return defaultContextLimit("the preset could not be read");
  }
}
