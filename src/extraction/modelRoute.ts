import type { ModelFailureKind, ModelFinish, ReasoningMeter } from "@services/STAPI";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import { harnessKey, parseHarnessKey, type HarnessId } from "@utils/harness";
import { detectDegenerate } from "./degenerate";
import type { PassRole } from "./passRole";
import type { RequestBudget } from "./tokenMeter";

export interface HarnessRouteOptions {
  timeoutScale?: number;
}

export type ModelRoute =
  | { kind: "profile"; profileId: string; effort?: ReasoningEffort }
  | { kind: "harness"; harness: HarnessId; model: string; effort?: ReasoningEffort; options?: HarnessRouteOptions };

export const routeKey = (route: ModelRoute): string => (route.kind === "profile" ? route.profileId : harnessKey(route.harness, route.model));

export interface CallUsage {
  input: number | null;
  output: number | null;
  costUsd: number | null;
}

export const UNKNOWN_USAGE: CallUsage = Object.freeze({ input: null, output: null, costUsd: null });

export const usageKnown = (usage: CallUsage | undefined): usage is CallUsage => usage !== undefined && (usage.input !== null || usage.output !== null || usage.costUsd !== null);

export type RouteResolution = { ok: true; route: ModelRoute | null; source: "role" | "default" | "fallback" } | { ok: false; profileId: string; reason: string };

export const MODEL_PASSES = [
  "read", "sceneSummary", "shortTerm", "epistemic", "ledger", "arcSummary", "canon", "chapterSeal", "supersession", "curator", "generation", "critic", "copilot",
  "director", "inner", "suggestions", "loreCreate", "ask", "briefing", "living",
] as const;

export type ModelPass = typeof MODEL_PASSES[number];

export interface FellBack {
  from: string;
  fromLabel: string;
  kind: string;
  reason: string;
  by: string;
  label: string;
  model: string | null;
}

export const routeLabel = (key: string, label: (profileId: string) => string = (id) => id): string => {
  const harness = parseHarnessKey(key);
  return harness ? `${harness.harness} · ${harness.model}` : label(key);
};

export const fellBackText = (fellBack: FellBack): string =>
  `${fellBack.fromLabel} could not answer (${fellBack.reason}), so ${fellBack.label}${fellBack.model ? ` (${fellBack.model})` : ""} answered instead.`;

export interface ExtractionReply {
  text: string;
  finish: ModelFinish;
  meter?: ReasoningMeter;
  usage?: CallUsage;
  model?: string | null;
  spawnMs?: number | null;
  fellBack?: FellBack;
}

export interface ModelAsk {
  role: PassRole;
  pass: ModelPass;
  maxTokens?: number;
  signal?: AbortSignal;
  refuseIncomplete?: boolean;
  timeoutScale?: number;
  budgetKind?: string;
  budget?: RequestBudget;
  temperature?: number;
  debugResponse?: string | null;
  onFailure?: { kind: ModelFailureKind; reason: string };
}

export interface ModelCall {
  (prompt: string, ask: ModelAsk): Promise<ExtractionReply>;
  planted?: (pass: ModelPass) => string | null;
}

export const profileRoute = (profileId: string | null | undefined): ModelRoute | null => {
  const harness = profileId ? parseHarnessKey(profileId) : null;
  if (harness) return { kind: "harness", ...harness };
  return profileId ? { kind: "profile", profileId } : null;
};

export const isPlanted =(model: ModelCall, ask: ModelAsk): boolean => (ask.debugResponse ?? model.planted?.(ask.pass) ?? null) !== null;

export const isIncomplete = (reply: ExtractionReply): boolean => reply.finish === "length" || detectDegenerate(reply.text).degenerate;

export async function askReply(call: ModelCall, prompt: string, ask: ModelAsk): Promise<ExtractionReply> {
  const reply = await call(prompt, ask);
  return ask.refuseIncomplete && isIncomplete(reply) ? { ...reply, text: "" } : reply;
}

export async function askText(call: ModelCall, prompt: string, ask: ModelAsk): Promise<string> {
  return (await askReply(call, prompt, ask)).text;
}
