import { openAgentBridge, refreshHarnessStatus } from "@services/STAPI";
import type { HarnessTransport } from "@copilot/agent/index";
import { roleHarness, type RouteSettings } from "@runtime/passProfiles";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "@runtime/runToken";
import { getGlobalSettings } from "@runtime/settingsStore";
import { useDraftStore } from "./draft";

export const AGENT_BRIDGE_TIMEOUT_MS = 600_000;

const draftContext = (): RunContext => ({ chatId: null, storyId: null, playedVersion: null, sessionEpoch: useDraftStore.getState().runEpoch, windowRevision: 0 });

export const draftOwnership: RunOwnership = {
  mint: () => mintToken(draftContext()),
  check: (token) => tokenMatches(draftContext(), token),
};

export interface AgentHarnessDeps {
  settings: () => RouteSettings;
  status: () => ReturnType<typeof refreshHarnessStatus>;
  bridge: typeof openAgentBridge;
}

const hostDeps: AgentHarnessDeps = { settings: () => getGlobalSettings().extraction, status: () => refreshHarnessStatus(), bridge: openAgentBridge };

export async function resolveAgentHarness(deps: AgentHarnessDeps = hostDeps): Promise<HarnessTransport | null> {
  const routed = roleHarness(deps.settings(), "authoring");
  if (!routed) return null;
  const row = (await deps.status().catch(() => null))?.harnesses[routed.harness];
  if (!row || row.agentBridge !== true || !row.models.some((model) => model.id === routed.model)) return null;
  return { bridge: await deps.bridge(), target: { harness: routed.harness, model: routed.model, timeoutMs: AGENT_BRIDGE_TIMEOUT_MS } };
}
