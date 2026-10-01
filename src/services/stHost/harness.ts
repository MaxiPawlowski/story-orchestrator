import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { HARNESS_IDS, type HarnessId } from "@utils/harness";
import { pluginVersionIssue } from "@utils/pluginVersions";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import type { ModelFailureKind, ModelFinish, ModelReply, ModelUsage } from "./modelReply";

export const HARNESS_PLUGIN_BASE = "/api/plugins/story-orchestrator-harness";

export const HARNESS_SYSTEM = "You answer one request from a story-tracking tool. Reply in plain text, exactly in the format the request asks for. You have no tools.";

export interface HarnessModel {
  id: string;
  context: number;
}

export interface HarnessRow {
  installed: boolean;
  version: string | null;
  problem: string | null;
  loggedIn: boolean | null;
  fresh: boolean;
  loginProblem: string | null;
  blocked: string | null;
  offered: boolean;
  isolation: string;
  models: HarnessModel[];
  quotaUntil: number | null;
  spawns: number;
  cacheWarm?: boolean;
  agentBridge?: boolean;
}

export interface HarnessStatus {
  pluginVersion: string | null;
  harnesses: Partial<Record<HarnessId, HarnessRow>>;
}

export interface HarnessRequest {
  harness: HarnessId;
  model: string;
  role: string;
  effort?: ReasoningEffort;
  prompt: string;
  maxOutputChars: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

const KINDS: ReadonlySet<string> = new Set(["lapsed", "timeout", "transport", "config", "auth", "quota", "malformed", "refused", "busy"]);
const FINISHES: ReadonlySet<string> = new Set(["stop", "length", "unknown"]);
const BUSY_RETRY_MS = 1000;
const MAX_TIMEOUT_MS = 900_000;

const headers = (): Record<string, string> => (getContext() as unknown as { getRequestHeaders: () => Record<string, string> }).getRequestHeaders();
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const readRow = (row: Record<string, unknown>): HarnessRow => ({
  installed: row.installed === true,
  version: text(row.version),
  problem: text(row.problem),
  loggedIn: typeof row.loggedIn === "boolean" ? row.loggedIn : null,
  fresh: row.fresh === true,
  loginProblem: text(row.loginProblem),
  blocked: text(row.blocked),
  offered: row.offered === true,
  isolation: text(row.isolation) ?? "",
  models: Array.isArray(row.models) ? row.models.filter(isRecord).flatMap((model) => (typeof model.id === "string" ? [{ id: model.id, context: num(model.context) ?? 0 }] : [])) : [],
  quotaUntil: num(row.quotaUntil),
  spawns: num(row.spawns) ?? 0,
  ...(typeof row.cacheWarm === "boolean" ? { cacheWarm: row.cacheWarm } : {}),
  ...(row.agentBridge === true ? { agentBridge: true } : {}),
});

export async function harnessCapability(): Promise<{ state: "present" | "absent"; detail: string }> {
  const status = await (await import("./harnessCache")).refreshHarnessStatus();
  const offered = Object.entries(status?.harnesses ?? {}).filter(([, row]) => row?.installed && row.offered).map(([id, row]) => `${id} ${row?.version ?? "?"}${row?.fresh ? "" : " (log in)"}`);
  const issue = pluginVersionIssue("harness", status?.pluginVersion);
  if (offered.length) return { state: "present", detail: `${offered.join(", ")}${issue ? `; ${issue}` : ""}` };
  return { state: "absent", detail: `${status ? "no harness is offered" : "no harness plugin"}; every task stays on a profile` };
}

export async function fetchHarnessStatus(refresh = false): Promise<HarnessStatus | null> {
  try {
    const response = await fetch(`${HARNESS_PLUGIN_BASE}/status${refresh ? "?refresh=1" : ""}`, { method: "GET", headers: headers() });
    if (!response.ok) return null;
    const data = await response.json() as unknown;
    if (!isRecord(data) || !isRecord(data.harnesses)) return null;
    const rows = data.harnesses;
    return {
      pluginVersion: text(data.pluginVersion),
      harnesses: Object.fromEntries(HARNESS_IDS.flatMap((id) => { const row = rows[id]; return isRecord(row) ? [[id, readRow(row)]] : []; })),
    };
  } catch {
    return null;
  }
}

const readUsage = (value: unknown): ModelUsage | undefined => (isRecord(value) ? { input: num(value.input), output: num(value.output), costUsd: num(value.costUsd) } : undefined);

export const readHarnessAnswer = (data: unknown, effort: ReasoningEffort): ModelReply => {
  if (!isRecord(data)) return { ok: false, kind: "malformed", message: "the harness plugin answered with no JSON object" };
  if (data.ok !== true) {
    const kind = typeof data.kind === "string" && KINDS.has(data.kind) ? data.kind as ModelFailureKind : "transport";
    const retryAt = num(data.retryAt);
    return { ok: false, kind, message: text(data.message) ?? "the harness call failed", ...(retryAt ? { retryAt } : {}) };
  }
  const answer = text(data.text);
  if (answer === null) return { ok: false, kind: "malformed", message: "the harness answered without text" };
  const applied = data.effortApplied === true;
  const usage = readUsage(data.usage);
  return {
    ok: true,
    text: answer,
    finish: typeof data.finish === "string" && FINISHES.has(data.finish) ? data.finish as ModelFinish : "unknown",
    meter: { effort, applied, collapsed: false, unsupported: applied || effort === "default" ? null : "this harness takes low, medium or high only", budget: 0, chars: 0, tokens: null },
    ...(usage ? { usage } : {}),
    spawnMs: num(data.spawnMs),
  };
};

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

export const STALE_PAGE_REFUSAL = "SillyTavern refused the request (403 without the plugin's answer: the page's session or CSRF token is stale); reload the page";

export const pluginRefusal = async (response: { json: () => Promise<unknown> }): Promise<string | null> => {
  try {
    const data = await response.json();
    return isRecord(data) && typeof data.error === "string" && data.error ? data.error : null;
  } catch {
    return null;
  }
};

const forbidden = async (response: Response): Promise<ModelReply> => {
  const refusal = await pluginRefusal(response);
  return refusal
    ? { ok: false, kind: "config", message: `the harness plugin refused this user: ${refusal}` }
    : { ok: false, kind: "transport", message: STALE_PAGE_REFUSAL };
};

const requestIdOf = (): string => `so-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function sendHarnessRequest(request: HarnessRequest): Promise<ModelReply> {
  const effort = request.effort ?? "default";
  const requestId = requestIdOf();
  const deadline = Date.now() + request.timeoutMs;
  const body = JSON.stringify({
    requestId,
    harness: request.harness,
    model: request.model,
    role: request.role,
    system: HARNESS_SYSTEM,
    prompt: request.prompt,
    timeoutMs: Math.min(MAX_TIMEOUT_MS, Math.max(1000, Math.round(request.timeoutMs))),
    maxOutputChars: request.maxOutputChars,
    ...(effort === "low" || effort === "medium" || effort === "high" ? { effort } : {}),
  });
  const cancel = () => {
    const cancelHeaders = { ...headers(), "Content-Type": "text/plain;charset=UTF-8", "X-SO-Plugin": "1" };
    void fetch(`${HARNESS_PLUGIN_BASE}/cancel`, { method: "POST", headers: cancelHeaders, body: JSON.stringify({ requestId }) }).catch(() => undefined);
  };
  request.signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (!request.signal?.aborted) {
      const response = await fetch(`${HARNESS_PLUGIN_BASE}/complete`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "text/plain;charset=UTF-8", "X-SO-Plugin": "1" },
        body,
        signal: request.signal,
      });
      if (response.status === 429 && Date.now() + BUSY_RETRY_MS < deadline) {
        await sleep(BUSY_RETRY_MS, request.signal);
        continue;
      }
      if (response.status === 404) return { ok: false, kind: "config", message: "the harness plugin is not installed on the SillyTavern server" };
      if (response.status === 403) return await forbidden(response);
      if (!response.ok && response.status !== 429) return { ok: false, kind: "transport", message: `the harness plugin answered ${String(response.status)}` };
      return readHarnessAnswer(await response.json() as unknown, effort);
    }
    return { ok: false, kind: "lapsed", message: "the request was cancelled" };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError") return { ok: false, kind: "timeout", message: "the harness did not answer in time" };
    if (name === "AbortError" || request.signal?.aborted) {
      const timedOut = request.signal?.reason instanceof Error && request.signal.reason.name === "TimeoutError";
      return { ok: false, kind: timedOut ? "timeout" : "lapsed", message: "the request was cancelled" };
    }
    return { ok: false, kind: "transport", message: error instanceof Error ? error.message : "the harness plugin could not be reached" };
  } finally {
    request.signal?.removeEventListener("abort", cancel);
  }
}
