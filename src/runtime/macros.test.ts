const mockRegistry = new Map<string, () => unknown>();

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  registerHostMacro: (key: string, value: () => unknown) => mockRegistry.set(key, value),
  unregisterHostMacro: (key: string) => mockRegistry.delete(key),
  getPlayerName: () => "Max",
}));

import type { NormalizedStoryV2 } from "@engine/index";
import { registerRuntimeMacros } from "./macros";
import type { RuntimeManager } from "./runtimeManager";
import type { RuntimeSnapshot } from "./types";

const snapshot = (): RuntimeSnapshot =>
  ({
    storyTitle: "Quest for the Sun Ruins",
    storyDescription: "A desert expedition.",
    activeCheckpointName: "The Ruined Gate",
    activeObjective: "Reach the inner sanctum.",
    checkpoints: [
      { id: "start", name: "Camp", objective: "", active: false, visited: true },
      { id: "gate", name: "The Ruined Gate", objective: "", active: true, visited: false },
    ],
    tension: { level: "high", smoothed: 0.7, expected: 0.6, hint: null },
  }) as unknown as RuntimeSnapshot;

const makeManager = (roster: Array<{ id: string; name?: string }>): RuntimeManager => {
  let listener: (() => void) | null = null;
  const story = { roster } as unknown as NormalizedStoryV2;
  return {
    getSnapshot: () => snapshot(),
    getStory: () => story,
    getPossibleTransitions: () => ["→ Inner Sanctum when has_key == true"],
    subscribe: (fn: () => void) => {
      listener = fn;
      return () => { listener = null; };
    },
    __fire: () => listener?.(),
  } as unknown as RuntimeManager & { __fire: () => void };
};

describe("registerRuntimeMacros", () => {
  beforeEach(() => mockRegistry.clear());

  it("registers the static story macros with expected values", () => {
    registerRuntimeMacros(makeManager([]));
    expect(mockRegistry.get("story_title")?.()).toBe("Quest for the Sun Ruins");
    expect(mockRegistry.get("story_current_checkpoint")?.()).toBe("The Ruined Gate — Reach the inner sanctum.");
    expect(mockRegistry.get("story_past_checkpoints")?.()).toBe("Camp");
    expect(mockRegistry.get("story_possible_transitions")?.()).toBe("→ Inner Sanctum when has_key == true");
    expect(mockRegistry.get("story_tension")?.()).toBe("high");
    expect(mockRegistry.get("story_player_name")?.()).toBe("Max");
  });

  it("registers a role macro per roster member and resolves its name", () => {
    registerRuntimeMacros(makeManager([{ id: "arin", name: "Arin" }, { id: "narrator", name: "DM Narrator" }]));
    expect(mockRegistry.get("story_role_arin")?.()).toBe("Arin");
    expect(mockRegistry.get("story_role_narrator")?.()).toBe("DM Narrator");
  });

  it("unregisters stale role macros when the roster changes", () => {
    const manager = makeManager([{ id: "arin", name: "Arin" }]) as RuntimeManager & { __fire: () => void; getStory: () => NormalizedStoryV2 };
    registerRuntimeMacros(manager);
    expect(mockRegistry.has("story_role_arin")).toBe(true);
    (manager.getStory() as unknown as { roster: Array<{ id: string; name?: string }> }).roster = [{ id: "luke", name: "Luke" }];
    manager.__fire();
    expect(mockRegistry.has("story_role_arin")).toBe(false);
    expect(mockRegistry.get("story_role_luke")?.()).toBe("Luke");
  });
});

describe("registerRuntimeMacros: per-quality macros (v2.4 plan 08 R15)", () => {
  beforeEach(() => mockRegistry.clear());

  it("registers {{story_quality_<key>}} for the playing story and drops them when the runtime stops", () => {
    const values: Record<string, unknown> = { has_key: true };
    const manager = {
      ...makeManager([]),
      getStory: () => ({ roster: [], qualities: [{ key: "has_key" }, { key: "trap_state" }] }) as unknown as NormalizedStoryV2,
      getEngineState: () => ({ blackboard: { values } }),
      noteRecap: () => {},
    } as unknown as RuntimeManager;
    const dispose = registerRuntimeMacros(manager);
    expect(mockRegistry.get("story_quality_has_key")?.()).toBe("true");
    expect(mockRegistry.get("story_quality_trap_state")?.()).toBe("(unset)");
    dispose();
    expect(mockRegistry.has("story_quality_has_key")).toBe(false);
  });
});

describe("registerRuntimeMacros: {{story_quality::<key>}} (v2.5 plan 07 A2)", () => {
  beforeEach(() => mockRegistry.clear());

  it("registers one positional-argument macro that reads the live blackboard of the playing story", () => {
    const values: Record<string, unknown> = { has_key: true };
    const manager = {
      ...makeManager([]),
      getStory: () => ({ roster: [], qualities: [{ key: "has_key" }, { key: "trap_state" }] }) as unknown as NormalizedStoryV2,
      getEngineState: () => ({ blackboard: { values } }),
      noteRecap: () => {},
    } as unknown as RuntimeManager;
    registerRuntimeMacros(manager);
    const macro = mockRegistry.get("story_quality") as unknown as { unnamedArgs: Array<{ name: string }>; handler: (args: string[]) => string };
    expect(macro.unnamedArgs.map((arg) => arg.name)).toEqual(["key"]);
    expect(macro.handler(["has_key"])).toBe("true");
    expect(macro.handler(["trap_state"])).toBe("(unset)");
    expect(macro.handler(["gold"])).toBe("(no quality \"gold\")");
    values.has_key = false;
    expect(macro.handler(["has_key"])).toBe("false");
  });

  it("drops the argument macro when the runtime stops", () => {
    const manager = { ...makeManager([]), getEngineState: () => null, noteRecap: () => {} } as unknown as RuntimeManager;
    const dispose = registerRuntimeMacros(manager);
    expect(mockRegistry.has("story_quality")).toBe(true);
    dispose();
    expect(mockRegistry.has("story_quality")).toBe(false);
  });
});
