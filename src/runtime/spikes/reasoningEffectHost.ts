import type { NormalizedStoryV2 } from "@engine/index";
import { observeSamplerPayloads, parseHostYaml, type SamplerPayloadHandlers } from "@services/STAPI";
import type { SamplerApi } from "@utils/samplerKeys";
import type { GenerationLifecycleSnapshot } from "../generationLifecycle";
import { publishSpikeDebug } from "../spikeDebug";
import { armFor, ReasoningEffect, type ReasoningEffectView, type ReasoningRequest, type ReasoningShot } from "./reasoningEffect";

export const REASONING_SHOT_RING = 50;

export interface ReasoningShotRecord extends ReasoningShot {
  at: number;
  chatId: string | null;
  checkpointId: string | null;
  type: string | null;
}

export interface ReasoningEffectDebug {
  view: () => ReasoningEffectView | null;
  shots: () => ReasoningShotRecord[];
}

export interface ReasoningEffectWiring {
  enabled: () => boolean;
  storyChat: () => string | null;
  openChat: () => string | null;
  checkpointId: () => string | null;
  story: () => NormalizedStoryV2 | null;
  generation: () => GenerationLifecycleSnapshot;
  journal: (summary: string, note: string) => void;
  now?: () => number;
  observe?: (handlers: SamplerPayloadHandlers) => () => void;
  parse?: (text: string) => unknown;
  publish?: (debug: { reasoningEffect: ReasoningEffectDebug }) => () => void;
}

const shotNote = (shot: ReasoningShot): string => [
  `set ${shot.applied.join(", ") || "nothing"}`,
  shot.skipped.length ? `not in this request: ${shot.skipped.join(", ")}` : "",
  shot.collapsed ? "this connection only switches thinking on or off" : "",
].filter(Boolean).join("; ");

export function startReasoningEffect(deps: ReasoningEffectWiring): () => void {
  const effect = new ReasoningEffect();
  const shots: ReasoningShotRecord[] = [];
  const parse = deps.parse ?? parseHostYaml;
  const now = deps.now ?? (() => Date.now());
  const sync = () => {
    effect.sync(armFor({ enabled: deps.enabled(), chatId: deps.storyChat(), checkpointId: deps.checkpointId(), story: deps.story() }));
    return effect.view();
  };
  const request = (api: SamplerApi, type: string | null, dryRun: boolean): ReasoningRequest => {
    const open = deps.generation();
    return {
      api,
      chatId: deps.openChat(),
      checkpointId: deps.checkpointId(),
      type,
      dryRun,
      open: open.outermost !== null,
      innermost: open.nested.length ? open.nested[open.nested.length - 1] : open.outermost?.type ?? null,
    };
  };
  const handle = (payload: Record<string, unknown>, api: SamplerApi, type: string | null, dryRun: boolean) => {
    if (!sync()) return;
    const asked = request(api, type, dryRun);
    const shot = effect.apply(payload, asked, parse);
    if (!shot) return;
    shots.push({ ...shot, at: now(), chatId: asked.chatId, checkpointId: asked.checkpointId, type });
    if (shots.length > REASONING_SHOT_RING) shots.shift();
    if (effect.view()?.applied !== 1) return;
    deps.journal(`Reasoning effect "${shot.level}" ${shot.unsupported ? "could not be applied" : "applied"} to this checkpoint's replies (spike)`, shot.unsupported ?? shotNote(shot));
  };
  const stop = (deps.observe ?? observeSamplerPayloads)({
    textgen: (payload, dryRun) => handle(payload, "textgen", null, dryRun),
    chat: (payload) => handle(payload, "chat", typeof payload.type === "string" ? payload.type : null, false),
  });
  const unpublish = (deps.publish ?? publishSpikeDebug)({ reasoningEffect: { view: sync, shots: () => shots.map((shot) => ({ ...shot })) } });
  return () => {
    stop();
    effect.clear();
    unpublish();
  };
}
