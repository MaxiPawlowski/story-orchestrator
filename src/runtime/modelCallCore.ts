import { ModelCallError } from "@extraction/modelError";
import type { PassRole } from "@extraction/passRole";
import type { ReasoningMeter } from "@services/STAPI";
import type { ModelCall, ModelPass, ModelRoute } from "@extraction/modelRoute";
import type { RouteReply } from "@extraction/reply";
import { resolveRoute, type RouteSettings } from "./passProfiles";

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
  planted?: boolean;
  observe?: (role: PassRole, call: RoleCallObservation) => void;
}

export type RoleCallObservation =
  | { outcome: "answered"; profileId: string; effort: NonNullable<ModelRoute["effort"]>; meter: ReasoningMeter | null }
  | { outcome: "reasoning-exhausted"; profileId: string; effort: NonNullable<ModelRoute["effort"]>; detail: string };

export const createModelCallVia = (reply: RouteReply, deps: ModelCallDeps): ModelCall => {
  const planted = deps.planted === false ? () => null : debugResponseFor;
  const call: ModelCall = async (prompt, ask) => {
    const debugResponse = ask.debugResponse ?? planted(ask.pass);
    if (debugResponse !== null) return reply(prompt, null, { debugResponse });
    const settings = deps.settings();
    const resolution = resolveRoute(settings, ask.role, deps.exists);
    if (!resolution.ok) throw new ModelCallError("config", resolution.reason, resolution.profileId);
    const route = resolution.route;
    const observe = deps.observe && route ? deps.observe.bind(null, ask.role) : null;
    const seen = { profileId: route ? route.profileId : "", effort: route?.effort ?? "default" };
    try {
      const answer = await reply(prompt, route, {
        maxTokens: ask.maxTokens, temperature: ask.temperature, signal: ask.signal, timeoutScale: ask.timeoutScale, budgetKind: ask.budgetKind, reasoningBudget: settings.reasoningBudget,
      });
      if (observe) observe(Object.assign({ outcome: "answered" as const, meter: answer.meter ?? null }, seen));
      return answer;
    } catch (error) {
      if (observe && error instanceof ModelCallError && error.kind === "reasoning-exhausted") observe(Object.assign({ outcome: "reasoning-exhausted" as const, detail: error.message }, seen));
      throw error;
    }
  };
  call.planted = planted;
  return call;
};
