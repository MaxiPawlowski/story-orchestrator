import { getContext } from "./context";
import { extensionsSharedModule } from "./modules";
import { requestModelReply, type InstructSequences, type ModelReply, type ModelRequestHost, type ModelRequestOptions } from "./modelReply";

export interface ConnectionProfileSummary {
  id: string;
  name: string;
  api?: string;
  model?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function listConnectionProfiles(): ConnectionProfileSummary[] {
  try {
    return extensionsSharedModule.ConnectionManagerRequestService.getSupportedProfiles().map((profile) => ({
      id: String(profile.id),
      name: String(profile.name ?? profile.id),
      api: typeof profile.api === "string" ? profile.api : undefined,
      model: typeof profile.model === "string" ? profile.model : undefined,
    }));
  } catch {
    const root = getContext().extensionSettings as Record<string, unknown>;
    const settings = isRecord(root.connectionManager) ? root.connectionManager : {};
    const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
    return profiles.filter(isRecord).map((profile) => ({
      id: String(profile.id ?? ""),
      name: String(profile.name ?? profile.id ?? ""),
      api: typeof profile.api === "string" ? profile.api : undefined,
      model: typeof profile.model === "string" ? profile.model : undefined,
    })).filter((profile) => profile.id && profile.name);
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

const readProfile = (profileId: string): { api?: string; instruct?: string } | null => {
  const root = getContext().extensionSettings as Record<string, unknown>;
  const settings = isRecord(root.connectionManager) ? root.connectionManager : {};
  const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
  const found = profiles.filter(isRecord).find((profile) => profile.id === profileId);
  if (!found) return null;
  return { api: typeof found.api === "string" ? found.api : undefined, instruct: typeof found.instruct === "string" ? found.instruct : undefined };
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
});

export async function sendConnectionProfileRequest(profileId: string, prompt: string, maxTokens: number, options: ModelRequestOptions = {}): Promise<ModelReply> {
  return requestModelReply(modelRequestHost(), profileId, prompt, maxTokens, options);
}
