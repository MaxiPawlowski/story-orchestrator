import type { ModelReply, ModelRequestOptions } from "@services/STAPI";
import { anySignal } from "@utils/signals";
import { reasoningBudgetFor, reasoningExhaustedMessage, type ReasoningBudget } from "@utils/reasoningEffort";
import { callTimeoutMs, DEFAULT_MAX_TOKENS, estimateTokens } from "./callBudget";
import { ModelCallError } from "./modelError";
import type { ExtractionReply, ModelRoute } from "./modelRoute";
import { stripReasoningBlocks } from "./parse";

export type ModelTransport = (profileId: string, prompt: string, maxTokens: number, options: ModelRequestOptions) => Promise<ModelReply>;

export interface CallOptions {
  maxTokens?: number;
  debugResponse?: string | null;
  temperature?: number;
  signal?: AbortSignal;
  timeoutScale?: number;
  budgetKind?: string;
  reasoningBudget?: ReasoningBudget;
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

export const replyVia = (transport: ModelTransport): RouteReply => async (prompt, route, options = {}) => {
  if (options.debugResponse !== undefined && options.debugResponse !== null) return { text: stripReasoningBlocks(options.debugResponse), finish: "unknown" };
  if (!route) throw new ModelCallError("config", "No memory LLM profile selected");
  const profileId = route.profileId;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const effort = route.effort ?? "default";
  const reasoningBudget = reasoningBudgetFor(effort, options.reasoningBudget);
  const timeoutMs = Math.round(callTimeoutMs(maxTokens + reasoningBudget, estimateTokens(prompt), options.budgetKind) * (options.timeoutScale ?? 1));
  const startedAt = Date.now();
  const reply = await transport(profileId, prompt, maxTokens, {
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs)]),
    samplers: { temperature: options.temperature ?? 0.1, top_p: 0.9 },
    ...(effort !== "default" ? { effort, reasoningBudget } : {}),
  });
  if (!reply.ok) throw new ModelCallError(
    reply.kind,
    reply.kind === "timeout" ? `the memory model did not answer within ${timeoutMs} ms` : reply.message,
    profileId,
    reply.kind === "timeout" ? timeoutMs : null,
  );
  answeredObserver?.({ profileId, ms: Date.now() - startedAt });
  const text = stripReasoningBlocks(reply.text);
  if (text.trim() === "" && reply.text.trim() !== "") {
    const inline = { chars: reply.text.length, tokens: reply.meter?.tokens ?? null };
    throw new ModelCallError("reasoning-exhausted", reasoningExhaustedMessage(inline, reply.finish), profileId);
  }
  return { text, finish: reply.finish, ...(reply.meter ? { meter: { ...reply.meter, chars: reply.meter.chars + reply.text.length - text.length } } : {}) };
};
