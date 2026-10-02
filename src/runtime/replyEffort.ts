import type { NormalizedStoryV2 } from "@engine/index";
import type { ThinkingTemplate } from "@services/stHost/llamaCpp";
import { foldIncludeBody } from "@services/stHost/reasoningPayload";
import { isRecord } from "@utils/guards";
import type { ReplyEffort } from "@utils/reasoningEffort";
import { applyReasoningOverlay, type SamplerApi } from "@utils/samplerKeys";
import { isLoudRequest, type SamplerRequest } from "./samplerOverlay";

export const REPLY_EFFORT_BUDGETS: Readonly<Record<Exclude<ReplyEffort, "high">, number>> = { off: 1, low: 128, medium: 400 };

export const REASONING_BUDGET_MESSAGE = "\nTime to write the reply.\n";

export const TEXTGEN_BUDGET_KEYS: readonly string[] = [
  "reasoning_budget_tokens", "reasoning_budget_start_tag", "reasoning_budget_end_tags", "reasoning_budget_message", "generation_prompt",
];

export const LLAMA_TEXTGEN_TYPE = "llamacpp";

export const LLAMA_MODEL_OWNER = "llamacpp";

export type EffortSource = "install" | "checkpoint";

export interface EffortArm {
  chatId: string;
  checkpointId: string | null;
  level: ReplyEffort;
  source: EffortSource;
}

export interface EffortTarget {
  storyChat: string | null;
  checkpointId: string | null;
  story: NormalizedStoryV2 | null;
  fallback: ReplyEffort;
  checkpointOverride: boolean;
}

export interface EffortRequest extends SamplerRequest {
  checkpointId: string | null;
}

export interface EffortHost {
  template: ThinkingTemplate | null;
  models: Record<string, unknown>[];
  parse: (text: string) => unknown;
}

export interface EffortShot {
  level: ReplyEffort;
  source: EffortSource;
  api: SamplerApi;
  backend: string | null;
  set: string[];
  budget: number | null;
  idle: string | null;
  unsupported: string | null;
}

export interface EffortView extends EffortArm {
  applied: number;
  last: EffortShot | null;
}

interface Plan {
  backend: string | null;
  values: Record<string, unknown>;
  budget: number | null;
  idle: string | null;
  unsupported: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

const idle = (backend: string | null, reason: string): Plan => ({ backend, values: {}, budget: null, idle: reason, unsupported: null });

const refused = (backend: string | null, reason: string): Plan => ({ backend, values: {}, budget: null, idle: null, unsupported: reason });

const budgetOf = (level: ReplyEffort): number | null => (level === "high" ? null : REPLY_EFFORT_BUDGETS[level]);

export const armFor = (target: EffortTarget): EffortArm | null => {
  if (!target.storyChat || !target.story) return null;
  const authored = target.checkpointOverride && target.checkpointId ? target.story.checkpointById[target.checkpointId]?.effects?.reasoning : undefined;
  return { chatId: target.storyChat, checkpointId: target.checkpointId, level: authored ?? target.fallback, source: authored ? "checkpoint" : "install" };
};

export const thoughtOpener = (prompt: unknown, template: ThinkingTemplate | null): string | null => {
  if (typeof prompt !== "string" || !template || !template.prefix.trim() || !template.suffix.trim()) return null;
  if (prompt.endsWith(template.prefix)) return template.prefix;
  const bare = template.prefix.trimEnd();
  return prompt.endsWith(bare) ? bare : null;
};

export const servesLlamaCpp = (models: Record<string, unknown>[], model: string | null): boolean => {
  const named = models.filter((entry) => entry.id === model);
  const rows = named.length ? named : models;
  return rows.length > 0 && rows.every((entry) => entry.owned_by === LLAMA_MODEL_OWNER);
};

export function textgenPlan(payload: Record<string, unknown>, level: ReplyEffort, template: ThinkingTemplate | null): Plan {
  const backend = text(payload.api_type);
  const opener = thoughtOpener(payload.prompt, template);
  if (!opener || !template) return idle(backend, "the prompt does not open a thought");
  if (backend !== LLAMA_TEXTGEN_TYPE) return refused(backend, `${backend ?? "this backend"} takes no per-request reasoning budget; only llama.cpp does`);
  const budget = budgetOf(level);
  if (budget === null) return { backend, values: {}, budget, idle: null, unsupported: null };
  return {
    backend,
    values: {
      reasoning_budget_tokens: budget,
      reasoning_budget_start_tag: opener.trimEnd(),
      reasoning_budget_end_tags: [template.suffix.trim()],
      reasoning_budget_message: budget > REPLY_EFFORT_BUDGETS.off ? REASONING_BUDGET_MESSAGE : "",
      generation_prompt: opener,
    },
    budget,
    idle: null,
    unsupported: null,
  };
}

export function chatPlan(payload: Record<string, unknown>, level: ReplyEffort, host: EffortHost): Plan {
  const source = text(payload.chat_completion_source);
  if (payload.include_reasoning !== true) return idle(source, "the request does not ask for reasoning");
  if (source !== "custom") return refused(source, `${source ?? "this source"} is not llama-server; no reasoning budget is sent`);
  if (!servesLlamaCpp(host.models, text(payload.model))) return refused(source, "the custom endpoint does not list llama.cpp models");
  const raw = text(payload.custom_include_body) ?? "";
  const body = raw.trim() ? foldIncludeBody(host.parse(raw)) : {};
  if (!body) return refused(source, "the request's custom_include_body could not be read, so it was left alone");
  const kwargs = isRecord(body.chat_template_kwargs) ? body.chat_template_kwargs : {};
  if (kwargs.enable_thinking === false) return idle(source, "the profile switches thinking off");
  const thinks = level !== "off";
  const budget = thinks ? budgetOf(level) : null;
  const merged: Record<string, unknown> = { ...body, chat_template_kwargs: { ...kwargs, enable_thinking: thinks } };
  if (budget !== null) merged.thinking_budget_tokens = budget;
  return { backend: source, values: { custom_include_body: JSON.stringify(merged), include_reasoning: thinks }, budget, idle: null, unsupported: null };
}

export function applyTextgenBudget(payload: Record<string, unknown>, values: Record<string, unknown>): string[] {
  const set: string[] = [];
  for (const key of TEXTGEN_BUDGET_KEYS) {
    if (!(key in values)) continue;
    payload[key] = values[key];
    set.push(key);
  }
  return set;
}

const sameArm = (left: EffortArm | null, right: EffortArm | null) =>
  left?.chatId === right?.chatId && left?.checkpointId === right?.checkpointId && left?.level === right?.level && left?.source === right?.source;

export class ReplyEffortOverlay {
  private active: EffortView | null = null;

  sync(arm: EffortArm | null) {
    if (sameArm(this.active, arm)) return;
    this.active = arm ? { ...arm, applied: 0, last: null } : null;
  }

  clear() {
    this.active = null;
  }

  view(): EffortView | null {
    return this.active ? { ...this.active, last: this.active.last ? { ...this.active.last } : null } : null;
  }

  apply(payload: Record<string, unknown>, request: EffortRequest, host: EffortHost): EffortShot | null {
    const active = this.active;
    if (!active || request.chatId !== active.chatId || request.checkpointId !== active.checkpointId || !isLoudRequest(request)) return null;
    const plan = request.api === "textgen" ? textgenPlan(payload, active.level, host.template) : chatPlan(payload, active.level, host);
    const set = request.api === "textgen" ? applyTextgenBudget(payload, plan.values) : applyReasoningOverlay(payload, plan.values).applied;
    const shot: EffortShot = { level: active.level, source: active.source, api: request.api, backend: plan.backend, set, budget: plan.budget, idle: plan.idle, unsupported: plan.unsupported };
    active.applied += 1;
    active.last = shot;
    return shot;
  }
}
