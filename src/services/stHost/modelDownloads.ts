import { getContext } from "./context";
import { importSTModule } from "./modules";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

const ROOT = "/api/plugins/story-orchestrator-media/models";

export const MODEL_PROVIDERS = ["civitai", "huggingface"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
export const PROVIDER_SECRET_KEYS: Record<ModelProvider, string> = { civitai: "so_civitai_token", huggingface: "api_key_huggingface" };

export type ModelRef = { versionId: number; fileId?: number } | { repo: string; file: string; revision?: string };

export interface DownloadCard {
  id: string; provider: ModelProvider; name: string; sha256: string; sizeBytes: number | null; kind: string; baseModel: string | null; nsfw: boolean;
  termsUrl: string; source: string; root: string; folders: string[]; present: boolean; freeBytes: number; marginBytes: number; fits: boolean;
  resumeFromBytes: number; warning?: string;
}
export interface DownloadJob { id: string; planId: string; name: string; root: string; state: string; bytes: number; total: number | null; error: string | null }

interface SecretsHostModule { writeSecret(key: string, value: string, label?: string): Promise<string | null> }

const headers = (): Record<string, string> => ({ ...(getContext().getRequestHeaders?.() ?? {}), "Content-Type": "application/json" });

async function call<T>(route: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${ROOT}/${route}`, body === undefined ? { headers: headers() } : { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 404) throw new Error("The optional media plugin is not installed, or is older than model downloads.");
  if (!response.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : `The media plugin answered ${response.status}.`);
  return data as T;
}

export const modelKeyStatus = (): Promise<Record<ModelProvider, boolean>> => call("keys");
export const testModelKey = (provider: ModelProvider): Promise<{ ok: boolean; set: boolean; message: string }> => call("test-key", { provider });
export const planModelDownload = (provider: ModelProvider, ref: ModelRef, kind?: string, root = 0): Promise<DownloadCard> =>
  call("plan", { provider, ref, ...(kind ? { kind } : {}), root });
export const startModelDownload = (planId: string): Promise<DownloadJob> => call("download", { planId });
export const modelDownloads = async (): Promise<DownloadJob[]> => (await call<{ jobs: DownloadJob[] }>("jobs")).jobs;
export const cancelModelDownload = (id: string): Promise<DownloadJob> => call("cancel", { id });

export async function writeModelKey(provider: ModelProvider, value: string): Promise<WriteResult> {
  const trimmed = value.trim();
  if (!trimmed) return couldNot("the token is empty");
  const secrets = await importSTModule<SecretsHostModule>("/scripts/secrets.js");
  return await secrets.writeSecret(PROVIDER_SECRET_KEYS[provider], trimmed, "Story Orchestrator model downloads") ? wrote() : couldNot("SillyTavern refused to store the token");
}
