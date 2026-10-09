import {
  budgetTimer, JUDGE_PROVIDER_IDS, JudgeBusyError, JudgePluginError, type JudgeProviderId, type JudgeProviderStatus, type JudgeRequest, type JudgeResponse, type JudgeTransport,
} from "@judge/index";
import type { LlamaComplete } from "@judge/llamaLogprob";
import { getContext } from "./context";
import { importSTModule } from "./modules";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { isRecord } from "@utils/guards";

export const JUDGE_PLUGIN_ID = "story-orchestrator-judge";
export const JUDGE_PLUGIN_BASE = `/api/plugins/${JUDGE_PLUGIN_ID}`;
export const JUDGE_SECRET_KEY = "typesafe_api_key";

export interface JudgeStatus {
  configured: boolean;
  model: string | null;
  keySource: string | null;
  pluginVersion: string | null;
  maxInFlight?: number | null;
  providers?: Partial<Record<JudgeProviderId, JudgeProviderStatus>>;
}

const readProviders = (value: unknown): Partial<Record<JudgeProviderId, JudgeProviderStatus>> | undefined => (isRecord(value)
  ? Object.fromEntries(JUDGE_PROVIDER_IDS.map((id) => [id, value[id]]).filter((pair): pair is [JudgeProviderId, Record<string, unknown>] => isRecord(pair[1]))
    .map(([id, row]) => [id, { configured: row.configured === true, local: row.local === true, host: typeof row.host === "string" ? row.host : null }]))
  : undefined);

// public/scripts/secrets.js:349 — writes through /api/secrets/write, clears nothing we own, and the
// server never hands a non-exportable key back to the page (src/endpoints/secrets.js:568).
interface SecretsHostModule {
  writeSecret(key: string, value: string, label?: string, options?: { allowEmpty?: boolean }): Promise<string | null>;
}

const BUSY_STATUSES: ReadonlySet<number> = new Set([429, 529]);

const retryAfterMs = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim()) * 1000;
};

const headers = (): Record<string, string> => (getContext() as unknown as { getRequestHeaders: () => Record<string, string> }).getRequestHeaders();

export async function judgeStatus(): Promise<JudgeStatus | null> {
  try {
    const response = await fetch(`${JUDGE_PLUGIN_BASE}/status`, { method: "GET", headers: headers() });
    if (!response.ok) return null;
    const data = await response.json() as unknown;
    if (!isRecord(data)) return null;
    const providers = readProviders(data.providers);
    return {
      configured: data.configured === true,
      model: typeof data.model === "string" ? data.model : null,
      keySource: typeof data.keySource === "string" ? data.keySource : null,
      pluginVersion: typeof data.pluginVersion === "string" ? data.pluginVersion : null,
      maxInFlight: isRecord(data.limits) && typeof data.limits.maxInFlight === "number" ? data.limits.maxInFlight : null,
      ...(providers ? { providers } : {}),
    };
  } catch {
    return null;
  }
}

async function postToPlugin(path: string, body: unknown, signal?: AbortSignal, use?: string): Promise<unknown> {
  const response = await fetch(`${JUDGE_PLUGIN_BASE}${path}`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "text/plain;charset=UTF-8", "X-SO-Plugin": "1", ...(use ? { "X-SO-Judge-Use": use } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  if (BUSY_STATUSES.has(response.status)) throw new JudgeBusyError(response.status, retryAfterMs(response.headers.get("Retry-After")));
  if (!response.ok) throw new JudgePluginError(response.status);
  return await response.json() as unknown;
}

export const judgeTransport: JudgeTransport = async (request: JudgeRequest, options) => {
  const controller = new AbortController();
  const stop = budgetTimer(options.timeoutMs, () => controller.abort());
  // The caller's epoch signal aborts the same controller, so a story load, restart or
  // chat change cancels the request in flight instead of paying for an answer nobody will use.
  const onEpochAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onEpochAbort);
  if (options.signal?.aborted) controller.abort();
  try {
    return await postToPlugin("/systemone", request, controller.signal, options.use) as JudgeResponse;
  } finally {
    stop();
    options.signal?.removeEventListener("abort", onEpochAbort);
  }
};

export const judgeLlamaComplete: LlamaComplete = (body, options) => postToPlugin("/providers/llama-logprob/completion", body, options.signal, options.use);

export async function writeJudgeSecret(value: string): Promise<WriteResult> {
  const trimmed = value.trim();
  if (!trimmed) return couldNot("the key is empty");
  const secrets = await importSTModule<SecretsHostModule>("/scripts/secrets.js");
  return await secrets.writeSecret(JUDGE_SECRET_KEY, trimmed, "Story Orchestrator judge") ? wrote() : couldNot("SillyTavern refused to store the key");
}
