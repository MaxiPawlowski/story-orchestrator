import { judgeShapeIssues, judgeSizeIssues } from "./questions";
import { isJudgeBusy, JudgeBusyError, pluginFallback, type JudgeGate } from "./gate";
import { JUDGE_BUSY_RETRIES, JUDGE_BUSY_RETRY_MS, JUDGE_STALL_GRACE_MS, JUDGE_STALL_SLACK_MS } from "./policy";
import type { JudgeFallback, JudgeRequest, JudgeResponse, JudgeResult, JudgeTransport, JudgeUsage } from "./types";

export const JUDGE_CACHE_LIMIT = 100;

export class JudgeTimeoutError extends Error {
  constructor() {
    super("judge timeout");
    this.name = "JudgeTimeoutError";
  }
}

export interface AskJudgeOptions {
  timeoutMs: number;
  /** Aborted when the epoch this call was made in is replaced. */
  signal?: AbortSignal;
  now?: () => number;
  cache?: Map<string, JudgeResponse>;
  gate?: JudgeGate;
  use?: string;
}

export function budgetTimer(ms: number, expire: () => void, now: () => number = Date.now): () => void {
  const startedAt = now();
  let extended = false;
  let timer: ReturnType<typeof setTimeout>;
  const fire = () => {
    if (!extended && now() - startedAt - ms > JUDGE_STALL_SLACK_MS) {
      extended = true;
      timer = setTimeout(fire, JUDGE_STALL_GRACE_MS);
      return;
    }
    expire();
  };
  timer = setTimeout(fire, ms);
  return () => clearTimeout(timer);
}

const raceTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => new Promise((resolve, reject) => {
  const stop = budgetTimer(ms, () => reject(new JudgeTimeoutError()));
  promise.then(
    (value) => { stop(); resolve(value); },
    (error) => { stop(); reject(error); },
  );
});

const remember = (cache: Map<string, JudgeResponse>, key: string, response: JudgeResponse) => {
  cache.set(key, response);
  while (cache.size > JUDGE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

const USAGE_FIELDS = ["input_tokens", "output_tokens", "cost"] as const;

export function readUsage(response: { usage?: unknown } | null | undefined): JudgeUsage | undefined {
  const usage = response?.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const kept = USAGE_FIELDS.filter((field) => {
    const value = (usage as Record<string, unknown>)[field];
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  });
  return kept.length ? Object.fromEntries(kept.map((field) => [field, (usage as Record<string, number>)[field]])) as JudgeUsage : undefined;
}

const isTimeout = (error: unknown) => error instanceof JudgeTimeoutError || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));

async function sendThroughGate(transport: JudgeTransport, request: JudgeRequest, options: AskJudgeOptions, sent: (at: number) => void): Promise<JudgeResponse> {
  const now = options.now ?? Date.now;
  const signal = { ...(options.signal ? { signal: options.signal } : {}), ...(options.use ? { use: options.use } : {}) };
  for (let attempt = 0; ; attempt += 1) {
    const release = options.gate ? await options.gate.acquire(options.signal) : () => undefined;
    try {
      const cooling = options.gate?.coolingFor() ?? 0;
      if (cooling > 0) throw new JudgeBusyError(429, cooling);
      sent(now());
      return await raceTimeout(transport(request, { timeoutMs: options.timeoutMs, ...signal }), options.timeoutMs);
    } catch (error) {
      if (!options.gate || !isJudgeBusy(error) || attempt >= JUDGE_BUSY_RETRIES) throw error;
      if (error.retryAfterMs !== null && error.retryAfterMs > JUDGE_BUSY_RETRY_MS * (attempt + 1)) {
        options.gate.coolFor(error.retryAfterMs);
        throw error;
      }
    } finally {
      release();
    }
    await options.gate.backoff(attempt + 1, options.signal);
  }
}

export async function askJudge(transport: JudgeTransport, request: JudgeRequest, options: AskJudgeOptions): Promise<JudgeResult> {
  const now = options.now ?? Date.now;
  const stateChars = JSON.stringify(request.state).length;
  const questionCount = Object.keys(request.questions).length;
  const base = { stateChars, questionCount };
  if (judgeShapeIssues(request).length) return { ...base, answers: null, model: null, latencyMs: 0, fallback: "invalid", cached: false };
  if (judgeSizeIssues(request).length) return { ...base, answers: null, model: null, latencyMs: 0, fallback: "too-large", cached: false };
  const key = JSON.stringify(request);
  const hit = options.cache?.get(key);
  if (hit) return { ...base, answers: hit.answers, model: hit.model, latencyMs: 0, cached: true };
  let startedAt = now();
  try {
    const response = await sendThroughGate(transport, request, options, (at) => { startedAt = at; });
    const usage = readUsage(response);
    const paid = usage ? { usage } : {};
    if (!response || typeof response.answers !== "object" || response.answers === null) {
      return { ...base, ...paid, answers: null, model: null, latencyMs: now() - startedAt, fallback: "error", cached: false };
    }
    if (options.cache) remember(options.cache, key, response);
    return { ...base, ...paid, answers: response.answers, model: typeof response.model === "string" ? response.model : null, latencyMs: now() - startedAt, cached: false };
  } catch (error) {
    // The caller signal aborting is OUR cancellation, not the model being slow. Checked first
    // because judgeTransport wires both the timeout and the epoch signal to one controller, so
    // they are indistinguishable by the error alone.
    const cancelled = options.signal?.aborted === true;
    const fallback: JudgeFallback = cancelled ? "cancelled" : isJudgeBusy(error) ? "busy" : pluginFallback(error) ?? (isTimeout(error) ? "timeout" : "error");
    return { ...base, answers: null, model: null, latencyMs: now() - startedAt, fallback, cached: false };
  }
}
