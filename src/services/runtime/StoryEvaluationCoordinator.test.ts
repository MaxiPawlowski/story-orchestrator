jest.mock("@utils/story-state", () => ({
  evaluateTransitionTriggers: jest.fn(({ transitions }) => transitions.map((transition: any) => ({ transition, trigger: transition.trigger, pattern: "/door/i" }))),
  clampCheckpointIndex: jest.fn((idx: number, story: any) => Math.max(0, Math.min(idx, (story?.checkpoints?.length ?? 1) - 1))),
  deriveCheckpointStatuses: jest.fn(() => []),
}));

import { StoryEvaluationCoordinator } from "@services/runtime/StoryEvaluationCoordinator";
import type { CheckpointArbiterApi } from "@services/CheckpointArbiterService";
import { createBasicStory, createRuntime } from "@services/__mocks__/testData";

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("StoryEvaluationCoordinator", () => {
  it("queues arbiter evaluations with focused transition candidates and emits selected transition", async () => {
    const checkpointArbiter: CheckpointArbiterApi = {
      evaluate: jest.fn().mockResolvedValue({ outcome: "advance", nextTransitionId: "regex-1", parsed: null, raw: "", request: {} as never }),
      clear: jest.fn(),
      updateOptions: jest.fn(),
    };
    const applyArbiterPreset = jest.fn();
    const notifyArbiterPhase = jest.fn();
    const updateStoryMacros = jest.fn();
    const onTurnTick = jest.fn();
    const onEvaluated = jest.fn();
    const story = createBasicStory({
      checkpoints: [
        { id: "cp-1", name: "CP1", objective: "obj-1" },
        { id: "cp-2", name: "CP2", objective: "obj-2" },
      ],
      transitions: [
        { id: "regex-1", from: "cp-1", to: "cp-2", label: "Open", trigger: { type: "regex", regexes: [/door/i], condition: "door" } },
      ],
    }) as any;

    const coordinator = new StoryEvaluationCoordinator({
      story,
      checkpointArbiter,
      setTurnsSinceEval: jest.fn().mockReturnValue(createRuntime()),
      applyArbiterPreset,
      notifyArbiterPhase,
      updateStoryMacros,
      onTurnTick,
      onEvaluated,
    });

    coordinator.queueEvaluation({
      reason: "trigger",
      latestText: "open door",
      matches: [{ transition: story.transitions[0], trigger: story.transitions[0].trigger, pattern: "/door/i" } as any],
      activeTransitions: story.transitions,
      turn: 4,
      intervalTurns: 3,
      checkpointIndex: 0,
    });

    await flushPromises();

    expect(checkpointArbiter.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      cpName: "CP1",
      reason: "trigger",
      candidates: [expect.objectContaining({ id: "regex-1", targetName: "CP2" })],
    }));
    expect(applyArbiterPreset).toHaveBeenCalledWith(story.checkpoints[0]);
    expect(notifyArbiterPhase).toHaveBeenNthCalledWith(1, "before");
    expect(notifyArbiterPhase).toHaveBeenNthCalledWith(2, "after");
    expect(updateStoryMacros).toHaveBeenCalled();
    expect(onTurnTick).toHaveBeenCalledWith({ turn: 4, sinceEval: 0 });
    expect(onEvaluated).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "advance",
      selectedTransition: expect.objectContaining({ id: "regex-1", targetId: "cp-2" }),
    }));
  });

  it("prefers the earliest timed transition threshold", () => {
    const coordinator = new StoryEvaluationCoordinator({
      story: createBasicStory({
        checkpoints: [
          { id: "cp-1", name: "CP1", objective: "obj-1" },
          { id: "cp-2", name: "CP2", objective: "obj-2" },
          { id: "cp-3", name: "CP3", objective: "obj-3" },
        ],
      }) as any,
      checkpointArbiter: { evaluate: jest.fn(), clear: jest.fn(), updateOptions: jest.fn() },
      setTurnsSinceEval: jest.fn().mockReturnValue(createRuntime()),
      applyArbiterPreset: jest.fn(),
      notifyArbiterPhase: jest.fn(),
      updateStoryMacros: jest.fn(),
    });

    const activeTransitions = [
      { id: "late", from: "cp-1", to: "cp-3", trigger: { type: "timed", withinTurns: 4 } },
      { id: "early", from: "cp-1", to: "cp-2", trigger: { type: "timed", withinTurns: 2 } },
    ] as any;

    const match = coordinator.findTriggeredTimedTransition(activeTransitions, 4);

    expect(match?.transition.id).toBe("early");
    expect(match?.pattern).toBe("timed<=2");
  });
});
