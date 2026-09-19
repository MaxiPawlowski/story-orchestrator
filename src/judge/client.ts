import { validateJudgeRequest } from "./questions";
import type { JudgeRequest, JudgeResponse, JudgeResult, JudgeTransport } from "./types";

export const JUDGE_CACHE_LIMIT = 100;

export class JudgeTimeoutError extends Error {
  constructor() {
    super("judge timeout");
    this.name = "JudgeTimeoutError";
  }
}

export interface AskJudgeOptions {
  timeoutMs: number;
  now?: () => number;
  cache?: Map<string, JudgeResponse>;
}

const raceTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new JudgeTimeoutError()), ms);
  promise.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
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

const isTimeout = (error: unknown) => error instanceof JudgeTimeoutError || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));

export async function askJudge(transport: JudgeTransport, request: JudgeRequest, options: AskJudgeOptions): Promise<JudgeResult> {
  const now = options.now ?? Date.now;
  const stateChars = JSON.stringify(request.state).length;
  const questionCount = Object.keys(request.questions).length;
  const base = { stateChars, questionCount };
  if (validateJudgeRequest(request).length) return { ...base, answers: null, model: null, latencyMs: 0, fallback: "invalid", cached: false };
  const key = JSON.stringify(request);
  const hit = options.cache?.get(key);
  if (hit) return { ...base, answers: hit.answers, model: hit.model, latencyMs: 0, cached: true };
  const startedAt = now();
  try {
    const response = await raceTimeout(transport(request, { timeoutMs: options.timeoutMs }), options.timeoutMs);
    if (!response || typeof response.answers !== "object" || response.answers === null) {
      return { ...base, answers: null, model: null, latencyMs: now() - startedAt, fallback: "error", cached: false };
    }
    if (options.cache) remember(options.cache, key, response);
    return { ...base, answers: response.answers, model: typeof response.model === "string" ? response.model : null, latencyMs: now() - startedAt, cached: false };
  } catch (error) {
    return { ...base, answers: null, model: null, latencyMs: now() - startedAt, fallback: isTimeout(error) ? "timeout" : "error", cached: false };
  }
}
