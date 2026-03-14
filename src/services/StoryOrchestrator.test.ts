import StoryOrchestrator from "@services/StoryOrchestrator";
import { createRuntime } from "@services/__mocks__/testData";
import { sanitizeArbiterFrequency, sanitizeArbiterPrompt } from "@utils/arbiter";
import { executeSlashCommands } from "@services/STAPI";
import { evaluateTransitionTriggers } from "@utils/story-state";
import {
  getChatSessionBridgeSnapshot,
  releaseChatSessionBridge,
  retainChatSessionBridge,
  subscribeToChatSessionBridge,
} from "@controllers/chatSessionBridge";
import type { NormalizedCheckpoint, NormalizedStory } from "@utils/story-validator";

const checkpointArbiterInstance = {
  evaluate: jest.fn(),
  clear: jest.fn(),
  updateOptions: jest.fn(),
};

const presetServiceInstance = {
  initForStory: jest.fn().mockResolvedValue(undefined),
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
  resetRuntime: jest.fn(),
  canPersist: jest.fn().mockReturnValue(true),
  writeRuntime: jest.fn(),
  isHydrated: jest.fn().mockReturnValue(true),
  updateCheckpointStatus: jest.fn(),
  setTurnsSinceEval: jest.fn(),
  setChatContext: jest.fn(),
  hydrate: jest.fn(),
  dispose: jest.fn(),
};

const storeSubscribers = new Set<() => void>();
const storeState = {
  runtime: createRuntime(),
  turn: 0,
  requirements: {
    requirementsReady: false,
  },
  setRuntime: jest.fn((next: any) => {
    storeState.runtime = next;
    return next;
  }),
  setTurn: jest.fn((value: number) => {
    storeState.turn = value;
    return value;
  }),
  resetRequirements: jest.fn(() => {
    storeState.requirements = { requirementsReady: false };
  }),
  setChatContext: jest.fn(),
  setStory: jest.fn(),
  setExpansion: jest.fn(),
  resetExpansion: jest.fn(),
  setOrchestratorReady: jest.fn(),
  setRoadmap: jest.fn(),
  roadmap: null,
  expansion: { isExpanding: false, phase: null, phaseDone: {}, preview: null },
};

let contextState: any;

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
  enableWIEntry: jest.fn(),
  disableWIEntry: jest.fn(),
  executeSlashCommands: jest.fn(),
}));

jest.mock("@services/stHost/authorNotes", () => ({
  applyCharacterAN: jest.fn(),
  clearCharacterAN: jest.fn(),
}));

jest.mock("@utils/slash-commands", () => ({
  registerStoryExtensionCommands: jest.fn(),
}));

jest.mock("@utils/story-macros", () => ({
  updateStoryMacroSnapshot: jest.fn(),
  resetStoryMacroSnapshot: jest.fn(),
  refreshRoleMacros: jest.fn(),
}));

const generatorServiceInstance = {
  expandCheckpoint: jest.fn(),
};

jest.mock("@services/StoryGeneratorService", () => {
  const StoryGeneratorService = jest.fn().mockImplementation(() => ({
    expandCheckpoint: generatorServiceInstance.expandCheckpoint,
  }));
  (StoryGeneratorService as any).buildCharacterSummaries = jest.fn(() => []);
  (StoryGeneratorService as any).buildWorldInfoSummaries = jest.fn(() => []);
  return { StoryGeneratorService };
});

jest.mock("@controllers/chatSessionBridge", () => ({
  getChatSessionBridgeSnapshot: jest.fn(),
  retainChatSessionBridge: jest.fn(),
  releaseChatSessionBridge: jest.fn(),
  subscribeToChatSessionBridge: jest.fn(() => jest.fn()),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: () => storeState,
    subscribe: jest.fn((listener: () => void) => {
      storeSubscribers.add(listener);
      return () => {
        storeSubscribers.delete(listener);
      };
    }),
  },
}));

jest.mock("@utils/story-state", () => ({
  clampCheckpointIndex: jest.fn((idx: number, story: any) => {
    const max = Math.max(0, (story?.checkpoints?.length ?? 1) - 1);
    return Math.max(0, Math.min(Math.floor(idx), max));
  }),
  sanitizeRuntime: jest.fn((runtime: any) => runtime),
  sanitizeTurnsSinceEval: jest.fn((n: number) => Math.max(0, Math.floor(n))),
  CheckpointStatus: {
    Complete: "complete",
    Failed: "failed",
    Current: "current",
    Pending: "pending",
  },
  computeStatusMapForIndex: jest.fn((story: any, index: number) => {
    const current = story?.checkpoints?.[index]?.id ?? null;
    return current ? { [current]: "current" } : {};
  }),
  deriveCheckpointStatuses: jest.fn(() => []),
  evaluateTransitionTriggers: jest.fn(() => []),
}));

const executeSlashCommandsMock = executeSlashCommands as jest.MockedFunction<typeof executeSlashCommands>;
const evaluateTransitionTriggersMock = evaluateTransitionTriggers as jest.MockedFunction<typeof evaluateTransitionTriggers>;
const getChatSessionBridgeSnapshotMock = getChatSessionBridgeSnapshot as jest.MockedFunction<typeof getChatSessionBridgeSnapshot>;
const retainChatSessionBridgeMock = retainChatSessionBridge as jest.MockedFunction<typeof retainChatSessionBridge>;
const releaseChatSessionBridgeMock = releaseChatSessionBridge as jest.MockedFunction<typeof releaseChatSessionBridge>;
const subscribeToChatSessionBridgeMock = subscribeToChatSessionBridge as jest.MockedFunction<typeof subscribeToChatSessionBridge>;

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const emitRequirementsReady = () => {
  storeState.requirements = { requirementsReady: true };
  for (const subscriber of Array.from(storeSubscribers)) {
    subscriber();
  }
};

const createNormalizedStory = (overrides: Partial<NormalizedStory> = {}): NormalizedStory => ({
  schemaVersion: "2.0",
  title: "Story 1",
  description: "desc",
  global_lorebook: "Lorebook",
  roles: { dm: "DM" },
  checkpoints: [{ id: "cp-1", name: "CP1", objective: "obj" }],
  transitions: [],
  startId: "cp-1",
  ...overrides,
});

const createRegexTrigger = (condition: string, regexes: RegExp[]) => ({
  type: "regex" as const,
  regexes,
  condition,
  raw: { type: "regex" as const, patterns: [condition], condition },
});

const createTimedTrigger = (withinTurns: number) => ({
  type: "timed" as const,
  regexes: [],
  withinTurns,
  raw: { type: "timed" as const, within_turns: withinTurns },
});

const createStory = () => createNormalizedStory({
  checkpoints: [
    { id: "cp-1", name: "CP1", objective: "obj-1", automations: ["/one"] },
    { id: "cp-2", name: "CP2", objective: "obj-2", automations: ["/two"] },
    { id: "cp-3", name: "CP3", objective: "obj-3" },
  ],
  transitions: [
    {
      id: "regex-1",
      from: "cp-1",
      to: "cp-2",
      trigger: createRegexTrigger("door", [/door/i]),
    },
    {
      id: "timed-1",
      from: "cp-1",
      to: "cp-3",
      trigger: createTimedTrigger(2),
    },
  ],
});

describe("StoryOrchestrator", () => {
  beforeEach(() => {
    checkpointArbiterInstance.evaluate.mockReset();
    checkpointArbiterInstance.clear.mockReset();
    checkpointArbiterInstance.updateOptions.mockReset();
    presetServiceInstance.initForStory.mockClear();
    presetServiceInstance.applyBasePreset.mockReset();
    presetServiceInstance.applyForRole.mockReset();
    talkControlServiceInstance.start.mockReset();
    talkControlServiceInstance.setCheckpoint.mockReset();
    talkControlServiceInstance.getInterceptor.mockReset();
    talkControlServiceInstance.notifyArbiterPhase.mockReset();
    talkControlServiceInstance.updateTurn.mockReset();
    talkControlServiceInstance.dispose.mockReset();
    requirementsControllerInstance.setStory.mockReset();
    requirementsControllerInstance.start.mockReset();
    requirementsControllerInstance.handleChatContextChanged.mockReset();
    requirementsControllerInstance.reloadPersona.mockReset();
    requirementsControllerInstance.dispose.mockReset();
    persistenceControllerInstance.setStory.mockReset();
    persistenceControllerInstance.resetRuntime.mockReset();
    persistenceControllerInstance.canPersist.mockClear();
    persistenceControllerInstance.writeRuntime.mockReset();
    persistenceControllerInstance.isHydrated.mockClear();
    persistenceControllerInstance.updateCheckpointStatus.mockReset();
    persistenceControllerInstance.setTurnsSinceEval.mockReset();
    persistenceControllerInstance.setChatContext.mockReset();
    persistenceControllerInstance.hydrate.mockReset();
    persistenceControllerInstance.dispose.mockReset();
    executeSlashCommandsMock.mockReset();
    executeSlashCommandsMock.mockResolvedValue(true);
    evaluateTransitionTriggersMock.mockReset();
    getChatSessionBridgeSnapshotMock.mockReset();
    retainChatSessionBridgeMock.mockReset();
    releaseChatSessionBridgeMock.mockReset();
    subscribeToChatSessionBridgeMock.mockReset();
    subscribeToChatSessionBridgeMock.mockReturnValue(jest.fn());
    generatorServiceInstance.expandCheckpoint.mockReset();
    storeSubscribers.clear();
    storeState.turn = 0;
    storeState.runtime = createRuntime();
    storeState.requirements = { requirementsReady: false };
    contextState = {
      chatId: "chat-1",
      groupId: "group-1",
    };
    getChatSessionBridgeSnapshotMock.mockReturnValue({
      chat: { chatId: "chat-1", groupChatSelected: true },
      generation: { active: false, type: null, dryRun: false, speakerName: null, draftedSpeakerName: null },
    } as any);
    persistenceControllerInstance.resetRuntime.mockImplementation(() => {
      const runtime = createRuntime();
      storeState.runtime = runtime;
      return runtime;
    });
    persistenceControllerInstance.writeRuntime.mockImplementation((next: any) => {
      storeState.runtime = next;
      return next;
    });
    persistenceControllerInstance.setTurnsSinceEval.mockImplementation((next: number) => {
      storeState.runtime = { ...storeState.runtime, turnsSinceEval: next };
      return storeState.runtime;
    });
    persistenceControllerInstance.hydrate.mockReturnValue({
      source: "default",
      runtime: createRuntime(),
    });
    checkpointArbiterInstance.evaluate.mockResolvedValue({ outcome: "advance", nextTransitionId: "regex-1" });
  });

  it("updates arbiter prompt options on setArbiterPrompt", () => {
    const orchestrator = new StoryOrchestrator({
      story: createNormalizedStory(),
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("old prompt"),
    });

    orchestrator.setArbiterPrompt(sanitizeArbiterPrompt("new prompt"));

    expect(checkpointArbiterInstance.updateOptions).toHaveBeenCalledWith({
      promptTemplate: "new prompt",
    });
  });

  it("hydrates stored chat state, defers automations until requirements are ready, then resets on non-group switch", async () => {
    persistenceControllerInstance.hydrate.mockReturnValue({
      source: "stored",
      runtime: createRuntime({ checkpointIndex: 1, activeCheckpointKey: "cp-2" }),
    });

    const orchestrator = new StoryOrchestrator({
      story: createStory(),
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
    });

    await orchestrator.init();

    expect(persistenceControllerInstance.setChatContext).toHaveBeenCalledWith({ chatId: "chat-1", groupChatSelected: true });
    expect(talkControlServiceInstance.setCheckpoint).toHaveBeenCalledWith("cp-2", { emitEnter: false });
    expect(executeSlashCommandsMock).not.toHaveBeenCalled();

    emitRequirementsReady();
    await flushPromises();

    expect(presetServiceInstance.applyBasePreset).toHaveBeenCalledTimes(1);
    expect(executeSlashCommandsMock).toHaveBeenCalledWith(["/two"], { silent: true, delayMs: 150 });

    contextState = { ...contextState, chatId: "chat-2", groupId: null };
    storeState.requirements = { requirementsReady: false };
    (orchestrator as any).handleChatChanged({ reason: "event", chat: { chatId: "chat-2", groupChatSelected: false } });

    expect(persistenceControllerInstance.resetRuntime).toHaveBeenCalledTimes(2);
    expect(persistenceControllerInstance.setChatContext).toHaveBeenLastCalledWith({ chatId: "chat-2", groupChatSelected: false });
    expect(storeState.runtime.activeCheckpointKey).toBe("cp-1");
  });

  it("runs manual checkpoint activation without TDZ errors and emits enter behavior", async () => {
    storeState.requirements = { requirementsReady: true };
    const onActivateIndex = jest.fn();
    const orchestrator = new StoryOrchestrator({
      story: createStory(),
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
      onActivateIndex,
    });

    orchestrator.activateIndex(1);
    await flushPromises();

    expect(storeState.runtime.activeCheckpointKey).toBe("cp-2");
    expect(talkControlServiceInstance.setCheckpoint).toHaveBeenCalledWith("cp-2", { emitEnter: true });
    expect(executeSlashCommandsMock).toHaveBeenCalledWith(["/two"], { silent: true, delayMs: 150 });
    expect(onActivateIndex).toHaveBeenCalledWith(1);
  });

  it("applies deferred effects exactly once after requirements become ready for the active checkpoint", async () => {
    const orchestrator = new StoryOrchestrator({
      story: createStory(),
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
    });

    await orchestrator.init();
    orchestrator.activateIndex(1);

    expect(executeSlashCommandsMock).not.toHaveBeenCalled();

    emitRequirementsReady();
    await flushPromises();
    emitRequirementsReady();
    await flushPromises();

    expect(presetServiceInstance.applyBasePreset).toHaveBeenCalledTimes(1);
    expect(executeSlashCommandsMock).toHaveBeenCalledTimes(1);
    expect(executeSlashCommandsMock).toHaveBeenCalledWith(["/two"], { silent: true, delayMs: 150 });
  });

  it("re-applies deferred effects for a new chat context but only once per context", async () => {
    persistenceControllerInstance.hydrate
      .mockReturnValueOnce({
        source: "stored",
        runtime: createRuntime({ checkpointIndex: 1, activeCheckpointKey: "cp-2" }),
      })
      .mockReturnValueOnce({
        source: "stored",
        runtime: createRuntime({ checkpointIndex: 1, activeCheckpointKey: "cp-2" }),
      });

    const orchestrator = new StoryOrchestrator({
      story: createStory(),
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
    });

    await orchestrator.init();
    emitRequirementsReady();
    await flushPromises();

    expect(executeSlashCommandsMock).toHaveBeenCalledTimes(1);

    storeState.requirements = { requirementsReady: false };
    (orchestrator as any).handleChatChanged({ reason: "event", chat: { chatId: "chat-2", groupChatSelected: true } });

    expect(executeSlashCommandsMock).toHaveBeenCalledTimes(1);

    emitRequirementsReady();
    await flushPromises();
    emitRequirementsReady();
    await flushPromises();

    expect(executeSlashCommandsMock).toHaveBeenCalledTimes(2);
    expect(executeSlashCommandsMock).toHaveBeenLastCalledWith(["/two"], { silent: true, delayMs: 150 });
  });

  it("does not re-run checkpoint effects when requirements toggle after an already-ready activation", async () => {
    storeState.requirements = { requirementsReady: true };
    const orchestrator = new StoryOrchestrator({
      story: createStory(),
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
    });

    orchestrator.activateIndex(1);
    await flushPromises();
    expect(executeSlashCommandsMock).toHaveBeenCalledTimes(1);

    storeState.requirements = { requirementsReady: false };
    for (const subscriber of Array.from(storeSubscribers)) {
      subscriber();
    }
    emitRequirementsReady();
    await flushPromises();

    expect(executeSlashCommandsMock).toHaveBeenCalledTimes(1);
  });

  it("queues arbiter evaluation for regex matches", async () => {
    const evaluated = jest.fn();
    const story = createStory();
    const orchestrator = new StoryOrchestrator({
      story,
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
      setEvalHooks: ({ onEvaluated }) => {
        onEvaluated?.(evaluated);
      },
    });

    await orchestrator.init();
    evaluateTransitionTriggersMock.mockReturnValue([
      {
        transition: story.transitions[0],
        trigger: story.transitions[0].trigger,
        pattern: "/door/i",
      },
    ] as any);

    orchestrator.handleUserText("open the door");
    await flushPromises();

    expect(checkpointArbiterInstance.evaluate).toHaveBeenCalledTimes(1);
    expect(talkControlServiceInstance.notifyArbiterPhase).toHaveBeenCalledWith("before");
    expect(evaluated).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "advance",
      reason: "trigger",
      selectedTransition: expect.objectContaining({ targetId: "cp-2" }),
    }));
  });

  it("advances timed transitions without invoking the arbiter", async () => {
    const evaluated = jest.fn();
    const story = createStory();
    const orchestrator = new StoryOrchestrator({
      story,
      intervalTurns: sanitizeArbiterFrequency(5),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
      setEvalHooks: ({ onEvaluated }) => {
        onEvaluated?.(evaluated);
      },
    });

    await orchestrator.init();
    evaluateTransitionTriggersMock.mockReturnValue([]);

    orchestrator.handleUserText("first turn");
    orchestrator.handleUserText("door on second turn");

    expect(checkpointArbiterInstance.evaluate).not.toHaveBeenCalled();
    expect(evaluated).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "advance",
      reason: "timed",
      selectedTransition: expect.objectContaining({ targetId: "cp-3" }),
    }));
  });

  it("prevents stub expansion re-entry while an expansion is already in flight", async () => {
    const expandDeferred = (() => {
      let resolve!: (value: any) => void;
      const promise = new Promise((nextResolve) => {
        resolve = nextResolve;
      });
      return { promise, resolve };
    })();
    generatorServiceInstance.expandCheckpoint.mockReturnValue(expandDeferred.promise);

    const orchestrator = new StoryOrchestrator({
      story: createNormalizedStory({
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
          {
            id: "to-stub",
            from: "cp-1",
            to: "cp-2",
            trigger: createRegexTrigger("go", [/go/i]),
          },
        ],
      }),
      intervalTurns: sanitizeArbiterFrequency(3),
      arbiterPrompt: sanitizeArbiterPrompt("prompt"),
    });

    await orchestrator.init();
    orchestrator.activateIndex(1);
    orchestrator.activateIndex(1);

    expect(generatorServiceInstance.expandCheckpoint).toHaveBeenCalledTimes(1);
    expect(generatorServiceInstance.expandCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      targetCheckpointId: "cp-2",
      targetCheckpointName: "Stub",
      transitionCondition: "go",
    }), expect.any(Function));

    expandDeferred.resolve({ checkpoint: { id: "cp-2", name: "Stub", objective: "obj-2", stub: { isStub: true } }, roadmap: "roadmap" });
    await flushPromises();
  });

  it("disposes dependencies and resets talk-control checkpoint", () => {
    const orchestrator = new StoryOrchestrator({
      story: createNormalizedStory(),
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
