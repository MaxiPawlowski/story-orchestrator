import { ModelCallError } from "@extraction/modelError";
import type { PassRole } from "@extraction/passRole";
import type { ReasoningMeter } from "@services/STAPI";
import { routeKey, type ExtractionReply, type ModelCall, type ModelPass, type ModelRoute } from "@extraction/modelRoute";
import type { RouteReply } from "@extraction/reply";
import { resolveRoute, type HarnessListed, type RouteSettings } from "./passProfiles";
import type { ModelCallRecord } from "./modelCallLog";

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
  | { outcome: "reasoning-exhausted" | "auth" | "quota"; profileId: string; effort: Effort; detail: string };

export type NoteCall = (route: ModelRoute, startedAt: number, result: ModelCallRecord["result"], answer?: ExtractionReply, fallbackFrom?: string) => void;

const OBSERVED = ["reasoning-exhausted", "auth", "quota"];
const FALLBACK_KINDS = ["auth", "quota", "transport", "timeout"];

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
    const note: NoteCall = (used, startedAt, result, answer, fallbackFrom) => deps.record && deps.record({
      at: new Date(startedAt).toISOString(), role: ask.role, pass: ask.pass, route: routeKey(used), result, ms: Date.now() - startedAt,
      samplers: used.kind === "profile" ? "applied" : "not-applied", usage: answer && answer.usage, spawnMs: answer && answer.spawnMs, fallbackFrom,
    });
    const startedAt = Date.now();
    try {
      const answer = await reply(prompt, route, options);
      if (route) note(route, startedAt, "ok", answer);
      if (observe) observe(Object.assign({ outcome: "answered" as const, meter: answer.meter ?? null }, seen));
      return answer;
    } catch (error) {
      const kind = error instanceof ModelCallError ? error.kind : null;
      if (!route || !kind) throw error;
      note(route, startedAt, kind);
      if (observe && OBSERVED.includes(kind)) observe(Object.assign({ outcome: kind as "auth", detail: (error as Error).message }, seen));
      if (route.kind === "profile" || !FALLBACK_KINDS.includes(kind)) throw error;
      return (await import("./harnessFallback")).answerFallback({ error, route, settings, role: ask.role, exists: deps.exists, run: (used) => reply(prompt, used, options), note });
    }
  };
  call.planted = planted;
  return call;
};
