const context = { chatId: "chat-a", chatMetadata: {} as Record<string, unknown>, characters: [] as Array<{ avatar: string; name: string; scenario: string }>, characterId: undefined, groupId: null as string | null, groups: [] as Array<{ id: string; members: string[]; disabled_members: string[] }>, extensionSettings: {} as Record<string, unknown> };

jest.mock("@services/STAPI", () => ({ getContext: () => context }));

import { effectExtension } from "./effectExtensions";
import { SCENARIO_EFFECT, scenarioFrame } from "./storyScenario";
import { scenarioHost, startStoryScenario } from "./storyScenarioHost";

beforeEach(() => {
  context.extensionSettings = {};
  context.chatMetadata = {};
  context.chatId = "chat-a";
  context.groupId = "g0";
  context.groups = [{ id: "g0", members: ["a.png"], disabled_members: [] }];
  context.characters = [{ avatar: "a.png", name: "Arin", scenario: "Arin's scene." }];
});

describe("story scenario host wiring (v2.7 02 C1)", () => {
  it.each([true, false])("runs with no flag: a stored spikes.sp5Scenario %s changes nothing", (stored) => {
    context.extensionSettings = { "story-orchestrator": { settings: { spikes: { sp5Scenario: stored } } } };
    const stop = startStoryScenario();
    expect(effectExtension(SCENARIO_EFFECT)?.name).toBe(SCENARIO_EFFECT);
    expect(scenarioFrame()).toEqual({ override: "", cast: [{ name: "Arin", scenario: "Arin's scene." }] });
    stop();
  });

  it("start registers the effect and the frame reader, and its disposer takes both out", () => {
    const stop = startStoryScenario();
    expect(effectExtension(SCENARIO_EFFECT)?.name).toBe(SCENARIO_EFFECT);
    expect(scenarioFrame()).toEqual({ override: "", cast: [{ name: "Arin", scenario: "Arin's scene." }] });
    stop();
    expect(effectExtension(SCENARIO_EFFECT)).toBeNull();
    expect(scenarioFrame()).toBeNull();
  });

  it("the frame reads the open group's enabled cards and the chat's own override; no chat, no frame", () => {
    context.groupId = "g1";
    context.groups = [{ id: "g1", members: ["a.png", "b.png"], disabled_members: ["b.png"] }];
    context.characters = [{ avatar: "a.png", name: "Arin", scenario: "Arin's scene." }, { avatar: "b.png", name: "Luke", scenario: "Luke's scene." }];
    context.chatMetadata = { scenario: "Mine." };
    const stop = startStoryScenario();
    expect(scenarioFrame()).toEqual({ override: "Mine.", cast: [{ name: "Arin", scenario: "Arin's scene." }] });
    context.chatId = "";
    expect(scenarioFrame()).toBeNull();
    stop();
  });

  it("the host reads and writes the open chat's metadata", () => {
    const host = scenarioHost();
    expect(host.write("chat-a", "x").ok).toBe(true);
    expect(host.read()).toEqual({ chatId: "chat-a", text: "x" });
    expect(context.chatMetadata).toEqual({ scenario: "x" });
  });
});
