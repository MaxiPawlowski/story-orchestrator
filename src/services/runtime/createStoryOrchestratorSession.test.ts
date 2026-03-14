import { createBasicStory } from "@services/__mocks__/testData";

describe("createStoryOrchestratorSession", () => {
  const loadModule = async () => {
    jest.resetModules();

    const turnControllerMock = {
      attach: jest.fn(),
      detach: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      shouldApplyRole: jest.fn(() => true),
    };

    const orchestratorInstance = {
      index: 0,
      init: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      setIntervalTurns: jest.fn(),
      setArbiterPrompt: jest.fn(),
      setExpandCallback: jest.fn(),
      getTalkControlInterceptor: jest.fn(() => "interceptor"),
    };

    const StoryOrchestratorCtor = jest.fn(() => orchestratorInstance);
    const storeState = {
      setOrchestratorReady: jest.fn(),
      setStory: jest.fn(),
      resetRequirements: jest.fn(),
    };

    jest.doMock("@controllers/turnController", () => ({
      createTurnController: jest.fn(() => turnControllerMock),
    }));

    jest.doMock("@services/StoryOrchestrator", () => ({
      __esModule: true,
      default: StoryOrchestratorCtor,
    }));

    jest.doMock("@store/storySessionStore", () => ({
      storySessionStore: {
        getState: () => storeState,
      },
    }));

    const mod = await import("@services/runtime/createStoryOrchestratorSession");
    return {
      session: mod.createStoryOrchestratorSession(),
      StoryOrchestratorCtor,
      orchestratorInstance,
      turnControllerMock,
      storeState,
    };
  };

  it("initializes and tears down orchestrator state", async () => {
    const { session, StoryOrchestratorCtor, orchestratorInstance, turnControllerMock, storeState } = await loadModule();
    const story = createBasicStory();

    session.setIntervalTurns(3 as any);
    session.setArbiterPrompt("prompt" as any);
    await session.ensureStory(story as any);

    expect(StoryOrchestratorCtor).toHaveBeenCalledTimes(1);
    expect(turnControllerMock.attach).toHaveBeenCalledWith(orchestratorInstance);
    expect(turnControllerMock.start).toHaveBeenCalledTimes(1);
    expect(orchestratorInstance.init).toHaveBeenCalledTimes(1);
    expect(storeState.setOrchestratorReady).toHaveBeenCalledWith(false);
    expect(storeState.setOrchestratorReady).toHaveBeenCalledWith(true);

    await session.dispose();

    expect(turnControllerMock.detach).toHaveBeenCalled();
    expect(orchestratorInstance.dispose).toHaveBeenCalled();
    expect(storeState.setOrchestratorReady).toHaveBeenLastCalledWith(false);
  });

  it("reuses the current runtime for equivalent story content", async () => {
    const { session, StoryOrchestratorCtor, orchestratorInstance } = await loadModule();
    const story = createBasicStory();
    const sameStoryDifferentRef = {
      ...story,
      checkpoints: (story.checkpoints as any[]).map((checkpoint) => ({ ...checkpoint })),
      transitions: (story.transitions as any[]).map((transition) => ({ ...transition })),
    };

    await session.ensureStory(story as any);
    await session.ensureStory(sameStoryDifferentRef as any);

    expect(StoryOrchestratorCtor).toHaveBeenCalledTimes(1);
    expect(orchestratorInstance.setIntervalTurns).toHaveBeenCalled();
    expect(orchestratorInstance.setArbiterPrompt).toHaveBeenCalled();
  });

  it("preserves pause state across initialization and resume", async () => {
    const { session, turnControllerMock } = await loadModule();

    expect(session.pauseAutomation()).toBe(true);
    expect(turnControllerMock.stop).toHaveBeenCalledTimes(1);

    await session.ensureStory(createBasicStory() as any);
    expect(turnControllerMock.start).not.toHaveBeenCalled();

    expect(session.resumeAutomation()).toBe(true);
    expect(turnControllerMock.start).toHaveBeenCalledTimes(1);
  });
});
