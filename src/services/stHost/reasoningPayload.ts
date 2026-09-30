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

const refuse = (reason: string): ReasoningPlan => ({ payload: {}, applied: false, thinks: false, collapsed: false, unsupported: reason });

const effortSource = (payload: Record<string, unknown>, thinks: boolean): ReasoningPlan => ({ payload, applied: true, thinks, collapsed: false, unsupported: null });

const LEVEL_SOURCES = new Set(["openai", "azure_openai", "claude", "makersuite", "vertexai", "xai"]);

const OFF_VALUES: Record<string, string> = { openrouter: "none", makersuite: "min", vertexai: "min" };

function customPlan(route: ReasoningRoute, effort: "off" | ReasoningLevel): ReasoningPlan {
  const body = route.includeBody ?? {};
  const kwargs = isRecord(body.chat_template_kwargs) ? body.chat_template_kwargs : {};
  const thinks = effort !== "off";
  const merged = Object.assign({}, body, { chat_template_kwargs: Object.assign({}, kwargs, { enable_thinking: thinks }) });
  const payload = { custom_include_body: JSON.stringify(merged), include_reasoning: thinks };
  return { payload, applied: true, thinks, collapsed: thinks, unsupported: null };
}

const level = (value: string): ReasoningPlan => effortSource({ reasoning_effort: value, include_reasoning: true }, true);

const lowest = (value: string): ReasoningPlan => effortSource({ reasoning_effort: value, include_reasoning: false }, false);

function chatPlan(route: ReasoningRoute, effort: "off" | ReasoningLevel): ReasoningPlan {
  const source = route.source ?? "";
  if (source === "custom") return customPlan(route, effort);
  if (source !== "openrouter" && !LEVEL_SOURCES.has(source)) return refuse(`${source || "this source"} is not mapped`);
  if (effort !== "off") return level(effort);
  const off = OFF_VALUES[source];
  return off ? lowest(off) : refuse(`${source} cannot switch it off`);
}

export function reasoningPayload(route: ReasoningRoute | null, effort: ReasoningEffort): ReasoningPlan {
  if (effort === "default") return NOTHING;
  if (!route?.api) return refuse("no API");
  if (route.api === "text") return refuse("Text Completion sends a raw prompt");
  return chatPlan(route, effort);
}

export const foldIncludeBody = (parsed: unknown): Record<string, unknown> | null => {
  if (isRecord(parsed)) return Object.assign({}, parsed);
  if (!Array.isArray(parsed)) return null;
  const items = parsed.filter(isRecord);
  return items.length ? Object.assign({}, ...items) as Record<string, unknown> : null;
};

export interface ReasoningRead {
  chars: number;
  tokens: number | null;
}

const size = (value: unknown): number => (typeof value === "string" ? value.length : 0);

export function readReasoning(json: unknown): ReasoningRead {
  const choice = isRecord(json) && Array.isArray(json.choices) ? json.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : {};
  const usage = isRecord(json) && isRecord(json.usage) ? json.usage.completion_tokens_details : null;
  const tokens = isRecord(usage) ? usage.reasoning_tokens : null;
  return { chars: size(message.reasoning_content) || size(message.reasoning), tokens: typeof tokens === "number" ? tokens : null };
}
