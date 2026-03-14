jest.mock("@services/StoryGeneratorService", () => {
  class StoryGeneratorService {}
  (StoryGeneratorService as any).buildCharacterSummaries = jest.fn(() => []);
  (StoryGeneratorService as any).buildWorldInfoSummaries = jest.fn(() => []);
  return { StoryGeneratorService };
});

import { CheckpointExpansionCoordinator } from "@services/runtime/CheckpointExpansionCoordinator";
import { storySessionStore } from "@store/storySessionStore";
import { StoryGeneratorService } from "@services/StoryGeneratorService";
import type { NormalizedCheckpoint, NormalizedStory } from "@utils/story-validator";

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: jest.fn(),
  },
}));

const storySessionStoreMock = storySessionStore as jest.Mocked<typeof storySessionStore>;

const createRegexTrigger = (condition: string) => ({
  type: "regex" as const,
  regexes: [],
  condition,
  raw: { type: "regex" as const, patterns: [condition], condition },
});

const createStory = (overrides: Partial<NormalizedStory> = {}): NormalizedStory => ({
  schemaVersion: "2.0",
  title: "Story 1",
  description: "desc",
  global_lorebook: "Lorebook",
  checkpoints: [{ id: "cp-1", name: "CP1", objective: "obj" }],
  transitions: [],
  startId: "cp-1",
  ...overrides,
});

describe("CheckpointExpansionCoordinator", () => {
  beforeEach(() => {
    (StoryGeneratorService.buildCharacterSummaries as unknown as jest.Mock | undefined)?.mockClear?.();
    (StoryGeneratorService.buildWorldInfoSummaries as unknown as jest.Mock | undefined)?.mockClear?.();
  });

  it("prevents re-entry while a stub expansion is active", async () => {
    const setExpansion = jest.fn();
    const resetExpansion = jest.fn();
    const state = {
      roadmap: "roadmap",
      expansion: { isExpanding: false, phase: null, phaseDone: {}, preview: null },
      setExpansion,
      resetExpansion,
    };
    storySessionStoreMock.getState.mockImplementation(() => state as any);

    jest.spyOn(StoryGeneratorService, "buildCharacterSummaries").mockReturnValue([]);
    jest.spyOn(StoryGeneratorService, "buildWorldInfoSummaries").mockReturnValue([]);

    const deferred = (() => {
      let resolve!: (value: any) => void;
      const promise = new Promise((nextResolve) => {
        resolve = nextResolve;
      });
      return { promise, resolve };
    })();

    const generatorService = {
      expandCheckpoint: jest.fn().mockReturnValue(deferred.promise),
    } as unknown as StoryGeneratorService;
    const story = createStory({
      expansion: { premise: "premise" },
      checkpoints: [
        { id: "cp-1", name: "CP1", objective: "obj-1" },
        {
          id: "cp-2",
          name: "Stub",
          objective: "obj-2",
          stub: { isStub: true, stubName: "Stub" },
        } satisfies NormalizedCheckpoint,
      ],
      transitions: [
        { id: "to-stub", from: "cp-1", to: "cp-2", trigger: createRegexTrigger("go") },
      ],
    });

    const coordinator = new CheckpointExpansionCoordinator({
      story,
      generatorService,
      buildPastCheckpoints: () => [],
      getRoadmap: () => "roadmap",
    });

    const first = coordinator.expandStub(1, story.transitions[0]);
    const second = coordinator.expandStub(1, story.transitions[0]);

    expect(generatorService.expandCheckpoint).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBe(false);

    deferred.resolve({ roadmap: "next roadmap", checkpoint: { id: "cp-2", name: "Expanded", objective: "obj" } });
    await expect(first).resolves.toBe(true);
    expect(generatorService.expandCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      premise: "premise",
      roadmap: "roadmap",
      transitionCondition: "go",
      targetCheckpointName: "Stub",
    }), expect.any(Function));
    expect(setExpansion).toHaveBeenCalledWith({ isExpanding: true, phase: "roadmap", phaseDone: {}, preview: null });
    expect(resetExpansion).toHaveBeenCalledTimes(1);
  });

  it("publishes phase updates through the shared expansion store", async () => {
    const state = {
      roadmap: "roadmap",
      expansion: { isExpanding: false, phase: null, phaseDone: {}, preview: null },
      setExpansion: jest.fn((next: any) => {
        state.expansion = { ...state.expansion, ...next, phaseDone: next.phaseDone ?? state.expansion.phaseDone };
      }),
      resetExpansion: jest.fn(),
    };
    storySessionStoreMock.getState.mockImplementation(() => state as any);

    jest.spyOn(StoryGeneratorService, "buildCharacterSummaries").mockReturnValue([]);
    jest.spyOn(StoryGeneratorService, "buildWorldInfoSummaries").mockReturnValue([]);

    const generatorService = {
      expandCheckpoint: jest.fn().mockImplementation(async (_input, onPhase) => {
        onPhase?.({ phase: "checkpoint", done: true, checkpointName: "Expanded", checkpointObjective: "obj", transitionCount: 2 });
        return { roadmap: "next roadmap", checkpoint: { id: "cp-2", name: "Expanded", objective: "obj" } };
      }),
    } as unknown as StoryGeneratorService;

    const coordinator = new CheckpointExpansionCoordinator({
      story: createStory({
        expansion: { premise: "premise" },
        checkpoints: [
          { id: "cp-1", name: "CP1", objective: "obj-1" },
          { id: "cp-2", name: "Stub", objective: "obj-2", stub: { isStub: true } },
        ],
      }),
      generatorService,
      buildPastCheckpoints: () => [],
      getRoadmap: () => "roadmap",
    });

    await coordinator.expandStub(1);

    expect(state.setExpansion).toHaveBeenCalledWith(expect.objectContaining({
      phase: "checkpoint",
      preview: expect.objectContaining({ checkpointName: "Expanded", transitionCount: 2 }),
    }));
    expect(state.resetExpansion).toHaveBeenCalledTimes(1);
  });
});
