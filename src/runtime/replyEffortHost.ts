import type { NormalizedStoryV2 } from "@engine/index";
import { observeSamplerPayloads, parseHostYaml, type SamplerPayloadHandlers } from "@services/STAPI";
import { listedModels, readThinkingTemplate } from "@services/stHost/llamaCpp";
import type { ReplyEffort } from "@utils/reasoningEffort";
import { DEFAULT_REPLY_EFFORT } from "@utils/replyEffort";
import type { SamplerApi } from "@utils/samplerKeys";
import type { WriteResult } from "@utils/writeResult";
import type { GenerationLifecycleSnapshot } from "./generationLifecycle";
import { publishSpikeDebug } from "./spikeDebug";
import { armFor, ReplyEffortOverlay, type EffortHost, type EffortRequest, type EffortShot, type EffortView } from "./replyEffort";
import { repairThoughtLeak, type RepairedReply } from "./thoughtLeak";

export const EFFORT_SHOT_RING = 50;

export interface EffortShotRecord extends EffortShot {
  at: number;
  chatId: string | null;
  checkpointId: string | null;
  type: string | null;
}

export interface EffortDebug {
  view: () => EffortView | null;
  shots: () => EffortShotRecord[];
}

export interface ReplyText extends RepairedReply {
  isUser: boolean;
}

export interface ReplyAccess {
  observe: (handler: (messageId: number) => void) => () => void;
  read: (messageId: number) => ReplyText | null;
  write: (messageId: number, text: RepairedReply) => WriteResult;
}

export const LEAK_REPAIRED = "A reply's thinking ran past its budget; the leaked planning was moved back into the thought";

export interface ReplyEffortWiring {
  effort: () => ReplyEffort | undefined;
  checkpointOverride: () => boolean;
  storyChat: () => string | null;
  openChat: () => string | null;
  checkpointId: () => string | null;
  story: () => NormalizedStoryV2 | null;
  generation: () => GenerationLifecycleSnapshot;
  journal: (summary: string, note: string) => void;
  now?: () => number;
  observe?: (handlers: SamplerPayloadHandlers) => () => void;
  host?: () => EffortHost;
  publish?: (debug: EffortDebug) => () => void;
  replies?: ReplyAccess;
}

const liveHost = (): EffortHost => ({ template: readThinkingTemplate(), models: listedModels(), parse: parseHostYaml });

const shotNote = (shot: EffortShot): string => [
  shot.backend ? `backend ${shot.backend}` : "",
  shot.budget === null ? "no budget" : `budget ${shot.budget}`,
  `set ${shot.set.join(", ") || "nothing"}`,
].filter(Boolean).join("; ");

const outcome = (shot: EffortShot) => [shot.level, shot.source, shot.api, shot.backend, shot.unsupported ?? "", shot.set.join(",")].join("|");

export function startReplyEffort(deps: ReplyEffortWiring): () => void {
  const overlay = new ReplyEffortOverlay();
  const shots: EffortShotRecord[] = [];
  const now = deps.now ?? (() => Date.now());
  const host = deps.host ?? liveHost;
  let journaled: string | null = null;
  let budgeted: string | null = null;
  const sync = () => {
    const fallback = deps.effort() ?? DEFAULT_REPLY_EFFORT;
    overlay.sync(armFor({ storyChat: deps.storyChat(), checkpointId: deps.checkpointId(), story: deps.story(), fallback, checkpointOverride: deps.checkpointOverride() }));
    return overlay.view();
  };
  const request = (api: SamplerApi, type: string | null, dryRun: boolean): EffortRequest => {
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
  const record = (shot: EffortShot, asked: EffortRequest, type: string | null) => {
    shots.push({ ...shot, at: now(), chatId: asked.chatId, checkpointId: asked.checkpointId, type });
    if (shot.budget !== null && shot.set.length) budgeted = asked.chatId;
    else if (!shot.idle && budgeted === asked.chatId) budgeted = null;
    if (shots.length > EFFORT_SHOT_RING) shots.shift();
    const key = `${asked.chatId}|${asked.checkpointId}|${outcome(shot)}`;
    if (shot.idle || key === journaled) return;
    journaled = key;
    const origin = shot.source === "checkpoint" ? "this checkpoint's" : "the install-wide";
    deps.journal(
      shot.unsupported ? `Reply thinking "${shot.level}" (${origin} setting) could not be applied` : `Reply thinking "${shot.level}" (${origin} setting) applied to the replies`,
      shot.unsupported ?? shotNote(shot),
    );
  };
  const handle = (payload: Record<string, unknown>, api: SamplerApi, type: string | null, dryRun: boolean) => {
    if (!sync()) return;
    const asked = request(api, type, dryRun);
    const shot = overlay.apply(payload, asked, host());
    if (shot) record(shot, asked, type);
  };
  const stop = (deps.observe ?? observeSamplerPayloads)({
    textgen: (payload, dryRun) => handle(payload, "textgen", null, dryRun),
    chat: (payload) => handle(payload, "chat", typeof payload.type === "string" ? payload.type : null, false),
  });
  const repair = (messageId: number) => {
    const access = deps.replies;
    const template = host().template;
    const chatId = deps.openChat();
    if (!access || !template || !chatId || chatId !== budgeted) return;
    const reply = access.read(messageId);
    const fixed = reply && !reply.isUser ? repairThoughtLeak(reply.mes, reply.reasoning, template.suffix) : null;
    if (!fixed || !access.write(messageId, fixed).ok) return;
    deps.journal(LEAK_REPAIRED, `message ${messageId}: ${fixed.reasoning.length - (reply?.reasoning.length ?? 0)} characters moved from the reply into its thought`);
  };
  const unobserve = deps.replies?.observe(repair) ?? (() => undefined);
  const publish = deps.publish ?? (__SO_DEV__ ? (debug: EffortDebug) => publishSpikeDebug({ reasoningEffect: debug }) : null);
  const unpublish = publish?.({ view: sync, shots: () => shots.map((shot) => ({ ...shot, set: [...shot.set] })) }) ?? (() => undefined);
  return () => {
    stop();
    unobserve();
    overlay.clear();
    unpublish();
  };
}
