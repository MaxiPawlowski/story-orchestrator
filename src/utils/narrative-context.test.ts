import { getContext } from "@services/STAPI";
import { createBasicStory, createRuntime } from "@services/__mocks__/testData";
import { CheckpointStatus, type RuntimeStoryState } from "@utils/story-state";
import {
  buildNarrativeContext,
  formatNarrativeContextForPrompt,
  type NarrativeContextSection,
} from "./narrative-context";

const makeRuntime = (overrides: Partial<RuntimeStoryState> = {}): RuntimeStoryState => (
  createRuntime(overrides) as RuntimeStoryState
);

const getTopConsequencesMock = jest.fn();
const getOpenSeedsMock = jest.fn();
const getRoleStatesMock = jest.fn();
const getRecentSceneMemoryMock = jest.fn();

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
}));

jest.mock("@utils/memory-stores", () => ({
  getTopConsequences: (...args: unknown[]) => getTopConsequencesMock(...args),
  getOpenSeeds: (...args: unknown[]) => getOpenSeedsMock(...args),
  getRoleStates: (...args: unknown[]) => getRoleStatesMock(...args),
  getRecentSceneMemory: (...args: unknown[]) => getRecentSceneMemoryMock(...args),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;

describe("narrative-context", () => {
  beforeEach(() => {
    getContextMock.mockReset();
    getTopConsequencesMock.mockReset();
    getOpenSeedsMock.mockReset();
    getRoleStatesMock.mockReset();
    getRecentSceneMemoryMock.mockReset();
    getContextMock.mockReturnValue({
      chat: [
        { name: "Guide", mes: "The bridge will not hold." },
        { is_user: true, mes: "Then we take the river path." },
      ],
    } as any);
  });

  it("builds structured context from story, helpers, and chat", () => {
    const story = createBasicStory({
      description: "  A perilous journey.  ",
      checkpoints: [
        { id: "cp-1", name: "Arrival", objective: "Reach the ravine" },
        { id: "cp-2", name: "Crossing", objective: "Find a safe path" },
        { id: "cp-3", name: "Shelter", objective: "Reach camp" },
      ],
      transitions: [
        {
          id: "t-1",
          from: "cp-2",
          to: "cp-3",
          label: "Take river path",
          description: "Uses the riverbank trail",
          trigger: {
            type: "regex",
            regexes: [/river/i],
            condition: "Party rejects the bridge",
          },
        },
      ],
      startId: "cp-1",
    }) as any;

    const runtime = makeRuntime({
      checkpointIndex: 1,
      activeCheckpointKey: "cp-2",
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
        "cp-3": CheckpointStatus.Pending,
      },
      memory: {
        consequences: [
          {
            id: "csq-1",
            text: "Bridge is unstable",
            weight: 0.9,
            tags: ["bridge", "travel"],
            sourceCheckpointId: "cp-1",
            createdAtTurn: 2,
          },
          {
            id: "csq-2",
            text: "River route is longer",
            weight: 0.4,
            tags: ["river"],
            sourceCheckpointId: "cp-2",
            createdAtTurn: 3,
          },
        ],
        seeds: [
          {
            id: "seed-1",
            text: "The lantern may matter later",
            kind: "hook",
            resolved: false,
            sourceCheckpointId: "cp-1",
            createdAtTurn: 4,
          },
        ],
        roleStates: {
          guide: {
            role: "guide",
            summary: "Knows the safer river route",
            lastUpdatedTurn: 5,
          },
        },
        sceneMemory: [
          { text: "Rain started at the ravine", checkpointId: "cp-1", turn: 2 },
          { text: "The bridge creaked loudly", checkpointId: "cp-2", turn: 3 },
        ],
        foregoneTransitions: [
          { transitionId: "t-bridge", fromCheckpointId: "cp-2", reason: "Too dangerous", turn: 4 },
        ],
      },
    });

    getTopConsequencesMock.mockReturnValue(runtime.memory?.consequences ?? []);
    getOpenSeedsMock.mockReturnValue(runtime.memory?.seeds ?? []);
    getRoleStatesMock.mockReturnValue(runtime.memory?.roleStates ?? {});
    getRecentSceneMemoryMock.mockReturnValue([
      { text: "The bridge creaked loudly", checkpointId: "cp-2", turn: 3 },
      { text: "Rain started at the ravine", checkpointId: "cp-1", turn: 2 },
    ]);

    const context = buildNarrativeContext({ story, runtime });

    expect(getTopConsequencesMock).toHaveBeenCalledTimes(1);
    expect(getOpenSeedsMock).toHaveBeenCalledTimes(1);
    expect(getRoleStatesMock).toHaveBeenCalledTimes(1);
    expect(getRecentSceneMemoryMock).toHaveBeenCalledTimes(1);
    expect(context).toEqual({
      storyTitle: "Story 1",
      storyDescription: "A perilous journey.",
      currentCheckpoint: { name: "Crossing", objective: "Find a safe path" },
      recentCheckpoints: [
        { name: "Arrival", objective: "Reach the ravine", status: "complete" },
      ],
      activeTransitions: [
        {
          id: "t-1",
          label: "Take river path",
          condition: "Regex: /river/i | Condition: Party rejects the bridge | Description: Uses the riverbank trail",
        },
      ],
      consequences: runtime.memory?.consequences ?? [],
      openSeeds: runtime.memory?.seeds ?? [],
      roleStates: runtime.memory?.roleStates ?? {},
      sceneMemory: [
        { text: "The bridge creaked loudly", checkpointId: "cp-2", turn: 3 },
        { text: "Rain started at the ravine", checkpointId: "cp-1", turn: 2 },
      ],
      foregoneTransitions: [
        { transitionId: "t-bridge", fromCheckpointId: "cp-2", reason: "Too dangerous", turn: 4 },
      ],
      chatExcerpt: "2. Player: Then we take the river path.\n1. Guide: The bridge will not hold.",
    });

    const prompt = formatNarrativeContextForPrompt(context);
    expect(prompt).toContain("=== Story ===");
    expect(prompt).toContain("=== Active Consequences ===");
    expect(prompt).toContain("Take river path");
    expect(prompt).toContain("Guide: The bridge will not hold.");
  });

  it("only fills the requested sections", () => {
    const story = createBasicStory() as any;
    const runtime = makeRuntime({
      memory: {
        consequences: [{ id: "csq-1", text: "Keep out", weight: 1, tags: [], sourceCheckpointId: "cp-1", createdAtTurn: 1 }],
        seeds: [],
        roleStates: {},
        sceneMemory: [],
        foregoneTransitions: [],
      },
    });

    getTopConsequencesMock.mockReturnValue(runtime.memory?.consequences ?? []);
    getOpenSeedsMock.mockReturnValue([]);
    getRoleStatesMock.mockReturnValue({});
    getRecentSceneMemoryMock.mockReturnValue([]);

    const sections: NarrativeContextSection[] = ["story", "memory"];
    const context = buildNarrativeContext({ story, runtime, sections });

    expect(getTopConsequencesMock).toHaveBeenCalledTimes(1);
    expect(getOpenSeedsMock).toHaveBeenCalledTimes(1);
    expect(getRoleStatesMock).toHaveBeenCalledTimes(1);
    expect(getRecentSceneMemoryMock).toHaveBeenCalledTimes(1);
    expect(context.storyTitle).toBe("Story 1");
    expect(context.consequences).toHaveLength(1);
    expect(context.currentCheckpoint).toEqual({ name: "", objective: "" });
    expect(context.activeTransitions).toEqual([]);
    expect(context.chatExcerpt).toBe("");
  });

  it("skips memory helpers when memory section is omitted", () => {
    const story = createBasicStory() as any;
    const runtime = makeRuntime({ memory: undefined });

    const context = buildNarrativeContext({ story, runtime, sections: ["story", "chat"] });

    expect(getTopConsequencesMock).not.toHaveBeenCalled();
    expect(getOpenSeedsMock).not.toHaveBeenCalled();
    expect(getRoleStatesMock).not.toHaveBeenCalled();
    expect(getRecentSceneMemoryMock).not.toHaveBeenCalled();
    expect(context.consequences).toEqual([]);
    expect(context.openSeeds).toEqual([]);
    expect(context.roleStates).toEqual({});
    expect(context.sceneMemory).toEqual([]);
    expect(context.foregoneTransitions).toEqual([]);
  });
});
