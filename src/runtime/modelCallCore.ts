import { ModelCallError } from "@extraction/modelError";
import type { ModelCall, ModelPass } from "@extraction/modelRoute";
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

export const debugResponseFor = (pass: ModelPass): string | null => DEBUG_RESPONSES[pass]() ?? null;

export interface ModelCallDeps {
  settings: () => RouteSettings;
  exists: (profileId: string) => boolean;
  planted?: boolean;
}

export const createModelCallVia = (reply: RouteReply, deps: ModelCallDeps): ModelCall => {
  const planted = deps.planted === false ? () => null : debugResponseFor;
  const call: ModelCall = async (prompt, ask) => {
    const debugResponse = ask.debugResponse ?? planted(ask.pass);
    if (debugResponse !== null) return reply(prompt, null, { debugResponse });
    const resolution = resolveRoute(deps.settings(), ask.role, deps.exists);
    if (!resolution.ok) throw new ModelCallError("config", resolution.reason, resolution.profileId);
    return reply(prompt, resolution.route, { maxTokens: ask.maxTokens, temperature: ask.temperature, signal: ask.signal, timeoutScale: ask.timeoutScale, budgetKind: ask.budgetKind });
  };
  call.planted = planted;
  return call;
};
