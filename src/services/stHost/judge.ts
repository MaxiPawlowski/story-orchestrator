import { JudgeBusyError, type JudgeRequest, type JudgeResponse, type JudgeTransport } from "@judge/index";
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
}

// public/scripts/secrets.js:349 — writes through /api/secrets/write, clears nothing we own, and the
// server never hands a non-exportable key back to the page (src/endpoints/secrets.js:568).
interface SecretsHostModule {
  writeSecret(key: string, value: string, label?: string, options?: { allowEmpty?: boolean }): Promise<string | null>;
}

const BUSY_STATUSES: ReadonlySet<number> = new Set([429, 529]);

const headers = (): Record<string, string> => (getContext() as unknown as { getRequestHeaders: () => Record<string, string> }).getRequestHeaders();

export async function judgeStatus(): Promise<JudgeStatus | null> {
  try {
    const response = await fetch(`${JUDGE_PLUGIN_BASE}/status`, { method: "GET", headers: headers() });
    if (!response.ok) return null;
    const data = await response.json() as unknown;
    if (!isRecord(data)) return null;
    return {
      configured: data.configured === true,
      model: typeof data.model === "string" ? data.model : null,
      keySource: typeof data.keySource === "string" ? data.keySource : null,
      pluginVersion: typeof data.pluginVersion === "string" ? data.pluginVersion : null,
      maxInFlight: isRecord(data.limits) && typeof data.limits.maxInFlight === "number" ? data.limits.maxInFlight : null,
    };
  } catch {
    return null;
  }
}

export const judgeTransport: JudgeTransport = async (request: JudgeRequest, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  // The caller's epoch signal aborts the same controller, so a story load, restart or
  // chat change cancels the request in flight instead of paying for an answer nobody will use.
  const onEpochAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onEpochAbort);
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${JUDGE_PLUGIN_BASE}/systemone`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "text/plain;charset=UTF-8", "X-SO-Plugin": "1" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (BUSY_STATUSES.has(response.status)) throw new JudgeBusyError(response.status);
    if (!response.ok) throw new Error(`judge plugin ${response.status}`);
    return await response.json() as JudgeResponse;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onEpochAbort);
  }
};

export async function writeJudgeSecret(value: string): Promise<WriteResult> {
  const trimmed = value.trim();
  if (!trimmed) return couldNot("the key is empty");
  const secrets = await importSTModule<SecretsHostModule>("/scripts/secrets.js");
  return await secrets.writeSecret(JUDGE_SECRET_KEY, trimmed, "Story Orchestrator judge") ? wrote() : couldNot("SillyTavern refused to store the key");
}
