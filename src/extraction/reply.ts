import type { HarnessRequest, ModelReply, ModelRequestOptions } from "@services/STAPI";
import { anySignal } from "@utils/signals";
import { reasoningBudgetFor, reasoningExhaustedMessage, type ReasoningBudget } from "@utils/reasoningEffort";
import { callTimeoutMs, DEFAULT_MAX_TOKENS, estimateTokens } from "./callBudget";
import { ModelCallError } from "./modelError";
import { routeKey, type ExtractionReply, type ModelRoute } from "./modelRoute";
import { stripReasoningBlocks } from "./parse";

export type ModelTransport = (profileId: string, prompt: string, maxTokens: number, options: ModelRequestOptions) => Promise<ModelReply>;

export type HarnessTransport = (request: HarnessRequest) => Promise<ModelReply>;

export const HARNESS_SPAWN_MS = 15_000;
export const HARNESS_CHARS_PER_TOKEN = 6;
const HARNESS_MAX_OUTPUT_CHARS = 400_000;

export interface CallOptions {
  maxTokens?: number;
  debugResponse?: string | null;
  temperature?: number;
  signal?: AbortSignal;
  timeoutScale?: number;
  budgetKind?: string;
  reasoningBudget?: ReasoningBudget;
  role?: string;
}

export type RouteReply = (prompt: string, route: ModelRoute | null, options?: CallOptions) => Promise<ExtractionReply>;

export interface CallAnswered {
  profileId: string;
  ms: number;
}

let answeredObserver: ((call: CallAnswered) => void) | null = null;

/** Acceptance every answered call is evidence the host is alive, which the breaker reads. */
export function setAnsweredObserver(observer: (call: CallAnswered) => void): () => void {
  answeredObserver = observer;
  return () => {
    if (answeredObserver === observer) answeredObserver = null;
  };
}

const noHarness: HarnessTransport = () => Promise.resolve({ ok: false, kind: "config", message: "no harness transport" });

const viaHarness = async (harness: HarnessTransport, route: ModelRoute & { kind: "harness" }, prompt: string, options: CallOptions): Promise<ExtractionReply> => {
  const key = routeKey(route);
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = Math.round(callTimeoutMs(maxTokens, estimateTokens(prompt), options.budgetKind) * (options.timeoutScale ?? 1) * (route.options?.timeoutScale ?? 1)) + HARNESS_SPAWN_MS;
  const startedAt = Date.now();
  const reply = await harness({
    harness: route.harness,
    model: route.model,
    role: options.role ?? "read",
    ...(route.effort ? { effort: route.effort } : {}),
    prompt,
    maxOutputChars: Math.min(HARNESS_MAX_OUTPUT_CHARS, maxTokens * HARNESS_CHARS_PER_TOKEN),
    timeoutMs,
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs + 5_000)]),
  });
  if (!reply.ok) throw new ModelCallError(reply.kind, reply.message, key, reply.kind === "timeout" ? timeoutMs : null, reply.retryAt ?? null);
  answeredObserver?.({ profileId: key, ms: Date.now() - startedAt });
  const text = stripReasoningBlocks(reply.text);
  if (!text.trim()) throw new ModelCallError("malformed", "the harness answered with no text", key);
  return { text, finish: reply.finish, meter: reply.meter, ...(reply.usage ? { usage: reply.usage } : {}), spawnMs: reply.spawnMs ?? null };
};

export const replyVia = (transport: ModelTransport, harness: HarnessTransport = noHarness): RouteReply => async (prompt, route, options = {}) => {
  if (options.debugResponse !== undefined && options.debugResponse !== null) return { text: stripReasoningBlocks(options.debugResponse), finish: "unknown" };
  if (!route) throw new ModelCallError("config", "No memory LLM profile selected");
  if (route.kind === "harness") return viaHarness(harness, route, prompt, options);
  const profileId = route.profileId;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const effort = route.effort ?? "default";
  const reasoningBudget = reasoningBudgetFor(effort, options.reasoningBudget);
  const timeoutMs = Math.round(callTimeoutMs(maxTokens + reasoningBudget, estimateTokens(prompt), options.budgetKind) * (options.timeoutScale ?? 1));
  const startedAt = Date.now();
  const request: ModelRequestOptions = {
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs)]),
    samplers: { temperature: options.temperature ?? 0.1, top_p: 0.9 },
  };
  if (effort !== "default") Object.assign(request, { effort, reasoningBudget });
  const reply = await transport(profileId, prompt, maxTokens, request);
  if (!reply.ok) throw new ModelCallError(
    reply.kind,
    reply.kind === "timeout" ? `the memory model did not answer within ${timeoutMs} ms` : reply.message,
    profileId,
    reply.kind === "timeout" ? timeoutMs : null,
  );
  answeredObserver?.({ profileId, ms: Date.now() - startedAt });
  const text = stripReasoningBlocks(reply.text);
  if (!text.trim() && reply.text.trim()) throw new ModelCallError("reasoning-exhausted", reasoningExhaustedMessage({ chars: reply.text.length, tokens: null }, reply.finish), profileId);
  return reply.meter ? { text, finish: reply.finish, meter: reply.meter } : { text, finish: reply.finish };
};
