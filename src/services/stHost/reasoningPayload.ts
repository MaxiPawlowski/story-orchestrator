import { isRecord } from "@utils/guards";
import type { ReasoningEffort, ReasoningLevel } from "@utils/reasoningEffort";

export interface ReasoningRoute {
  api: "chat" | "text" | null;
  source: string | null;
  model: string | null;
  includeBody: Record<string, unknown> | null;
}

export interface ReasoningPlan {
  payload: Record<string, unknown>;
  applied: boolean;
  thinks: boolean;
  collapsed: boolean;
  unsupported: string | null;
}

const NOTHING: ReasoningPlan = { payload: {}, applied: false, thinks: false, collapsed: false, unsupported: null };

const refuse = (reason: string): ReasoningPlan => ({ ...NOTHING, unsupported: reason });

const effortSource = (payload: Record<string, unknown>, thinks: boolean): ReasoningPlan => ({ payload, applied: true, thinks, collapsed: false, unsupported: null });

const LEVEL_SOURCES = new Set(["openai", "azure_openai", "claude", "makersuite", "vertexai", "xai", "aimlapi", "electronhub", "perplexity", "chutes", "fireworks"]);

const OFF_VALUES: Record<string, string> = { openrouter: "none", makersuite: "min", vertexai: "min" };

const KOBOLD_MODEL = /^koboldcpp\//;

function customPlan(route: ReasoningRoute, effort: "off" | ReasoningLevel): ReasoningPlan {
  const body = route.includeBody ?? {};
  const kwargs = isRecord(body.chat_template_kwargs) ? body.chat_template_kwargs : {};
  const thinks = effort !== "off";
  const merged = { ...body, chat_template_kwargs: { ...kwargs, enable_thinking: thinks } };
  const payload = { custom_include_body: JSON.stringify(merged), include_reasoning: thinks };
  return { payload, applied: true, thinks, collapsed: thinks, unsupported: null };
}

const level = (value: string): ReasoningPlan => effortSource({ reasoning_effort: value, include_reasoning: true }, true);

const lowest = (value: string): ReasoningPlan => effortSource({ reasoning_effort: value, include_reasoning: false }, false);

function chatPlan(route: ReasoningRoute, effort: "off" | ReasoningLevel): ReasoningPlan {
  const source = route.source ?? "";
  if (source === "custom" && !KOBOLD_MODEL.test(route.model ?? "")) return customPlan(route, effort);
  if (source === "custom") return effort === "off" ? lowest("minimal") : level(effort);
  if (source === "deepseek") return effort === "off" ? refuse("DeepSeek has no effort below low") : level(effort === "medium" ? "high" : effort);
  if (source !== "openrouter" && !LEVEL_SOURCES.has(source)) return refuse(`this connection (${source || "unknown source"}) cannot change reasoning`);
  if (effort !== "off") return level(effort);
  const off = OFF_VALUES[source];
  return off ? lowest(off) : refuse(`this connection (${source}) cannot switch reasoning off`);
}

export function reasoningPayload(route: ReasoningRoute | null, effort: ReasoningEffort): ReasoningPlan {
  if (effort === "default") return NOTHING;
  if (!route?.api) return refuse("the profile has no API this can read");
  if (route.api === "text") return refuse("a Text Completion connection sends a raw prompt; reasoning cannot be changed per request");
  return chatPlan(route, effort);
}

export const foldIncludeBody = (parsed: unknown): Record<string, unknown> | null => {
  if (isRecord(parsed)) return { ...parsed };
  if (!Array.isArray(parsed)) return null;
  const items = parsed.filter(isRecord);
  return items.length ? Object.assign({}, ...items) as Record<string, unknown> : null;
};

export interface ReasoningRead {
  chars: number;
  tokens: number | null;
}

const textLength = (value: unknown): number => (typeof value === "string" ? value.length : 0);

const blockChars = (blocks: unknown, match: (block: Record<string, unknown>) => unknown): number =>
  Array.isArray(blocks) ? blocks.filter(isRecord).reduce((sum, block) => sum + textLength(match(block)), 0) : 0;

const usageTokens = (json: Record<string, unknown>): number | null => {
  const usage = isRecord(json.usage) ? json.usage : null;
  const details = usage && isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : null;
  if (details && typeof details.reasoning_tokens === "number") return details.reasoning_tokens;
  const gemini = isRecord(json.usageMetadata) ? json.usageMetadata.thoughtsTokenCount : undefined;
  return typeof gemini === "number" ? gemini : null;
};

export function readReasoning(json: unknown): ReasoningRead {
  if (!isRecord(json)) return { chars: 0, tokens: null };
  const choice = Array.isArray(json.choices) && isRecord(json.choices[0]) ? json.choices[0] : null;
  const message = choice && isRecord(choice.message) ? choice.message : null;
  const candidate = Array.isArray(json.candidates) && isRecord(json.candidates[0]) ? json.candidates[0] : null;
  const parts = candidate && isRecord(candidate.content) ? candidate.content.parts : null;
  const chars = textLength(message?.reasoning_content) || textLength(message?.reasoning)
    || blockChars(json.content, (block) => (block.type === "thinking" ? block.thinking : null))
    || blockChars(parts, (part) => (part.thought === true ? part.text : null));
  return { chars, tokens: usageTokens(json) };
}
