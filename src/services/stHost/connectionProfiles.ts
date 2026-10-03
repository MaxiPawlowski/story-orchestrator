import { getContext, parseHostYaml } from "./context";
import { extensionsSharedModule } from "./modules";
import { requestModelReply, type InstructSequences, type ModelReply, type ModelRequestHost, type ModelRequestOptions } from "./modelReply";
import { foldIncludeBody, type ReasoningRoute } from "./reasoningPayload";
import { isRecord } from "@utils/guards";

export interface ConnectionProfileSummary {
  id: string;
  name: string;
  api?: string;
  model?: string;
  kind?: "chat" | "text";
  source?: string;
  apiUrl?: string;
}

const summarize = (profile: Record<string, unknown>, id: string, name: string): ConnectionProfileSummary => {
  const api = typeof profile.api === "string" ? profile.api : undefined;
  const map = api ? getContext().CONNECT_API_MAP?.[api] : undefined;
  const kind = map?.selected === "openai" ? "chat" : map?.selected === "textgenerationwebui" ? "text" : undefined;
  const source = kind === "chat" ? map?.source : kind === "text" ? map?.type : undefined;
  const url = profile["api-url"];
  return {
    id,
    name,
    api,
    model: typeof profile.model === "string" ? profile.model : undefined,
    kind,
    source: typeof source === "string" && source ? source : api,
    apiUrl: typeof url === "string" && url.trim() ? url.trim() : undefined,
  };
};

export function listConnectionProfiles(): ConnectionProfileSummary[] {
  try {
    return extensionsSharedModule.ConnectionManagerRequestService.getSupportedProfiles().map((profile) => summarize(profile, String(profile.id), String(profile.name ?? profile.id)));
  } catch {
    const root = getContext().extensionSettings as Record<string, unknown>;
    const settings = isRecord(root.connectionManager) ? root.connectionManager : {};
    const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
    return profiles.filter(isRecord).map((profile) => summarize(profile, String(profile.id ?? ""), String(profile.name ?? profile.id ?? "")))
      .filter((profile) => profile.id && profile.name);
  }
}

export function getSelectedConnectionProfileId(): string | null {
  const root = getContext().extensionSettings as Record<string, unknown>;
  const settings = isRecord(root.connectionManager) ? root.connectionManager : {};
  const selected = settings.selectedProfile;
  return typeof selected === "string" && selected ? selected : null;
}

export function profileExists(profileId: string): boolean {
  return listConnectionProfiles().some((profile) => profile.id === profileId);
}

interface ProfileRead {
  api?: string;
  instruct?: string;
  preset?: string;
  model?: string;
}

const optionalText = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const readProfile = (profileId: string): ProfileRead | null => {
  const root = getContext().extensionSettings as Record<string, unknown>;
  const settings = isRecord(root.connectionManager) ? root.connectionManager : {};
  const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
  const found = profiles.filter(isRecord).find((profile) => profile.id === profileId);
  if (!found) return null;
  return { api: optionalText(found.api), instruct: optionalText(found.instruct), preset: optionalText(found.preset), model: optionalText(found.model) };
};

const readIncludeBody = (presetName: string | undefined): Record<string, unknown> | null => {
  const context = getContext();
  const preset = presetName ? context.getPresetManager?.("openai")?.getCompletionPresetByName(presetName) : undefined;
  if (!preset) return null;
  const raw = "custom_include_body" in preset ? preset.custom_include_body : context.chatCompletionSettings?.custom_include_body;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return foldIncludeBody(parseHostYaml(context.substituteParams ? context.substituteParams(raw) : raw));
};

const readReasoningRoute = (profileId: string): ReasoningRoute | null => {
  const profile = readProfile(profileId);
  const map = profile?.api ? getContext().CONNECT_API_MAP?.[profile.api] : undefined;
  if (!profile || !map) return null;
  const api = map.selected === "openai" ? "chat" : map.selected === "textgenerationwebui" ? "text" : null;
  const source = typeof map.source === "string" ? map.source : null;
  return { api, source, model: profile.model ?? null, includeBody: api === "chat" && source === "custom" ? readIncludeBody(profile.preset) : null };
};

const readInstructSequences = (name: string | undefined): InstructSequences | null => {
  if (!name) return null;
  const preset = getContext().getPresetManager?.("instruct")?.getCompletionPresetByName(name);
  if (!preset) return null;
  const text = (key: string) => {
    const value = preset[key];
    return typeof value === "string" ? value : undefined;
  };
  return { stop_sequence: text("stop_sequence"), input_sequence: text("input_sequence"), output_sequence: text("output_sequence"), last_output_sequence: text("last_output_sequence") };
};

const modelRequestHost = (): ModelRequestHost => ({
  sendRequest: (profileId, prompt, maxTokens, custom, overridePayload) => extensionsSharedModule.ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, custom, overridePayload),
  profileExists,
  profile: readProfile,
  apiSelected: (api) => (api ? getContext().CONNECT_API_MAP?.[api]?.selected ?? null : null),
  extractMessage: (json, type) => {
    const extract = getContext().extractMessageFromData;
    if (extract) return extract(json, type);
    return typeof json === "string" ? json : "";
  },
  instructSequences: readInstructSequences,
  reasoningRoute: readReasoningRoute,
});

export async function sendConnectionProfileRequest(profileId: string, prompt: string, maxTokens: number, options: ModelRequestOptions = {}): Promise<ModelReply> {
  return requestModelReply(modelRequestHost(), profileId, prompt, maxTokens, options);
}
