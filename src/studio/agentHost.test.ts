jest.mock("@services/STAPI", () => ({ openAgentBridge: jest.fn(), refreshHarnessStatus: jest.fn() }));
jest.mock("@runtime/settingsStore", () => ({ getGlobalSettings: () => ({ extraction: {} }) }));

import type { HarnessStatus } from "@services/STAPI";
import { draftOwnership, resolveAgentHarness, type AgentHarnessDeps } from "./agentHost";
import { useDraftStore } from "./draft";

const row = (agentBridge: boolean) => ({
  installed: true, version: "1", problem: null, loggedIn: true, fresh: true, loginProblem: null, offered: true, isolation: "", models: [{ id: "openai/gpt-6-astra", context: 1 }],
  quotaUntil: null, spawns: 0, ...(agentBridge ? { agentBridge: true } : {}),
});

const deps = (routed: boolean, agentBridge: boolean, status: HarnessStatus | null = { pluginVersion: "1", harnesses: { opencode: row(agentBridge) } }): AgentHarnessDeps => ({
  settings: () => (routed ? { routes: { authoring: { route: { kind: "harness", harness: "opencode", model: "openai/gpt-6-astra", options: {} } } } } : {}) as never,
  status: async () => status,
  bridge: async () => ({ open: jest.fn(), nextCall: jest.fn(), answer: jest.fn(), close: jest.fn() }),
});

describe("the Studio's agent host (v2.6 plan 04 agent bridge)", () => {
  it("offers the bridge only when the Wizard role is routed to a harness that offers it", async () => {
    await expect(resolveAgentHarness(deps(true, true))).resolves.toMatchObject({ target: { harness: "opencode", model: "openai/gpt-6-astra" } });
    await expect(resolveAgentHarness(deps(false, true))).resolves.toBeNull();
    await expect(resolveAgentHarness(deps(true, false))).resolves.toBeNull();
    await expect(resolveAgentHarness(deps(true, true, null))).resolves.toBeNull();
  });

  it("a loaded draft, a reset and endRuns each end the agent's run", () => {
    for (const end of [() => useDraftStore.getState().newDraft(), () => useDraftStore.getState().reset(), () => useDraftStore.getState().endRuns()]) {
      const token = draftOwnership.mint();
      expect(draftOwnership.check(token).ok).toBe(true);
      useDraftStore.getState().mutate((draft) => ({ ...draft, title: `${draft.title}!` }));
      expect(draftOwnership.check(token).ok).toBe(true);
      end();
      expect(draftOwnership.check(token)).toMatchObject({ ok: false, reason: "epoch" });
    }
  });
});
