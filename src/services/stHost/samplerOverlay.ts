import type { SamplerApi } from "@utils/samplerKeys";
import { getContext } from "./context";
import { subscribeToHostEvent } from "./events";
import { isRecord } from "@utils/guards";

const PRESET_API: Record<SamplerApi, string> = { textgen: "textgenerationwebui", chat: "openai" };

export const samplerApi = (): SamplerApi | null => {
  const api = String(getContext().mainApi ?? "").trim().toLowerCase();
  if (api === "textgenerationwebui") return "textgen";
  if (api === "openai") return "chat";
  return null;
};

export function readSamplerPreset(name: string, api: SamplerApi): Record<string, unknown> | null {
  const manager = getContext().getPresetManager?.(PRESET_API[api]);
  if (!manager) return null;
  const list = typeof manager.getPresetList === "function" ? (manager.getPresetList as () => { preset_names?: unknown })() : null;
  const names = list?.preset_names;
  const listed = Array.isArray(names) ? names.includes(name) : isRecord(names) ? Object.prototype.hasOwnProperty.call(names, name) : false;
  if (!listed) return null;
  const preset = manager.getCompletionPresetByName(name);
  return isRecord(preset) ? preset : null;
}

export interface SamplerPayloadHandlers {
  textgen: (payload: Record<string, unknown>, dryRun: boolean) => void;
  chat: (payload: Record<string, unknown>) => void;
}

export function observeSamplerPayloads(handlers: SamplerPayloadHandlers): () => void {
  const offTextgen = subscribeToHostEvent("GENERATE_AFTER_DATA", (payload, dryRun) => {
    if (isRecord(payload)) handlers.textgen(payload, dryRun === true);
  });
  const offChat = subscribeToHostEvent("CHAT_COMPLETION_SETTINGS_READY", (payload) => {
    if (isRecord(payload)) handlers.chat(payload);
  });
  return () => {
    offTextgen();
    offChat();
  };
}
