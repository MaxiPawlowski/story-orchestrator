import type { CheckpointReasoning, NormalizedStoryV2 } from "@engine/index";
import { foldIncludeBody, reasoningPayload, type ReasoningRoute } from "@services/stHost/reasoningPayload";
import { applyReasoningOverlay } from "@utils/samplerKeys";
import { isLoudRequest, type SamplerRequest } from "../samplerOverlay";

export interface ReasoningArm {
  chatId: string;
  checkpointId: string;
  level: CheckpointReasoning;
}

export interface ReasoningTarget {
  enabled: boolean;
  chatId: string | null;
  checkpointId: string | null;
  story: NormalizedStoryV2 | null;
}

export interface ReasoningRequest extends SamplerRequest {
  checkpointId: string | null;
}

export interface ReasoningShot {
  level: CheckpointReasoning;
  source: string | null;
  applied: string[];
  skipped: string[];
  unsupported: string | null;
  collapsed: boolean;
}

export interface ReasoningEffectView extends ReasoningArm {
  applied: number;
  last: ReasoningShot | null;
}

export const armFor = (target: ReasoningTarget): ReasoningArm | null => {
  if (!target.enabled || !target.chatId || !target.checkpointId || !target.story) return null;
  const level = target.story.checkpointById[target.checkpointId]?.effects?.reasoning;
  return level ? { chatId: target.chatId, checkpointId: target.checkpointId, level } : null;
};

const sameArm = (left: ReasoningArm | null, right: ReasoningArm | null) =>
  left?.chatId === right?.chatId && left?.checkpointId === right?.checkpointId && left?.level === right?.level;

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

export const routeFromPayload = (payload: Record<string, unknown>, parse: (text: string) => unknown): ReasoningRoute | { unreadable: string } => {
  const source = text(payload.chat_completion_source);
  const body = text(payload.custom_include_body) ?? "";
  if (source !== "custom" || !body.trim()) return { api: "chat", source, model: text(payload.model), includeBody: null };
  const includeBody = foldIncludeBody(parse(body));
  return includeBody ? { api: "chat", source, model: text(payload.model), includeBody } : { unreadable: "the request's custom_include_body could not be read, so it was left alone" };
};

export class ReasoningEffect {
  private active: ReasoningEffectView | null = null;

  sync(arm: ReasoningArm | null) {
    if (sameArm(this.active, arm)) return;
    this.active = arm ? { ...arm, applied: 0, last: null } : null;
  }

  clear() {
    this.active = null;
  }

  view(): ReasoningEffectView | null {
    return this.active ? { ...this.active, last: this.active.last ? { ...this.active.last } : null } : null;
  }

  apply(payload: Record<string, unknown>, request: ReasoningRequest, parse: (text: string) => unknown): ReasoningShot | null {
    const active = this.active;
    if (!active || request.chatId !== active.chatId || request.checkpointId !== active.checkpointId || !isLoudRequest(request)) return null;
    const shot = this.shoot(active.level, payload, request, parse);
    active.applied += 1;
    active.last = shot;
    return shot;
  }

  private shoot(level: CheckpointReasoning, payload: Record<string, unknown>, request: ReasoningRequest, parse: (text: string) => unknown): ReasoningShot {
    const refused = (source: string | null, unsupported: string): ReasoningShot => ({ level, source, applied: [], skipped: [], unsupported, collapsed: false });
    if (request.api !== "chat") return refused(null, "Text Completion sends a raw prompt");
    const route = routeFromPayload(payload, parse);
    if ("unreadable" in route) return refused("custom", route.unreadable);
    const plan = reasoningPayload(route, level);
    if (plan.unsupported) return refused(route.source, plan.unsupported);
    const { applied, skipped } = applyReasoningOverlay(payload, plan.payload);
    return { level, source: route.source, applied, skipped, unsupported: null, collapsed: plan.collapsed };
  }
}
