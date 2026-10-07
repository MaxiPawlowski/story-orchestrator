import { openAgentBridge, refreshHarnessStatus, type HarnessRow } from "@services/STAPI";
import type { HarnessTransport } from "@copilot/agent/index";
import { roleHarness, type RouteSettings } from "@runtime/passProfiles";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "@runtime/runToken";
import { getGlobalSettings } from "@runtime/settingsStore";
import { useDraftStore } from "./draft";

export const AGENT_BRIDGE_TIMEOUT_MS = 600_000;

const draftContext = (): RunContext => ({ chatId: null, storyId: null, storyHash: null, sessionEpoch: useDraftStore.getState().runEpoch, windowRevision: 0 });

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

export const agentHarnessRefusal = (harness: string, model: string, reason: string): string =>
  `The wizard is routed to ${harness} (${model}) under Models per task, but ${reason}. ` +
  "It does not fall back to the local profile: fix the harness, or route \"Wizard and road ahead\" back to its profile.";

const NO_STATUS = "the harness plugin did not answer its status (not installed, not restarted, or the request was refused)";

const reasonFor = (harness: string, model: string, row: HarnessRow | undefined): string | null => {
  if (!row) return `the harness plugin does not list ${harness}`;
  if (row.blocked) return row.blocked;
  if (row.agentBridge !== true) return `${harness} offers no agent tool bridge on this install (the plugin's config.json offers it, opencode only)`;
  if (!row.models.some((entry) => entry.id === model)) return `the harness plugin does not list the model ${model}`;
  return null;
};

export async function resolveAgentHarness(deps: AgentHarnessDeps = hostDeps): Promise<HarnessTransport | null> {
  const settings = deps.settings();
  const routed = roleHarness(settings, "authoring");
  if (!routed) return null;
  const fallback = Boolean(settings.routes?.authoring?.onFailure?.profileId);
  const status = await deps.status();
  const reason = status ? reasonFor(routed.harness, routed.model, status.harnesses[routed.harness]) : NO_STATUS;
  if (reason) return { refusal: agentHarnessRefusal(routed.harness, routed.model, reason) };
  return { bridge: await deps.bridge(), target: { harness: routed.harness, model: routed.model, timeoutMs: AGENT_BRIDGE_TIMEOUT_MS }, fallback };
}
