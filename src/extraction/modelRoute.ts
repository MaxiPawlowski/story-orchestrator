import type { ModelFinish, ReasoningMeter } from "@services/STAPI";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import { detectDegenerate } from "./degenerate";
import type { PassRole } from "./passRole";
import type { RequestBudget } from "./tokenMeter";

export type ModelRoute = { kind: "profile"; profileId: string; effort?: ReasoningEffort };

export type RouteResolution = { ok: true; route: ModelRoute | null; source: "role" | "fallback" } | { ok: false; profileId: string; reason: string };

export const MODEL_PASSES = [
  "read", "sceneSummary", "shortTerm", "epistemic", "ledger", "arcSummary", "canon", "supersession", "curator", "generation", "critic", "copilot", "director",
] as const;

export type ModelPass = typeof MODEL_PASSES[number];

export interface ExtractionReply {
  text: string;
  finish: ModelFinish;
  meter?: ReasoningMeter;
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
}

export interface ModelCall {
  (prompt: string, ask: ModelAsk): Promise<ExtractionReply>;
  planted?: (pass: ModelPass) => string | null;
}

export const profileRoute = (profileId: string | null | undefined): ModelRoute | null => (profileId ? { kind: "profile", profileId } : null);

export const isPlanted =(model: ModelCall, ask: ModelAsk): boolean => (ask.debugResponse ?? model.planted?.(ask.pass) ?? null) !== null;

export const isIncomplete = (reply: ExtractionReply): boolean => reply.finish === "length" || detectDegenerate(reply.text).degenerate;

export async function askReply(call: ModelCall, prompt: string, ask: ModelAsk): Promise<ExtractionReply> {
  const reply = await call(prompt, ask);
  return ask.refuseIncomplete && isIncomplete(reply) ? { ...reply, text: "" } : reply;
}

export async function askText(call: ModelCall, prompt: string, ask: ModelAsk): Promise<string> {
  return (await askReply(call, prompt, ask)).text;
}
