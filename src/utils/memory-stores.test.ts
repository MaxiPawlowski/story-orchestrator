import type {
  Consequence,
  ForegoneTransition,
  NarrativeSeed,
  RoleState,
  SceneMemoryEntry,
} from "../types/narrative-memory";
import { createRuntime } from "@services/__mocks__/testData";
import type { RuntimeStoryState } from "@utils/story-state";

const runtime = (overrides: Partial<RuntimeStoryState> = {}): RuntimeStoryState => (
  createRuntime(overrides) as RuntimeStoryState
);

const storeState = {
  runtime: runtime(),
  writeRuntime: jest.fn((next: RuntimeStoryState) => {
    storeState.runtime = next;
    return next;
  }),
};

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: () => storeState,
  },
}));

import {
  addConsequence,
  addForegoneTransition,
  addSceneMemory,
  addSeed,
  createEmptyMemory,
  getOpenSeeds,
  getRecentSceneMemory,
  getRoleStates,
  getTopConsequences,
  removeConsequence,
  resolveSeed,
  updateRoleState,
} from "./memory-stores";

const consequence = (overrides: Partial<Consequence> = {}): Consequence => ({
  id: "csq-1",
  text: "Consequence",
  weight: 0.5,
  tags: ["risk"],
  sourceCheckpointId: "cp-1",
  createdAtTurn: 1,
  ...overrides,
});

const seed = (overrides: Partial<NarrativeSeed> = {}): NarrativeSeed => ({
  id: "seed-1",
  text: "Seed",
  kind: "thread",
  resolved: false,
  sourceCheckpointId: "cp-1",
  createdAtTurn: 1,
  ...overrides,
});

const roleState = (overrides: Partial<RoleState> = {}): RoleState => ({
  role: "guide",
  summary: "Watching closely",
  lastUpdatedTurn: 3,
  ...overrides,
});

const sceneMemory = (overrides: Partial<SceneMemoryEntry> = {}): SceneMemoryEntry => ({
  text: "Entered the ruins",
  checkpointId: "cp-1",
  turn: 2,
  ...overrides,
});

const foregoneTransition = (overrides: Partial<ForegoneTransition> = {}): ForegoneTransition => ({
  transitionId: "t-1",
  fromCheckpointId: "cp-1",
  reason: "The door was sealed",
  turn: 3,
  ...overrides,
});

describe("memory-stores", () => {
  beforeEach(() => {
    storeState.runtime = runtime({ memory: undefined });
    storeState.writeRuntime.mockClear();
  });

  it("creates the canonical empty memory shape", () => {
    expect(createEmptyMemory()).toEqual({
      consequences: [],
      seeds: [],
      roleStates: {},
      sceneMemory: [],
      foregoneTransitions: [],
    });
  });

  it("adds consequences with sequential ids and initializes memory when missing", () => {
    const created = addConsequence({
      text: "Bridge damage lingers",
      weight: 0.8,
      tags: ["bridge", "damage"],
      sourceCheckpointId: "cp-2",
      createdAtTurn: 4,
    });

    expect(created).toEqual({
      id: "csq-1",
      text: "Bridge damage lingers",
      weight: 0.8,
      tags: ["bridge", "damage"],
      sourceCheckpointId: "cp-2",
      createdAtTurn: 4,
    });
    expect(storeState.runtime.memory?.consequences).toEqual([created]);

    const second = addConsequence({
      text: "Debt deepens",
      weight: 0.4,
      tags: ["debt"],
      sourceCheckpointId: "cp-3",
      createdAtTurn: 5,
    });

    expect(second.id).toBe("csq-2");
  });

  it("removes consequences by id and reports whether one was found", () => {
    storeState.runtime = runtime({
      memory: {
        ...createEmptyMemory(),
        consequences: [consequence(), consequence({ id: "csq-2", text: "Second" })],
      },
    });

    expect(removeConsequence("missing")).toBe(false);
    expect(storeState.runtime.memory?.consequences).toHaveLength(2);

    expect(removeConsequence("csq-1")).toBe(true);
    expect(storeState.runtime.memory?.consequences).toEqual([consequence({ id: "csq-2", text: "Second" })]);
  });

  it("returns top consequences by tag overlap, then weight", () => {
    storeState.runtime = runtime({
      memory: {
        ...createEmptyMemory(),
        consequences: [
          consequence({ id: "csq-1", tags: ["storm"], weight: 0.9 }),
          consequence({ id: "csq-2", tags: ["storm", "ally"], weight: 0.1 }),
          consequence({ id: "csq-3", tags: ["ally"], weight: 0.7 }),
          consequence({ id: "csq-4", tags: ["other"], weight: 1 }),
        ],
      },
    });

    expect(getTopConsequences({ tags: ["storm", "ally"], limit: 3 }).map((entry) => entry.id)).toEqual([
      "csq-2",
      "csq-1",
      "csq-3",
    ]);
    expect(getTopConsequences({ tags: ["storm"] }).map((entry) => entry.id)).toEqual(["csq-1", "csq-2"]);
    expect(getTopConsequences().map((entry) => entry.id)).toEqual(["csq-4", "csq-1", "csq-3", "csq-2"]);
  });

  it("adds seeds, resolves them, and returns unresolved seeds oldest first", () => {
    const created = addSeed({
      text: "The guide knows more",
      kind: "hook",
      resolved: false,
      sourceCheckpointId: "cp-1",
      createdAtTurn: 6,
    });

    expect(created.id).toBe("seed-1");

    storeState.runtime = runtime({
      memory: {
        ...createEmptyMemory(),
        seeds: [
          seed({ id: "seed-2", createdAtTurn: 5 }),
          seed({ id: "seed-3", createdAtTurn: 3 }),
          seed({ id: "seed-4", createdAtTurn: 4, resolved: true }),
        ],
      },
    });

    expect(resolveSeed("missing")).toBe(false);
    expect(resolveSeed("seed-2")).toBe(true);
    expect(getOpenSeeds().map((entry) => entry.id)).toEqual(["seed-3"]);
  });

  it("upserts role states and returns the current role state map", () => {
    storeState.runtime = runtime({
      memory: {
        ...createEmptyMemory(),
        roleStates: { scout: roleState({ role: "scout", summary: "Ahead", lastUpdatedTurn: 2 }) },
      },
    });

    expect(updateRoleState("guide", "Reading the room", 7)).toEqual({
      role: "guide",
      summary: "Reading the room",
      lastUpdatedTurn: 7,
    });
    expect(getRoleStates()).toEqual({
      scout: roleState({ role: "scout", summary: "Ahead", lastUpdatedTurn: 2 }),
      guide: { role: "guide", summary: "Reading the room", lastUpdatedTurn: 7 },
    });
  });

  it("appends scene memory and returns the most recent entries first", () => {
    storeState.runtime = runtime({
      memory: {
        ...createEmptyMemory(),
        sceneMemory: [
          sceneMemory({ text: "One", turn: 1 }),
          sceneMemory({ text: "Two", turn: 2 }),
          sceneMemory({ text: "Three", turn: 3 }),
          sceneMemory({ text: "Four", turn: 4 }),
          sceneMemory({ text: "Five", turn: 5 }),
          sceneMemory({ text: "Six", turn: 6 }),
        ],
      },
    });

    addSceneMemory(sceneMemory({ text: "Seven", turn: 7 }));

    expect(getRecentSceneMemory().map((entry) => entry.text)).toEqual(["Seven", "Six", "Five", "Four", "Three"]);
    expect(getRecentSceneMemory(2).map((entry) => entry.text)).toEqual(["Seven", "Six"]);
  });

  it("appends foregone transitions", () => {
    addForegoneTransition(foregoneTransition());

    expect(storeState.runtime.memory?.foregoneTransitions).toEqual([foregoneTransition()]);
  });
});
