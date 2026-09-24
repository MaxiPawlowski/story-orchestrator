import { defaultContextLimit, usableContextLimit, type ContextLimit } from "@extraction/inputBudget";
import { getContext } from "./context";
import type { HostConnectApiMap } from "./hostTypes";

const PRESET_CONTEXT_KEY: Record<string, string> = {
  textgenerationwebui: "max_length",
  openai: "openai_max_context",
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function contextLimitFromPreset(selectedApi: string | undefined, presetName: string, preset: unknown): ContextLimit {
  const key = selectedApi ? PRESET_CONTEXT_KEY[selectedApi] : undefined;
  if (!key) return defaultContextLimit(`the profile's API (${selectedApi || "none"}) has no preset context size`);
  if (!isRecord(preset)) return defaultContextLimit(`the preset "${presetName}" could not be read`);
  const value = usableContextLimit(preset[key]);
  if (value === null) return defaultContextLimit(`the preset "${presetName}" has no usable ${key}`);
  return { value, source: "preset" };
}

export function readProfileContextLimit(profileId: string | null | undefined): ContextLimit {
  try {
    if (!profileId) return defaultContextLimit("no memory model profile is selected");
    const context = getContext();
    const settings = context.extensionSettings as Record<string, unknown>;
    const disabled = Array.isArray(settings.disabledExtensions) ? settings.disabledExtensions : [];
    if (disabled.includes("connection-manager")) return defaultContextLimit("Connection Manager is not available");
    const manager = isRecord(settings.connectionManager) ? settings.connectionManager : {};
    const profiles = Array.isArray(manager.profiles) ? manager.profiles.filter(isRecord) : [];
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) return defaultContextLimit(`the profile ${profileId} no longer exists`);
    const api = typeof profile.api === "string" ? profile.api : "";
    const apiMap: HostConnectApiMap | undefined = api ? context.CONNECT_API_MAP?.[api] : undefined;
    const selected = typeof apiMap?.selected === "string" ? apiMap.selected : undefined;
    const presetName = typeof profile.preset === "string" ? profile.preset.trim() : "";
    if (!presetName) return defaultContextLimit("the profile names no settings preset");
    if (!selected || !PRESET_CONTEXT_KEY[selected]) return contextLimitFromPreset(selected, presetName, undefined);
    const presets = typeof context.getPresetManager === "function" ? context.getPresetManager(selected) : null;
    if (!presets || typeof presets.getCompletionPresetByName !== "function") return defaultContextLimit(`no preset manager for ${selected}`);
    return contextLimitFromPreset(selected, presetName, presets.getCompletionPresetByName(presetName));
  } catch (error) {
    return defaultContextLimit(`the preset could not be read (${error instanceof Error ? error.message : String(error)})`);
  }
}
