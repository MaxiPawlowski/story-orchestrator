import {
  DEFAULT_ARBITER_PROMPT,
  DEFAULT_INTERVAL_TURNS,
} from "@constants/defaults";

export type ArbiterFrequency = number & { readonly __brand: "ArbiterFrequency" };
export type ArbiterPrompt = string & { readonly __brand: "ArbiterPrompt" };

const MIN_FREQUENCY = 1;
const MAX_FREQUENCY = 99;

const toArbiterFrequency = (value: number): ArbiterFrequency => value as ArbiterFrequency;
const toArbiterPrompt = (value: string): ArbiterPrompt => value as ArbiterPrompt;

const DEFAULT_FREQUENCY: ArbiterFrequency = (() => {
  const raw = Math.floor(DEFAULT_INTERVAL_TURNS);
  if (!Number.isFinite(raw)) return toArbiterFrequency(MIN_FREQUENCY);
  const clamped = Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, raw));
  return toArbiterFrequency(clamped);
})();

const DEFAULT_PROMPT: ArbiterPrompt = (() => {
  const normalizedPrompt = normalizePrompt(DEFAULT_ARBITER_PROMPT);
  return toArbiterPrompt(normalizedPrompt || "Checkpoint arbiter prompt");
})();

function normalizePrompt(input: string): string {
  const trimmed = input.replace(/\r/g, "").trim();
  if (!trimmed) return "";
  return trimmed;
}

export function sanitizeArbiterFrequency(value: unknown): ArbiterFrequency {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_FREQUENCY;
  const floored = Math.floor(raw);
  const clamped = Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, floored));
  return toArbiterFrequency(clamped);
}

export function sanitizeArbiterPrompt(value: unknown): ArbiterPrompt {
  if (typeof value !== "string") return DEFAULT_PROMPT;
  const normalized = normalizePrompt(value);
  if (!normalized) return DEFAULT_PROMPT;
  return toArbiterPrompt(normalized);
}

export { DEFAULT_FREQUENCY as DEFAULT_SANITIZED_ARBITER_FREQUENCY };
export { DEFAULT_PROMPT as DEFAULT_SANITIZED_ARBITER_PROMPT };

