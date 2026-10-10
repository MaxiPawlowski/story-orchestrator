import { ModelCallError } from "@extraction/modelError";
import type { FailoverFailure, FailoverGate } from "@extraction/breaker";
import type { PassRole } from "@extraction/passRole";
import type { ReasoningMeter } from "@services/STAPI";
import { routeKey, UNKNOWN_USAGE, type ExtractionReply, type ModelCall, type ModelPass, type ModelRoute } from "@extraction/modelRoute";
import type { RouteReply } from "@extraction/reply";
import { resolveRoute, type HarnessListed, type RouteSettings } from "./passProfiles";
import type { ModelCallRecord } from "./modelCallLog";
import type { RunOwnership } from "./runToken";

const DEBUG_RESPONSES: Record<ModelPass, () => string | null | undefined> = {
  read: () => globalThis.storyOrchestratorDebugExtractionResponse,
  sceneSummary: () => globalThis.storyOrchestratorDebugSceneSummaryResponse,
  shortTerm: () => globalThis.storyOrchestratorDebugShortTermResponse,
  epistemic: () => globalThis.storyOrchestratorDebugEpistemicResponse,
  ledger: () => globalThis.storyOrchestratorDebugLedgerResponse,
  arcSummary: () => globalThis.storyOrchestratorDebugArcSummaryResponse,
  canon: () => globalThis.storyOrchestratorDebugCanonResponse,
  chapterSeal: () => globalThis.storyOrchestratorDebugChapterSealResponse,
  supersession: () => globalThis.storyOrchestratorDebugSupersessionResponse,
  curator: () => globalThis.storyOrchestratorDebugCuratorResponse,
  generation: () => globalThis.storyOrchestratorDebugGenerationResponse,
  critic: () => globalThis.storyOrchestratorDebugGenerationResponse,
  copilot: () => globalThis.storyOrchestratorDebugCopilotResponse,
  director: () => globalThis.storyOrchestratorDebugDirectorResponse,
  inner: () => globalThis.storyOrchestratorDebugInnerResponse,
  suggestions: () => globalThis.storyOrchestratorDebugSuggestionsResponse,
  loreCreate: () => globalThis.storyOrchestratorDebugLoreResponse,
  ask: () => globalThis.storyOrchestratorDebugAskResponse,
};

export const debugResponseFor = (pass: ModelPass): string | null => DEBUG_RESPONSES[pass]() ?? null;

export interface ModelCallDeps {
  settings: () => RouteSettings;
  exists: (profileId: string) => boolean;
  listed?: HarnessListed;
  planted?: boolean;
  observe?: (role: PassRole, call: RoleCallObservation) => void;
  record?: (record: ModelCallRecord) => void;
  ownership?: RunOwnership;
  stamp?: () => { chatId: string | null; messageId: number };
  gate?: FailoverGate;
  label?: (profileId: string) => string;
}

type Effort = NonNullable<ModelRoute["effort"]>;

export type RoleCallObservation =
  | { outcome: "answered"; profileId: string; effort: Effort; meter: ReasoningMeter | null }
  | { outcome: "reasoning-exhausted" | "auth" | "quota"; profileId: string; effort: Effort; detail: string };

export type NoteCall = (route: ModelRoute, startedAt: number, result: ModelCallRecord["result"], answer?: ExtractionReply, fallbackFrom?: string) => void;

const OBSERVED = ["reasoning-exhausted", "auth", "quota"];
const FALLBACK_KINDS = ["auth", "quota", "transport", "timeout"];
const FAILOVER_KINDS = ["transport", "timeout"];
const LAPSED_BEFORE_FALLBACK = "the call's chat went away before the fallback could answer";

const divert = (route: ModelRoute | null, fallback: ModelRoute | null, gate: FailoverGate | undefined): boolean =>
  Boolean(route && fallback && gate && gate.open(routeKey(route)) && !gate.open(routeKey(fallback)));

const retries = (used: ModelRoute, kind: string, diverted: boolean, fallback: ModelRoute | null, gate: FailoverGate | undefined): boolean =>
  (used.kind === "harness" ? FALLBACK_KINDS.includes(kind) : !diverted && FAILOVER_KINDS.includes(kind) && fallback !== null && !gate?.open(routeKey(fallback)));

const noteFailover = (gate: FailoverGate | undefined, used: ModelRoute, kind: string, error: unknown) => {
  if (gate && used.kind === "profile" && FAILOVER_KINDS.includes(kind)) gate.failed(used.profileId, kind as FailoverFailure, (error as Error).message);
};

export const failoverRoute = (route: ModelRoute | null, fallbackId: string | null | undefined, exists: (profileId: string) => boolean): ModelRoute | null =>
  (route?.kind === "profile" && fallbackId && fallbackId !== route.profileId && exists(fallbackId) ? { ...route, profileId: fallbackId } : null);

export const createModelCallVia = (reply: RouteReply, deps: ModelCallDeps): ModelCall => {
  const planted = deps.planted === false ? () => null : debugResponseFor;
  const call: ModelCall = async (prompt, ask) => {
    const debugResponse = ask.debugResponse ?? planted(ask.pass);
    if (debugResponse !== null) return reply(prompt, null, { debugResponse });
    const settings = deps.settings();
    const resolution = resolveRoute(settings, ask.role, deps.exists, deps.listed);
    if (!resolution.ok) throw new ModelCallError("config", resolution.reason, resolution.profileId);
    const route = resolution.route;
    const fallback = failoverRoute(route, settings.fallbackProfileId, deps.exists);
    const gate = deps.gate;
    const diverted = divert(route, fallback, gate);
    const used = diverted ? fallback : route;
    const from = diverted && route ? routeKey(route) : undefined;
    const observe = deps.observe && route && !diverted ? deps.observe.bind(null, ask.role) : null;
    const seen = { profileId: route ? routeKey(route) : "", effort: route?.effort ?? "default" };
    const options = {
      maxTokens: ask.maxTokens, temperature: ask.temperature, signal: ask.signal, timeoutScale: ask.timeoutScale, budgetKind: ask.budgetKind, reasoningBudget: settings.reasoningBudget, role: ask.role,
    };
    const token = deps.ownership ? deps.ownership.mint() : null;
    const stamp = deps.stamp?.();
    const recordCall: NoteCall = (used, startedAt, result, answer, fallbackFrom) => {
      if (!deps.record || (token && deps.ownership && !deps.ownership.check(token).ok)) return;
      deps.record({
        at: new Date(startedAt).toISOString(), role: ask.role, pass: ask.pass, route: routeKey(used), result, ms: Date.now() - startedAt,
        samplers: used.kind === "profile" ? "applied" : "not-applied", ...(answer ? { usage: answer.usage ?? UNKNOWN_USAGE, model: answer.model ?? null } : {}),
        spawnMs: answer && answer.spawnMs, fallbackFrom, ...stamp,
      });
    };
    const fallBack = async (error: unknown, from: ModelRoute, fixed?: ModelRoute | null) => (await import("./harnessFallback")).answerFallback({
      error, route: from, settings, role: ask.role, exists: deps.exists, run: (next) => reply(prompt, next, options), note: recordCall, label: deps.label,
      ...(fixed !== undefined ? { fallback: fixed } : {}),
    });
    if (ask.onFailure && route) return fallBack(new ModelCallError(ask.onFailure.kind, ask.onFailure.reason, routeKey(route)), route);
    const startedAt = Date.now();
    try {
      const answer = await reply(prompt, used, options);
      if (used) recordCall(used, startedAt, diverted ? "fallback" : "ok", answer, from);
      if (observe) observe(Object.assign({ outcome: "answered" as const, meter: answer.meter ?? null }, seen));
      return answer;
    } catch (error) {
      const kind = error instanceof ModelCallError ? error.kind : null;
      if (!used || !kind) throw error;
      recordCall(used, startedAt, kind, undefined, from);
      if (observe && OBSERVED.includes(kind)) observe(Object.assign({ outcome: kind as "auth", detail: (error as Error).message }, seen));
      noteFailover(gate, used, kind, error);
      if (!retries(used, kind, diverted, fallback, gate)) throw error;
      if (used.kind === "profile" && token && deps.ownership && !deps.ownership.check(token).ok) throw new ModelCallError("lapsed", LAPSED_BEFORE_FALLBACK, routeKey(used));
      return fallBack(error, used, used.kind === "profile" ? fallback : undefined);
    }
  };
  call.planted = planted;
  return call;
};
