import { sendConnectionProfileRequest } from "@services/STAPI";
import { anySignal } from "@utils/signals";
import { PROBE_MAX_TOKENS, PROBE_PROMPT, PROBE_TIMEOUT_MS, type ProbeResult } from "./breaker";
import { callTimeoutMs, DEFAULT_MAX_TOKENS, estimateTokens } from "./callBudget";
import { ModelCallError } from "./modelError";
import type { ExtractionReply, ModelCall, ModelRoute } from "./modelRoute";
import { stripReasoningBlocks } from "./parse";

export interface CallOptions {
  maxTokens?: number;
  debugResponse?: string | null;
  temperature?: number;
  signal?: AbortSignal;
  timeoutScale?: number;
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

export async function probeModel(profileId: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const reply = await sendConnectionProfileRequest(profileId, PROBE_PROMPT, PROBE_MAX_TOKENS, { signal: AbortSignal.timeout(timeoutMs) });
  if (reply.ok) return { ok: true };
  return { ok: false, kind: reply.kind, message: reply.kind === "timeout" ? `the memory model did not answer a probe within ${timeoutMs} ms` : reply.message };
}

export async function callExtractionReply(prompt: string, route: ModelRoute | null, options: CallOptions = {}): Promise<ExtractionReply> {
  if (options.debugResponse !== undefined && options.debugResponse !== null) return { text: stripReasoningBlocks(options.debugResponse), finish: "unknown" };
  if (!route) throw new ModelCallError("config", "No memory LLM profile selected");
  const profileId = route.profileId;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = Math.round(callTimeoutMs(maxTokens, estimateTokens(prompt)) * (options.timeoutScale ?? 1));
  const startedAt = Date.now();
  const reply = await sendConnectionProfileRequest(profileId, prompt, maxTokens, {
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs)]),
    samplers: { temperature: options.temperature ?? 0.1, top_p: 0.9 },
  });
  if (!reply.ok) throw new ModelCallError(reply.kind, reply.kind === "timeout" ? `the memory model did not answer within ${timeoutMs} ms` : reply.message, profileId, reply.kind === "timeout" ? timeoutMs : null);
  answeredObserver?.({ profileId, ms: Date.now() - startedAt });
  return { text: stripReasoningBlocks(reply.text), finish: reply.finish };
}

export const routedModel = (route: ModelRoute | null): ModelCall => (prompt, ask) => callExtractionReply(prompt, route, ask);
