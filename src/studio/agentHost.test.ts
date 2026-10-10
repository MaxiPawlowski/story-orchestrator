jest.mock("@services/STAPI", () => ({ ...jest.requireActual("@services/stHost/harnessCache"), openAgentBridge: jest.fn(), refreshHarnessStatus: jest.fn() }));
jest.mock("@runtime/settingsStore", () => ({ getGlobalSettings: () => ({ extraction: {} }) }));

import type { HarnessStatus } from "@services/STAPI";
import { draftOwnership, resolveAgentHarness, type AgentHarnessDeps } from "./agentHost";
import { useDraftStore } from "./draft";

const row = (agentBridge: boolean) => ({
  installed: true, version: "1", problem: null, loggedIn: true, fresh: true, loginProblem: null, blocked: null as string | null, offered: true, isolation: "", models: [{ id: "openai/gpt-6-astra", context: 1 }],
  quotaUntil: null, spawns: 0, ...(agentBridge ? { agentBridge: true } : {}),
});

const deps = (routed: boolean, agentBridge: boolean, status: HarnessStatus | null = { pluginVersion: "1", harnesses: { opencode: row(agentBridge) } }): AgentHarnessDeps => ({
  settings: () => (routed ? { routes: { authoring: { route: { kind: "harness", harness: "opencode", model: "openai/gpt-6-astra", options: {} } } } } : {}) as never,
  status: async () => status,
  bridge: async () => ({ open: jest.fn(), nextCall: jest.fn(), answer: jest.fn(), close: jest.fn() }),
});

describe("v2.8 09 owner 2026-10-10: a DeepSeek wizard route runs on native tool calls", () => {
  const profiles = [{ id: "artemis", kind: "text", source: "llamacpp" }, { id: "gpt", kind: "chat", source: "openai" }, { id: "ds", kind: "chat", source: "deepseek" }];
  const profileBridge = jest.fn(async () => ({ open: jest.fn(), nextCall: jest.fn(), answer: jest.fn(), close: jest.fn() }));
  const native = (settings: Record<string, unknown>, planted = false): AgentHarnessDeps => ({
    ...deps(false, true), settings: () => settings as never, profiles: () => profiles, profileBridge, planted: () => planted,
  });

  it("an authoring role on a DeepSeek profile gets the profile tool bridge, falling back to the text route on failure", async () => {
    await expect(resolveAgentHarness(native({ profileId: "artemis", profiles: { authoring: "ds" } }))).resolves.toMatchObject({ target: { harness: "profile", model: "ds" }, fallback: true });
    expect(profileBridge).toHaveBeenCalledWith("ds");
  });

  it("any other profile keeps the text route, and a planted copilot answer never reaches a live model", async () => {
    await expect(resolveAgentHarness(native({ profileId: "artemis", profiles: { authoring: "gpt" } }))).resolves.toBeNull();
    await expect(resolveAgentHarness(native({ profileId: "artemis", profiles: { authoring: "ds" } }, true))).resolves.toBeNull();
  });

  it("unset, the role takes the DeepSeek default on its native bridge when sol is not offered", async () => {
    await expect(resolveAgentHarness(native({ profileId: "artemis" }))).resolves.toMatchObject({ target: { harness: "profile", model: "ds" } });
  });

  it("a harness route still wins over the profile", async () => {
    await expect(resolveAgentHarness({ ...native({}), settings: deps(true, true).settings })).resolves.toMatchObject({ target: { harness: "opencode" } });
  });
});

describe("the Studio's agent host (v2.6 plan 04 agent bridge)", () => {
  it("offers the bridge only when the Wizard role is routed to a harness that offers it", async () => {
    await expect(resolveAgentHarness(deps(true, true))).resolves.toMatchObject({ target: { harness: "opencode", model: "openai/gpt-6-astra" } });
    await expect(resolveAgentHarness(deps(false, true))).resolves.toBeNull();
  });

  it("CR-J7: routed to a harness that cannot serve it, the wizard gets the refusal, never the local route", async () => {
    const noBridge = await resolveAgentHarness(deps(true, false));
    expect(noBridge).toEqual({ refusal: expect.stringContaining("offers no agent tool bridge") });
    const down = await resolveAgentHarness(deps(true, true, null));
    expect(down).toEqual({ refusal: expect.stringContaining("did not answer its status") });
    expect(down?.refusal).toContain("does not fall back to the local profile");
    const held = await resolveAgentHarness(deps(true, true, { pluginVersion: "1", harnesses: { opencode: { ...row(true), blocked: "opencode's real login file changed" } } }));
    expect(held?.refusal).toContain("real login file changed");
    const unlisted = await resolveAgentHarness(deps(true, true, { pluginVersion: "1", harnesses: { opencode: { ...row(true), models: [] } } }));
    expect(unlisted?.refusal).toContain("does not list the model");
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

describe("v2.8 09 owner 2026-10-10: the wizard's default is opencode gpt-6.1-sol on the tool bridge", () => {
  const solRow = (over: Record<string, unknown> = {}) => ({ ...row(true), models: [{ id: "openai/gpt-6.1-sol", context: 1 }], ...over });
  const profiles = [{ id: "ds", kind: "chat", source: "deepseek" }];
  const profileBridge = jest.fn(async () => ({ open: jest.fn(), nextCall: jest.fn(), answer: jest.fn(), close: jest.fn() }));
  const host = (settings: Record<string, unknown>, opencode: Record<string, unknown> | null, planted = false): AgentHarnessDeps => ({
    ...deps(false, true, { pluginVersion: "1", harnesses: opencode ? { opencode: opencode as never } : {} }),
    settings: () => settings as never, profiles: () => profiles, profileBridge, planted: () => planted,
  });

  it("offered with its bridge: sol, with the profile route as the fallback", async () => {
    await expect(resolveAgentHarness(host({ profileId: "m" }, solRow()))).resolves.toMatchObject({ target: { harness: "opencode", model: "openai/gpt-6.1-sol" }, fallback: true });
  });

  it("not offered, blocked, logged out or bridgeless: the DeepSeek profile bridge as before", async () => {
    for (const opencode of [null, solRow({ offered: false }), solRow({ blocked: "held" }), solRow({ loggedIn: false }), { ...solRow(), agentBridge: undefined }, solRow({ models: [] })]) {
      await expect(resolveAgentHarness(host({ profileId: "m" }, opencode))).resolves.toMatchObject({ target: { harness: "profile", model: "ds" } });
    }
  });

  it("an assigned profile or a planted answer never takes sol", async () => {
    await expect(resolveAgentHarness(host({ profileId: "m", profiles: { authoring: "ds" } }, solRow()))).resolves.toMatchObject({ target: { harness: "profile", model: "ds" } });
    await expect(resolveAgentHarness(host({ profileId: "m" }, solRow(), true))).resolves.toBeNull();
  });
});
