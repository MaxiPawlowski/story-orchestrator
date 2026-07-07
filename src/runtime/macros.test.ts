const mockRegistry = new Map<string, () => unknown>();

jest.mock("@services/STAPI", () => ({
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
