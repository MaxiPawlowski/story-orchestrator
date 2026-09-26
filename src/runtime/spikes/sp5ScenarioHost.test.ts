const context = { chatId: "chat-a", chatMetadata: {} as Record<string, unknown>, characters: [], characterId: undefined, groupId: null, groups: [], extensionSettings: {} as Record<string, unknown> };

jest.mock("@services/STAPI", () => ({ getContext: () => context }));

import { effectExtension } from "../effectExtensions";
import { SP5_EXTENSION } from "./sp5Scenario";
import { registerScenarioSpike, scenarioHost, sp5Enabled } from "./sp5ScenarioHost";

beforeEach(() => {
  context.extensionSettings = {};
  context.chatMetadata = {};
});

describe("SP5 spike host wiring", () => {
  it("the install-wide flag is off unless spikes.sp5Scenario is exactly true", () => {
    expect(sp5Enabled()).toBe(false);
    context.extensionSettings = { "story-orchestrator": { spikes: { sp5Scenario: "yes" } } };
    expect(sp5Enabled()).toBe(false);
    context.extensionSettings = { "story-orchestrator": { spikes: { sp5Scenario: true } } };
    expect(sp5Enabled()).toBe(true);
  });

  it("registration puts the scenario extension in the registry and its disposer takes it out", () => {
    const dispose = registerScenarioSpike();
    expect(effectExtension(SP5_EXTENSION)?.name).toBe(SP5_EXTENSION);
    dispose();
    expect(effectExtension(SP5_EXTENSION)).toBeNull();
  });

  it("the host reads and writes the open chat's metadata", () => {
    const host = scenarioHost();
    expect(host.write("chat-a", "x").ok).toBe(true);
    expect(host.read()).toEqual({ chatId: "chat-a", text: "x" });
    expect(context.chatMetadata).toEqual({ scenario: "x" });
  });
});
