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
  requested: ReasoningEffort;
  supported: boolean;
  sent: string | null;
}

const NOTHING: ReasoningPlan = { payload: {}, applied: false, thinks: false, collapsed: false, unsupported: null, requested: "default", supported: true, sent: null };

const refuse = (requested: ReasoningEffort, reason: string): ReasoningPlan =>
  ({ payload: {}, applied: false, thinks: false, collapsed: false, unsupported: reason, requested, supported: false, sent: null });

const LEVEL_SOURCES = new Set(["openai", "azure_openai", "claude", "makersuite", "vertexai", "xai"]);

const OFF_VALUES: Record<string, string> = { openrouter: "none", makersuite: "min", vertexai: "min" };

export const ST_OPENAI_EFFORT_MODELS: readonly string[] = [
  "o1", "o3-mini", "o3-mini-2025-01-31", "o4-mini", "o4-mini-2025-04-16", "o3", "o3-2025-04-16",
  "gpt-5", "gpt-5-2025-08-07", "gpt-5-mini", "gpt-5-mini-2025-08-07", "gpt-5-nano", "gpt-5-nano-2025-08-07",
  "gpt-5.1", "gpt-5.1-2025-11-13", "gpt-5.1-chat-latest", "gpt-5.2", "gpt-5.2-2025-12-11", "gpt-5.2-chat-latest", "gpt-5.3-chat-latest",
  "gpt-5.4", "gpt-5.4-2026-03-05", "gpt-5.4-mini", "gpt-5.4-mini-2026-03-17", "gpt-5.4-nano", "gpt-5.4-nano-2026-03-17",
  "gpt-5.5", "gpt-5.5-2026-04-23", "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra",
];

const ST_OPENAI_FIXED_EFFORT: Record<string, string> = { "gpt-5.3-chat-latest": "medium" };

const CLAUDE_THINKING = /^claude-(3-7|opus-4|sonnet-4|haiku-4-5|opus-4-5|opus-4-6|sonnet-4-6|opus-4-7)|claude-fable|claude-(opus-5|sonnet-5)/;

const GEMINI_THINKING = (model: string) => (/^gemini-2.5-(flash|pro)/.test(model) && !/-image(-preview)?$/.test(model)) || /^gemini-3[.\d]*-(flash|pro)/.test(model);

function capability(source: string, model: string): { supported: boolean; sent: (value: string) => string } {
  if (source === "openai" || source === "azure_openai") return { supported: ST_OPENAI_EFFORT_MODELS.includes(model), sent: (value) => ST_OPENAI_FIXED_EFFORT[model] ?? value };
  if (source === "claude") return { supported: CLAUDE_THINKING.test(model), sent: (value) => value };
  if (source === "makersuite" || source === "vertexai") return { supported: GEMINI_THINKING(model), sent: (value) => value };
  if (source === "xai") return { supported: true, sent: (value) => (value === "high" ? "high" : "low") };
  return { supported: true, sent: (value) => value };
}

function customPlan(route: ReasoningRoute, effort: "off" | ReasoningLevel): ReasoningPlan {
  const body = route.includeBody ?? {};
  const kwargs = isRecord(body.chat_template_kwargs) ? body.chat_template_kwargs : {};
  const thinks = effort !== "off";
  const merged = Object.assign({}, body, { chat_template_kwargs: Object.assign({}, kwargs, { enable_thinking: thinks }) });
  const payload = { custom_include_body: JSON.stringify(merged), include_reasoning: thinks };
  return { payload, applied: true, thinks, collapsed: thinks, unsupported: null, requested: effort, supported: true, sent: `enable_thinking=${thinks}` };
}

function deepseekPlan(effort: "off" | ReasoningLevel): ReasoningPlan {
  const thinks = effort !== "off";
  const value = effort === "low" ? "low" : "high";
  const payload = thinks ? { reasoning_effort: value, include_reasoning: true } : { include_reasoning: false };
  const sent = thinks ? value : "thinking=disabled";
  return { payload, applied: true, thinks, collapsed: effort === "medium", unsupported: null, requested: effort, supported: true, sent };
}

function chatPlan(route: ReasoningRoute, effort: "off" | ReasoningLevel): ReasoningPlan {
  const source = route.source ?? "";
  if (source === "custom") return customPlan(route, effort);
  if (source === "deepseek") return deepseekPlan(effort);
  if (source !== "openrouter" && !LEVEL_SOURCES.has(source)) return refuse(effort, `${source || "this source"} is not mapped`);
  const model = route.model ?? "";
  const can = capability(source, model);
  if (!can.supported) return refuse(effort, `${source} model ${model || "(unnamed)"} takes no reasoning effort: SillyTavern strips it`);
  const value = effort === "off" ? OFF_VALUES[source] : effort;
  if (!value) return refuse(effort, `${source} cannot switch it off`);
  const thinks = effort !== "off";
  return { payload: { reasoning_effort: value, include_reasoning: thinks }, applied: true, thinks, collapsed: false, unsupported: null, requested: effort, supported: true, sent: can.sent(value) };
}

export function reasoningPayload(route: ReasoningRoute | null, effort: ReasoningEffort): ReasoningPlan {
  if (effort === "default") return NOTHING;
  if (!route?.api) return refuse(effort, "no API");
  if (route.api === "text") return refuse(effort, "Text Completion sends a raw prompt");
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

const claudeThinking = (content: unknown): number => (Array.isArray(content)
  ? content.reduce((sum: number, block) => sum + (isRecord(block) && block.type === "thinking" ? size(block.thinking) : 0), 0)
  : 0);

const geminiThoughts = (responseContent: unknown): number => {
  const parts = isRecord(responseContent) && Array.isArray(responseContent.parts) ? responseContent.parts : [];
  return parts.reduce((sum: number, part) => sum + (isRecord(part) && part.thought === true ? size(part.text) : 0), 0);
};

export function readReasoning(json: unknown): ReasoningRead {
  const choice = isRecord(json) && Array.isArray(json.choices) ? json.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : {};
  const usage = isRecord(json) && isRecord(json.usage) ? json.usage.completion_tokens_details : null;
  const tokens = isRecord(usage) ? usage.reasoning_tokens : null;
  const outOfBand = size(message.reasoning_content) || size(message.reasoning);
  const native = isRecord(json) ? claudeThinking(json.content) || geminiThoughts(json.responseContent) : 0;
  return { chars: outOfBand || native, tokens: typeof tokens === "number" ? tokens : null };
}
