import { sendConnectionProfileRequest, type ModelFailureKind, type ModelFinish } from "@services/STAPI";
import { anySignal } from "@utils/signals";
import { PROBE_MAX_TOKENS, PROBE_PROMPT, PROBE_TIMEOUT_MS, type ProbeResult } from "./breaker";
import { callTimeoutMs, DEFAULT_MAX_TOKENS, estimateTokens, TIMEOUT_RETRY_SCALE } from "./callBudget";
import { detectDegenerate } from "./degenerate";
import { stripReasoningBlocks } from "./parse";
import type { PassRole } from "./passRole";
import type { RequestBudget } from "./tokenMeter";

export interface ExtractionClientOptions {
  profileId: string | null;
  role: PassRole;
  maxTokens?: number;
  debugResponse?: string | null;
  temperature?: number;
  signal?: AbortSignal;
  refuseIncomplete?: boolean;
  budget?: RequestBudget;
  timeoutScale?: number;
  budgetKind?: string;
}

export interface ExtractionReply {
  text: string;
  finish: ModelFinish;
}

export class ModelCallError extends Error {
  constructor(readonly kind: ModelFailureKind, message: string, readonly profileId: string | null = null, readonly timeoutMs: number | null = null) {
    super(message);
    this.name = "ModelCallError";
  }
}

export interface CallAnswered {
  profileId: string;
  ms: number;
}

let answeredObserver: ((call: CallAnswered) => void) | null = null;

/** v2.4 acceptance A6: every answered call is evidence the host is alive, which the breaker reads. */
export function setAnsweredObserver(observer: (call: CallAnswered) => void): () => void {
  answeredObserver = observer;
  return () => {
    if (answeredObserver === observer) answeredObserver = null;
  };
}

export type ProfileRouter = (role: PassRole, fallback: string | null) => { ok: true; profileId: string | null } | { ok: false; profileId: string; reason: string };

let profileRouter: ProfileRouter | null = null;

/** v2.4 plan 08 T18: the runtime installs the per-role route once; unset, every call keeps its own profileId. */
export function setProfileRouter(router: ProfileRouter): () => void {
  profileRouter = router;
  return () => {
    if (profileRouter === router) profileRouter = null;
  };
}

export const routeProfile = (role: PassRole, fallback: string | null): ReturnType<ProfileRouter> => profileRouter?.(role, fallback) ?? { ok: true, profileId: fallback };

export const isLapse = (error: unknown): boolean => error instanceof ModelCallError && error.kind === "lapsed";

export async function probeModel(profileId: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const reply = await sendConnectionProfileRequest(profileId, PROBE_PROMPT, PROBE_MAX_TOKENS, { signal: AbortSignal.timeout(timeoutMs) });
  if (reply.ok) return { ok: true };
  return { ok: false, kind: reply.kind, message: reply.kind === "timeout" ? `the memory model did not answer a probe within ${timeoutMs} ms` : reply.message };
}

export const lapseAsEmpty = (error: unknown): string => {
  if (isLapse(error)) return "";
  throw error;
};

export async function callExtractionReply(prompt: string, options: ExtractionClientOptions): Promise<ExtractionReply> {
  if (options.debugResponse !== undefined && options.debugResponse !== null) return { text: stripReasoningBlocks(options.debugResponse), finish: "unknown" };
  const route = routeProfile(options.role, options.profileId);
  if (!route.ok) throw new ModelCallError("config", route.reason, route.profileId);
  const profileId = route.profileId;
  if (!profileId) throw new ModelCallError("config", "No memory LLM profile selected");
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = Math.round(callTimeoutMs(maxTokens, estimateTokens(prompt), options.budgetKind) * (options.timeoutScale ?? 1));
  const startedAt = Date.now();
  const reply = await sendConnectionProfileRequest(profileId, prompt, maxTokens, {
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs)]),
    samplers: { temperature: options.temperature ?? 0.1, top_p: 0.9 },
  });
  if (!reply.ok) throw new ModelCallError(reply.kind, reply.kind === "timeout" ? `the memory model did not answer within ${timeoutMs} ms` : reply.message, profileId, reply.kind === "timeout" ? timeoutMs : null);
  answeredObserver?.({ profileId, ms: Date.now() - startedAt });
  return { text: stripReasoningBlocks(reply.text), finish: reply.finish };
}

export const isTimeout = (error: unknown): error is ModelCallError => error instanceof ModelCallError && error.kind === "timeout";

/** v2.4 acceptance A11: a timed-out call gets one more ask at TIMEOUT_RETRY_SCALE times its budget, then gives up naming both. */
export async function retryOnTimeout<T>(ask: (timeoutScale: number) => Promise<T>): Promise<T> {
  try {
    return await ask(1);
  } catch (first) {
    if (!isTimeout(first)) throw first;
    try {
      return await ask(TIMEOUT_RETRY_SCALE);
    } catch (retry) {
      if (!isTimeout(retry)) throw retry;
      throw new ModelCallError("timeout", `the memory model did not answer within ${first.timeoutMs} ms, nor within ${retry.timeoutMs} ms on one retry`, retry.profileId, retry.timeoutMs);
    }
  }
}

export const isIncomplete = (reply: ExtractionReply): boolean => reply.finish === "length" || detectDegenerate(reply.text).degenerate;

export async function callExtractionModel(prompt: string, options: ExtractionClientOptions): Promise<string> {
  const reply = await callExtractionReply(prompt, options);
  return options.refuseIncomplete && isIncomplete(reply) ? "" : reply.text;
}
