jest.mock("@services/STAPI", () => ({ openAgentBridge: jest.fn(), refreshHarnessStatus: jest.fn() }));
jest.mock("@runtime/settingsStore", () => ({ getGlobalSettings: () => ({ extraction: {} }) }));

import { resolveAgentHarness, type AgentHarnessDeps } from "./agentHost";

const row = {
  installed: true, version: "1", problem: null, loggedIn: true, fresh: true, loginProblem: null, blocked: null, offered: true, isolation: "",
  models: [{ id: "openai/gpt-6-astra-fast", context: 1 }], quotaUntil: null, spawns: 0, agentBridge: true,
};

const deps = (onFailure: string | null): AgentHarnessDeps => ({
  settings: () => ({
    routes: { authoring: { route: { kind: "harness", harness: "opencode", model: "openai/gpt-6-astra-fast", options: {} }, ...(onFailure ? { onFailure: { profileId: onFailure } } : {}) } },
  }) as never,
  status: async () => ({ pluginVersion: "1", harnesses: { opencode: row } }),
  bridge: async () => ({ open: jest.fn(), nextCall: jest.fn(), answer: jest.fn(), close: jest.fn() }),
});

describe("T6-3-3 MEDIUM: the agent's harness transport knows whether the role has an On failure profile", () => {
  it("marks the bridge as falling back only when On failure names a profile", async () => {
    await expect(resolveAgentHarness(deps("deepseek"))).resolves.toMatchObject({ target: { harness: "opencode" }, fallback: true });
    await expect(resolveAgentHarness(deps(null))).resolves.toMatchObject({ target: { harness: "opencode" }, fallback: false });
  });
});
