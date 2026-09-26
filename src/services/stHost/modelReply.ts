import { abortReasonName } from "@utils/signals";
import type { HostModelRequestCustom } from "./hostTypes";
import { isRecord } from "@utils/guards";

export type ModelFinish = "stop" | "length" | "unknown";
export type ModelFailureKind = "lapsed" | "timeout" | "transport" | "config";
export type ModelReply = { ok: true; text: string; finish: ModelFinish } | { ok: false; kind: ModelFailureKind; message: string };

export interface ModelSamplers {
  temperature?: number;
  top_p?: number;
}

export interface ModelRequestOptions {
  signal?: AbortSignal;
  samplers?: ModelSamplers;
}

export interface InstructSequences {
  stop_sequence?: string;
  input_sequence?: string;
  output_sequence?: string;
  last_output_sequence?: string;
}

export interface ModelRequestHost {
  sendRequest: (profileId: string, prompt: Array<{ role: string; content: string }>, maxTokens: number, custom: HostModelRequestCustom, overridePayload: Record<string, unknown>) => Promise<unknown>;
  profileExists: (profileId: string) => boolean;
  profile: (profileId: string) => { api?: string; instruct?: string } | null;
  apiSelected: (api: string | undefined) => string | null;
  extractMessage: (json: unknown, type: string) => string;
  instructSequences: (name: string | undefined) => InstructSequences | null;
}

export const TEXT_COMPLETION_API = "textgenerationwebui";
export const CHAT_COMPLETION_API = "openai";
const WRAPPED_MESSAGE = "API request failed";

const CONFIG_MESSAGES: RegExp[] = [
  /^Connection Manager is not available$/,
  /^Profile not found \(ID: /,
  /^Could not find profile\.$/,
  /^Select a connection profile that has an API$/,
  /^Unknown API type /,
  /^API type .+ is not supported\. Supported types: /,
  /^API type .+ does not support (chat|text) completions$/,
  /^No memory LLM profile selected$/,
];

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : typeof error === "string" ? error : "");
const nameOf = (error: unknown): string => (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : "");
const isConfigMessage = (message: string) => CONFIG_MESSAGES.some((pattern) => pattern.test(message));

export function classifyHostFailure(error: unknown, signal?: AbortSignal | null): { kind: ModelFailureKind; message: string } {
  const aborted = abortReasonName(signal);
  if (aborted) return {
    kind: aborted === "TimeoutError" ? "timeout" : "lapsed",
    message: messageOf(signal?.reason) || (aborted === "TimeoutError" ? "the memory model did not answer in time" : "the request was cancelled"),
  };
  const message = messageOf(error);
  if (message !== WRAPPED_MESSAGE || !(error instanceof Error)) return { kind: "config", message: message || "the memory model request was refused before it was sent" };
  const cause: unknown = error.cause;
  const causeMessage = messageOf(cause);
  const detail = causeMessage ? `${WRAPPED_MESSAGE}: ${causeMessage}` : WRAPPED_MESSAGE;
  if (nameOf(cause) === "AbortError") return { kind: "lapsed", message: detail };
  if (nameOf(cause) === "TimeoutError") return { kind: "timeout", message: detail };
  if (isConfigMessage(causeMessage)) return { kind: "config", message: detail };
  return { kind: "transport", message: detail };
}

const LENGTH_REASONS = new Set(["length", "max_tokens", "MAX_TOKENS", "limit"]);
const STOP_REASONS = new Set(["stop", "end_turn", "stop_sequence", "STOP", "eos", "word"]);

export function readFinish(json: unknown): ModelFinish {
  if (!isRecord(json)) return "unknown";
  const choice = Array.isArray(json.choices) && isRecord(json.choices[0]) ? json.choices[0] : null;
  const candidate = Array.isArray(json.candidates) && isRecord(json.candidates[0]) ? json.candidates[0] : null;
  for (const reason of [choice?.finish_reason, json.stop_reason, candidate?.finishReason, json.done_reason, json.stop_type]) {
    if (typeof reason !== "string") continue;
    if (LENGTH_REASONS.has(reason)) return "length";
    if (STOP_REASONS.has(reason)) return "stop";
  }
  if (json.stopped_limit === true) return "length";
  if (json.stopped_eos === true || json.stopped_word === true) return "stop";
  return "unknown";
}

const present = (sequence: string | undefined): sequence is string => typeof sequence === "string" && sequence.trim().length > 0;

export function cleanTextCompletionReply(text: string, instruct: InstructSequences | null): string {
  let message = text.replace(/[^\S\r\n]+$/gm, "");
  if (!instruct) return message;
  const stops = [instruct.stop_sequence, instruct.input_sequence].filter(present);
  for (const stop of stops) {
    for (let length = stop.length; length > 0; length -= 1) {
      if (message.slice(-length) === stop.slice(0, length)) {
        message = message.slice(0, -length);
        break;
      }
    }
  }
  for (const stop of stops) {
    const index = message.indexOf(stop);
    if (index !== -1) message = message.substring(0, index);
  }
  for (const sequences of [instruct.output_sequence, instruct.last_output_sequence]) {
    if (!sequences) continue;
    for (const line of sequences.split("\n").filter((entry) => entry.trim() !== "")) message = message.replaceAll(line, "");
  }
  return message;
}

export const samplerPayload = (apiSelected: string | null, samplers: ModelSamplers | undefined): Record<string, unknown> => ({
  stream: false,
  ...(apiSelected === TEXT_COMPLETION_API && samplers ? samplers : {}),
});

export async function requestModelReply(host: ModelRequestHost, profileId: string, prompt: string, maxTokens: number, options: ModelRequestOptions = {}): Promise<ModelReply> {
  const { signal } = options;
  if (signal?.aborted) return { ok: false, ...classifyHostFailure(null, signal) };
  if (!host.profileExists(profileId)) return { ok: false, kind: "config", message: `The selected memory model profile no longer exists or is not supported (ID: ${profileId})` };
  const profile = host.profile(profileId);
  const selected = host.apiSelected(profile?.api);
  try {
    const json = await host.sendRequest(
      profileId,
      [{ role: "user", content: prompt }],
      maxTokens,
      { extractData: false, includePreset: true, includeInstruct: true, stream: false, ...(signal ? { signal } : {}) },
      samplerPayload(selected, options.samplers),
    );
    const type = selected === CHAT_COMPLETION_API ? CHAT_COMPLETION_API : TEXT_COMPLETION_API;
    const extracted = host.extractMessage(json, type);
    const text = type === TEXT_COMPLETION_API ? cleanTextCompletionReply(extracted, host.instructSequences(profile?.instruct)) : extracted;
    return { ok: true, text, finish: readFinish(json) };
  } catch (error) {
    return { ok: false, ...classifyHostFailure(error, signal) };
  }
}
