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

const exhausted = (error: unknown): error is ModelCallError => error instanceof ModelCallError && error.kind === "reasoning-exhausted";

export const createModelCallVia = (reply: RouteReply, deps: ModelCallDeps): ModelCall => {
  const planted = deps.planted === false ? () => null : debugResponseFor;
  const call: ModelCall = async (prompt, ask) => {
    const debugResponse = ask.debugResponse ?? planted(ask.pass);
    if (debugResponse !== null) return reply(prompt, null, { debugResponse });
    const settings = deps.settings();
    const resolution = resolveRoute(settings, ask.role, deps.exists);
    if (!resolution.ok) throw new ModelCallError("config", resolution.reason, resolution.profileId);
    const route = resolution.route;
    const effort = route?.effort ?? "default";
    try {
      const { maxTokens, temperature, signal, timeoutScale, budgetKind } = ask;
      const answer = await reply(prompt, route, { maxTokens, temperature, signal, timeoutScale, budgetKind, reasoningBudget: settings.reasoningBudget });
      if (route) deps.observe?.(ask.role, { outcome: "answered", profileId: route.profileId, effort, meter: answer.meter ?? null });
      return answer;
    } catch (error) {
      if (route && exhausted(error)) deps.observe?.(ask.role, { outcome: "reasoning-exhausted", profileId: route.profileId, effort, detail: error.message });
      throw error;
    }
  };
  call.planted = planted;
  return call;
};
