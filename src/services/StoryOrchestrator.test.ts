import StoryOrchestrator from "@services/StoryOrchestrator";
import { createBasicStory, createRuntime } from "@services/__mocks__/testData";
import { sanitizeArbiterFrequency, sanitizeArbiterPrompt } from "@utils/arbiter";

const checkpointArbiterInstance = {
  evaluate: jest.fn(),
  clear: jest.fn(),
  updateOptions: jest.fn(),
};

const presetServiceInstance = {
  initForStory: jest.fn(),
  applyBasePreset: jest.fn(),
  applyForRole: jest.fn(),
};

const talkControlServiceInstance = {
  start: jest.fn(),
  setCheckpoint: jest.fn(),
  getInterceptor: jest.fn(),
  notifyArbiterPhase: jest.fn(),
  updateTurn: jest.fn(),
  dispose: jest.fn(),
};

const requirementsControllerInstance = {
  setStory: jest.fn(),
  start: jest.fn(),
  handleChatContextChanged: jest.fn(),
  reloadPersona: jest.fn(),
  dispose: jest.fn(),
};

const persistenceControllerInstance = {
  setStory: jest.fn(),
  resetRuntime: jest.fn().mockReturnValue(createRuntime()),
  canPersist: jest.fn().mockReturnValue(true),
  writeRuntime: jest.fn(),
  isHydrated: jest.fn().mockReturnValue(true),
  updateCheckpointStatus: jest.fn(),
  setTurnsSinceEval: jest.fn().mockReturnValue(createRuntime()),
  setChatContext: jest.fn(),
  hydrate: jest.fn().mockReturnValue({
    source: "default",
    runtime: createRuntime(),
  }),
  dispose: jest.fn(),
};

const storeState = {
  runtime: createRuntime(),
  turn: 0,
  setRuntime: jest.fn((next: any) => {
    storeState.runtime = next;
    return next;
  }),
  setTurn: jest.fn((value: number) => {
    storeState.turn = value;
    return value;
  }),
  resetRequirements: jest.fn(),
  setChatContext: jest.fn(),
  setStory: jest.fn(),
};

jest.mock("@services/CheckpointArbiterService", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => checkpointArbiterInstance),
}));

jest.mock("@services/PresetService", () => ({
  PresetService: jest.fn().mockImplementation(() => presetServiceInstance),
}));

jest.mock("@services/TalkControlService", () => ({
  TalkControlService: jest.fn().mockImplementation(() => talkControlServiceInstance),
}));

jest.mock("@controllers/requirementsController", () => ({
  createRequirementsController: jest.fn(() => requirementsControllerInstance),
}));

jest.mock("@controllers/persistenceController", () => ({
  createPersistenceController: jest.fn(() => persistenceControllerInstance),
}));

jest.mock("@services/STAPI", () => ({
  applyCharacterAN: jest.fn(),
  clearCharacterAN: jest.fn(),
  enableWIEntry: jest.fn(),
  disableWIEntry: jest.fn(),
  executeSlashCommands: jest.fn(),
  getContext: jest.fn().mockReturnValue({ eventSource: {}, eventTypes: {} }),
}));

jest.mock("@utils/slash-commands", () => ({
  registerStoryExtensionCommands: jest.fn(),
}));

jest.mock("@utils/story-macros", () => ({
  updateStoryMacroSnapshot: jest.fn(),
  resetStoryMacroSnapshot: jest.fn(),
  refreshRoleMacros: jest.fn(),
}));

jest.mock("@utils/event-source", () => ({
  subscribeToEventSource: jest.fn(() => jest.fn()),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: () => storeState,
    subscribe: jest.fn(() => jest.fn()),
  },
}));

jest.mock("@utils/story-state", () => ({
  clampCheckpointIndex: jest.fn(() => 0),
  sanitizeTurnsSinceEval: jest.fn((n: number) => n),
  CheckpointStatus: {
    Complete: "complete",
    Failed: "failed",
    Current: "current",
    Pending: "pending",
  },
  computeStatusMapForIndex: jest.fn(() => ({})),
  deriveCheckpointStatuses: jest.fn(() => []),
  evaluateTransitionTriggers: jest.fn(() => []),
}));

describe("StoryOrchestrator", () => {
  beforeEach(() => {
    checkpointArbiterInstance.evaluate.mockReset();
    checkpointArbiterInstance.clear.mockReset();
    checkpointArbiterInstance.updateOptions.mockReset();
    presetServiceInstance.initForStory.mockReset();
    presetServiceInstance.applyBasePreset.mockReset();
    presetServiceInstance.applyForRole.mockReset();
    talkControlServiceInstance.start.mockReset();
    talkControlServiceInstance.setCheckpoint.mockReset();
    talkControlServiceInstance.getInterceptor.mockReset();
    talkControlServiceInstance.notifyArbiterPhase.mockReset();
    talkControlServiceInstance.updateTurn.mockReset();
    talkControlServiceInstance.dispose.mockReset();
    requirementsControllerInstance.dispose.mockReset();
    persistenceControllerInstance.dispose.mockReset();
    storeState.turn = 0;
    storeState.runtime = createRuntime();
  });

  it("updates arbiter prompt options on setArbiterPrompt", () => {
    const orchestrator = new StoryOrchestrator({
      story: createBasicStory() as any,
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("old prompt"),
    });

    orchestrator.setArbiterPrompt(sanitizeArbiterPrompt("new prompt"));

    expect(checkpointArbiterInstance.updateOptions).toHaveBeenCalledWith({
      promptTemplate: "new prompt",
    });
  });

  it("returns false for evaluateNow when no regex transitions are active", () => {
    const orchestrator = new StoryOrchestrator({
      story: createBasicStory() as any,
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
    });

    expect(orchestrator.evaluateNow()).toBe(false);
  });

  it("disposes dependencies and resets talk-control checkpoint", () => {
    const orchestrator = new StoryOrchestrator({
      story: createBasicStory() as any,
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
    });

    orchestrator.dispose();

    expect(requirementsControllerInstance.dispose).toHaveBeenCalled();
    expect(persistenceControllerInstance.dispose).toHaveBeenCalled();
    expect(talkControlServiceInstance.setCheckpoint).toHaveBeenCalledWith(null, { emitEnter: false });
    expect(talkControlServiceInstance.dispose).toHaveBeenCalled();
  });
});
