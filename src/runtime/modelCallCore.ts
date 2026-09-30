import { ModelCallError } from "@extraction/modelError";
import type { PassRole } from "@extraction/passRole";
import type { ModelFailureKind, ReasoningMeter } from "@services/STAPI";
import { routeKey, type ExtractionReply, type ModelAsk, type ModelCall, type ModelPass, type ModelRoute } from "@extraction/modelRoute";
import type { RouteReply } from "@extraction/reply";
import { fallbackRoute, resolveRoute, type HarnessListed, type RouteSettings } from "./passProfiles";
import type { ModelCallRecord } from "./modelCallLog";

const DEBUG_RESPONSES: Record<ModelPass, () => string | null | undefined> = {
  read: () => globalThis.storyOrchestratorDebugExtractionResponse,
  sceneSummary: () => globalThis.storyOrchestratorDebugSceneSummaryResponse,
  shortTerm: () => globalThis.storyOrchestratorDebugShortTermResponse,
  epistemic: () => globalThis.storyOrchestratorDebugEpistemicResponse,
  ledger: () => globalThis.storyOrchestratorDebugLedgerResponse,
  arcSummary: () => globalThis.storyOrchestratorDebugArcSummaryResponse,
  canon: () => globalThis.storyOrchestratorDebugCanonResponse,
  supersession: () => globalThis.storyOrchestratorDebugSupersessionResponse,
  curator: () => globalThis.storyOrchestratorDebugCuratorResponse,
  generation: () => globalThis.storyOrchestratorDebugGenerationResponse,
  critic: () => globalThis.storyOrchestratorDebugGenerationResponse,
  copilot: () => globalThis.storyOrchestratorDebugCopilotResponse,
  director: () => globalThis.storyOrchestratorDebugDirectorResponse,
};

export const debugResponseFor = (pass: ModelPass): string | null => (__SO_DEV__ ? DEBUG_RESPONSES[pass]() ?? null : null);

export interface ModelCallDeps {
  settings: () => RouteSettings;
  exists: (profileId: string) => boolean;
  listed?: HarnessListed;
  planted?: boolean;
  observe?: (role: PassRole, call: RoleCallObservation) => void;
  record?: (record: ModelCallRecord) => void;
}

type Effort = NonNullable<ModelRoute["effort"]>;

export type RoleCallObservation =
  | { outcome: "answered"; profileId: string; effort: Effort; meter: ReasoningMeter | null }
  | { outcome: "reasoning-exhausted"; profileId: string; effort: Effort; detail: string }
  | { outcome: "auth" | "quota"; profileId: string; effort: Effort; detail: string };

export const FALLBACK_KINDS: ReadonlySet<ModelFailureKind> = new Set(["auth", "quota", "transport", "timeout"]);

const recordOf = (ask: ModelAsk, route: ModelRoute, startedAt: number, result: ModelCallRecord["result"], answer?: ExtractionReply): ModelCallRecord => {
  const record: ModelCallRecord = {
    at: new Date(startedAt).toISOString(), role: ask.role, pass: ask.pass, route: routeKey(route), result, ms: Date.now() - startedAt,
    samplers: route.kind === "profile" ? "applied" : "not-applied",
  };
  if (typeof answer?.spawnMs === "number") record.spawnMs = answer.spawnMs;
  if (typeof answer?.usage?.input === "number") record.inputTokens = answer.usage.input;
  if (typeof answer?.usage?.output === "number") record.outputTokens = answer.usage.output;
  if (typeof answer?.usage?.costUsd === "number") record.costUsd = answer.usage.costUsd;
  return record;
};

export const createModelCallVia = (reply: RouteReply, deps: ModelCallDeps): ModelCall => {
  const planted = deps.planted === false ? () => null : debugResponseFor;
  const call: ModelCall = async (prompt, ask) => {
    const debugResponse = ask.debugResponse ?? planted(ask.pass);
    if (debugResponse !== null) return reply(prompt, null, { debugResponse });
    const settings = deps.settings();
    const resolution = resolveRoute(settings, ask.role, deps.exists, deps.listed);
    if (!resolution.ok) throw new ModelCallError("config", resolution.reason, resolution.profileId);
    const route = resolution.route;
    const observe = deps.observe && route ? deps.observe.bind(null, ask.role) : null;
    const seen = { profileId: route ? routeKey(route) : "", effort: route?.effort ?? "default" };
    const options = {
      maxTokens: ask.maxTokens, temperature: ask.temperature, signal: ask.signal, timeoutScale: ask.timeoutScale, budgetKind: ask.budgetKind, reasoningBudget: settings.reasoningBudget, role: ask.role,
    };
    const startedAt = Date.now();
    try {
      const answer = await reply(prompt, route, options);
      if (route) deps.record?.(recordOf(ask, route, startedAt, "ok", answer));
      if (observe) observe(Object.assign({ outcome: "answered" as const, meter: answer.meter ?? null }, seen));
      return answer;
    } catch (error) {
      const kind = error instanceof ModelCallError ? error.kind : null;
      if (route && kind) deps.record?.(recordOf(ask, route, startedAt, kind));
      if (observe && kind === "reasoning-exhausted") observe(Object.assign({ outcome: "reasoning-exhausted" as const, detail: (error as Error).message }, seen));
      if (observe && (kind === "auth" || kind === "quota")) observe(Object.assign({ outcome: kind, detail: (error as Error).message }, seen));
      const fallback = route?.kind === "harness" && kind && FALLBACK_KINDS.has(kind) ? fallbackRoute(settings, ask.role, deps.exists) : null;
      if (!route || !fallback) throw error;
      const fallbackStarted = Date.now();
      const answer = await reply(prompt, fallback, options);
      deps.record?.({ ...recordOf(ask, fallback, fallbackStarted, "fallback", answer), fallbackFrom: routeKey(route) });
      return answer;
    }
  };
  call.planted = planted;
  return call;
};
