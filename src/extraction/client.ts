import { sendConnectionProfileRequest, type ModelFailureKind, type ModelFinish } from "@services/STAPI";
import { anySignal } from "@utils/signals";
import { PROBE_MAX_TOKENS, PROBE_PROMPT, PROBE_TIMEOUT_MS, type ProbeResult } from "./breaker";
import { callTimeoutMs, DEFAULT_MAX_TOKENS, estimateTokens } from "./callBudget";
import { detectDegenerate } from "./degenerate";
import { stripReasoningBlocks } from "./parse";
import type { PassRole } from "./passRole";
import type { RequestBudget } from "./tokenMeter";

export interface ExtractionClientOptions {
  profileId: string | null;
  role: PassRole;
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
  constructor(readonly kind: ModelFailureKind, message: string, readonly profileId: string | null = null) {
    super(message);
    this.name = "ModelCallError";
  }
}

export type ProfileRouter = (role: PassRole, fallback: string | null) => { ok: true; profileId: string | null } | { ok: false; profileId: string; reason: string };

let profileRouter: ProfileRouter | null = null;

/** v2.4 plan 08 T18: the runtime installs the per-role route once; unset, every call keeps its own profileId. */
export function setProfileRouter(router: ProfileRouter): () => void {
  profileRouter = router;
  return () => {
    if (profileRouter === router) profileRouter = null;
  };
}

export const routeProfile = (role: PassRole, fallback: string | null): ReturnType<ProfileRouter> => profileRouter?.(role, fallback) ?? { ok: true, profileId: fallback };

export const isLapse = (error: unknown): boolean => error instanceof ModelCallError && error.kind === "lapsed";

export async function probeModel(profileId: string): Promise<ProbeResult> {
  const reply = await sendConnectionProfileRequest(profileId, PROBE_PROMPT, PROBE_MAX_TOKENS, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  return reply.ok ? { ok: true } : { ok: false, kind: reply.kind, message: reply.message };
}

export const lapseAsEmpty = (error: unknown): string => {
  if (isLapse(error)) return "";
  throw error;
};

export async function callExtractionReply(prompt: string, options: ExtractionClientOptions): Promise<ExtractionReply> {
  if (options.debugResponse !== undefined && options.debugResponse !== null) return { text: stripReasoningBlocks(options.debugResponse), finish: "unknown" };
  const route = routeProfile(options.role, options.profileId);
  if (!route.ok) throw new ModelCallError("config", route.reason, route.profileId);
  const profileId = route.profileId;
  if (!profileId) throw new ModelCallError("config", "No memory LLM profile selected");
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = callTimeoutMs(maxTokens, estimateTokens(prompt));
  const reply = await sendConnectionProfileRequest(profileId, prompt, maxTokens, {
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs)]),
    samplers: { temperature: options.temperature ?? 0.1, top_p: 0.9 },
  });
  if (!reply.ok) throw new ModelCallError(reply.kind, reply.kind === "timeout" ? `the memory model did not answer within ${timeoutMs} ms` : reply.message, profileId);
  return { text: stripReasoningBlocks(reply.text), finish: reply.finish };
}

export const isIncomplete = (reply: ExtractionReply): boolean => reply.finish === "length" || detectDegenerate(reply.text).degenerate;

export async function callExtractionModel(prompt: string, options: ExtractionClientOptions): Promise<string> {
  const reply = await callExtractionReply(prompt, options);
  return options.refuseIncomplete && isIncomplete(reply) ? "" : reply.text;
}
