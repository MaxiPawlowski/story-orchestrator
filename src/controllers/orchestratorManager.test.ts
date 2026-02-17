import { createBasicStory } from "@services/__mocks__/testData";

describe("orchestratorManager", () => {
  const loadModule = async () => {
    jest.resetModules();

    const turnControllerMock = {
      attach: jest.fn(),
      detach: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      dispose: jest.fn(),
      shouldApplyRole: jest.fn(() => true),
      reset: jest.fn(),
    };

    const orchestratorInstance = {
      index: 0,
      init: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      setIntervalTurns: jest.fn(),
      setArbiterPrompt: jest.fn(),
      getTalkControlInterceptor: jest.fn(),
    };

    const setOrchestratorReady = jest.fn();
    const setStory = jest.fn();
    const resetRequirements = jest.fn();
    const storeState = {
      setOrchestratorReady,
      setStory,
      resetRequirements,
    };

    jest.doMock("@controllers/turnController", () => ({
      createTurnController: jest.fn(() => turnControllerMock),
    }));

    const StoryOrchestratorCtor = jest.fn(() => orchestratorInstance);
    jest.doMock("@services/StoryOrchestrator", () => ({
      __esModule: true,
      default: StoryOrchestratorCtor,
    }));

    jest.doMock("@store/storySessionStore", () => ({
      storySessionStore: {
        getState: () => storeState,
      },
    }));

    const manager = await import("@controllers/orchestratorManager");
    return {
      manager,
      turnControllerMock,
      orchestratorInstance,
      StoryOrchestratorCtor,
      setOrchestratorReady,
      setStory,
      resetRequirements,
    };
  };

  it("initializes orchestrator and updates readiness", async () => {
    const {
      manager,
      turnControllerMock,
      orchestratorInstance,
      StoryOrchestratorCtor,
      setOrchestratorReady,
    } = await loadModule();
    const story = createBasicStory();

    manager.setIntervalTurns(3 as any);
    manager.setArbiterPrompt("prompt" as any);
    await manager.ensureStory(story as any);

    expect(StoryOrchestratorCtor).toHaveBeenCalledTimes(1);
    expect(turnControllerMock.attach).toHaveBeenCalledWith(orchestratorInstance);
    expect(turnControllerMock.start).toHaveBeenCalledTimes(1);
    expect(orchestratorInstance.init).toHaveBeenCalledTimes(1);
    expect(setOrchestratorReady).toHaveBeenCalledWith(false);
    expect(setOrchestratorReady).toHaveBeenCalledWith(true);

    await manager.ensureStory(null);
    expect(turnControllerMock.detach).toHaveBeenCalled();
    expect(orchestratorInstance.dispose).toHaveBeenCalled();
  });

  it("pauses and resumes automation correctly", async () => {
    const {
      manager,
      turnControllerMock,
      setOrchestratorReady,
      setStory,
      resetRequirements,
    } = await loadModule();

    expect(manager.pauseAutomation()).toBe(true);
    expect(manager.pauseAutomation()).toBe(false);
    expect(turnControllerMock.stop).toHaveBeenCalledTimes(1);

    manager.setIntervalTurns(3 as any);
    manager.setArbiterPrompt("prompt" as any);
    await manager.ensureStory(createBasicStory() as any);
    expect(turnControllerMock.start).not.toHaveBeenCalled();

    expect(manager.resumeAutomation()).toBe(true);
    expect(turnControllerMock.start).toHaveBeenCalledTimes(1);

    await manager.dispose();
    expect(setOrchestratorReady).toHaveBeenCalledWith(false);
    expect(setStory).toHaveBeenCalledWith(null);
    expect(resetRequirements).toHaveBeenCalledTimes(1);
  });
});
