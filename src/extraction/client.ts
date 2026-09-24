import { sendConnectionProfileRequest, type ModelFailureKind, type ModelFinish } from "@services/STAPI";
import { anySignal } from "@utils/signals";
import { callTimeoutMs, DEFAULT_MAX_TOKENS } from "./callBudget";
import { detectDegenerate } from "./degenerate";
import { stripReasoningBlocks } from "./parse";
import type { RequestBudget } from "./tokenMeter";

export interface ExtractionClientOptions {
  profileId: string | null;
  maxTokens?: number;
  debugResponse?: string | null;
  temperature?: number;
  signal?: AbortSignal;
  refuseIncomplete?: boolean;
  budget?: RequestBudget;
}

export interface ExtractionReply {
  text: string;
  finish: ModelFinish;
}

export class ModelCallError extends Error {
  constructor(readonly kind: ModelFailureKind, message: string) {
    super(message);
    this.name = "ModelCallError";
  }
}

export const isLapse = (error: unknown): boolean => error instanceof ModelCallError && error.kind === "lapsed";

export const lapseAsEmpty = (error: unknown): string => {
  if (isLapse(error)) return "";
  throw error;
};

export async function callExtractionReply(prompt: string, options: ExtractionClientOptions): Promise<ExtractionReply> {
  if (options.debugResponse !== undefined && options.debugResponse !== null) return { text: stripReasoningBlocks(options.debugResponse), finish: "unknown" };
  if (!options.profileId) throw new ModelCallError("config", "No memory LLM profile selected");
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = callTimeoutMs(maxTokens);
  const reply = await sendConnectionProfileRequest(options.profileId, prompt, maxTokens, {
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs)]),
    samplers: { temperature: options.temperature ?? 0.1, top_p: 0.9 },
  });
  if (!reply.ok) throw new ModelCallError(reply.kind, reply.kind === "timeout" ? `the memory model did not answer within ${timeoutMs} ms` : reply.message);
  return { text: stripReasoningBlocks(reply.text), finish: reply.finish };
}

export const isIncomplete = (reply: ExtractionReply): boolean => reply.finish === "length" || detectDegenerate(reply.text).degenerate;

export async function callExtractionModel(prompt: string, options: ExtractionClientOptions): Promise<string> {
  const reply = await callExtractionReply(prompt, options);
  return options.refuseIncomplete && isIncomplete(reply) ? "" : reply.text;
}
