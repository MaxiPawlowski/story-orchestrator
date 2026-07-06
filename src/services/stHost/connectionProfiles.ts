import { getContext } from "./context";
import { extensionsSharedModule } from "./modules";

export interface ConnectionProfileSummary {
  id: string;
  name: string;
  api?: string;
  model?: string;
}

type ExtractedResponse = { content?: unknown; text?: unknown; reasoning?: unknown };

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

export async function sendConnectionProfileRequest(profileId: string, prompt: string, maxTokens: number, overridePayload?: Record<string, unknown>): Promise<string> {
  const response = await extensionsSharedModule.ConnectionManagerRequestService.sendRequest(
    profileId,
    [{ role: "user", content: prompt }],
    maxTokens,
    { extractData: true, includePreset: true, includeInstruct: true, stream: false },
    overridePayload ?? {},
  ) as ExtractedResponse | string;
  if (typeof response === "string") return response;
  if (typeof response?.content === "string") return response.content;
  if (typeof response?.text === "string") return response.text;
  return "";
}
