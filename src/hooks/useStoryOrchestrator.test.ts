/** @jest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useStoryOrchestrator, type StoryOrchestratorResult } from "@hooks/useStoryOrchestrator";
import {
  ensureStory,
  dispose,
  getOrchestrator,
  setHooks,
  setIntervalTurns,
  setArbiterPrompt,
  setFallbackPreset,
} from "@controllers/orchestratorManager";

jest.mock("zustand", () => ({
  useStore: (_store: unknown, selector: (s: any) => unknown) => selector({
    requirements: {
      requirementsReady: true,
      currentUserName: "Player",
      personaDefined: true,
      groupChatSelected: false,
      missingGroupMembers: [],
      worldLoreEntriesPresent: true,
      worldLoreEntriesMissing: [],
      globalLoreBookPresent: true,
      globalLoreBookMissing: [],
    },
    runtime: {
      checkpointIndex: 1,
      activeCheckpointKey: "cp-1",
      turnsSinceEval: 2,
      checkpointTurnCount: 2,
      checkpointStatusMap: {},
    },
    hydrated: true,
    orchestratorReady: true,
  }),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {},
}));

jest.mock("@controllers/orchestratorManager", () => ({
  ensureStory: jest.fn(() => Promise.resolve()),
  dispose: jest.fn(),
  getOrchestrator: jest.fn(),
  setHooks: jest.fn(),
  setIntervalTurns: jest.fn(),
  setArbiterPrompt: jest.fn(),
  setFallbackPreset: jest.fn(),
}));

const ensureStoryMock = ensureStory as jest.MockedFunction<typeof ensureStory>;
const disposeMock = dispose as jest.MockedFunction<typeof dispose>;
const getOrchestratorMock = getOrchestrator as jest.MockedFunction<typeof getOrchestrator>;
const setHooksMock = setHooks as jest.MockedFunction<typeof setHooks>;
const setIntervalTurnsMock = setIntervalTurns as jest.MockedFunction<typeof setIntervalTurns>;
const setArbiterPromptMock = setArbiterPrompt as jest.MockedFunction<typeof setArbiterPrompt>;
const setFallbackPresetMock = setFallbackPreset as jest.MockedFunction<typeof setFallbackPreset>;

function renderHook(props: {
  story: any;
  intervalTurns: any;
  options?: {
    onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
    onEvaluated?: (ev: any) => void;
    arbiterPrompt?: any;
    fallbackPreset?: string | null;
  };
}) {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  const state: { current: StoryOrchestratorResult | null } = { current: null };

  function Probe(nextProps: typeof props) {
    state.current = useStoryOrchestrator(nextProps.story, nextProps.intervalTurns, nextProps.options);
    return null;
  }

  act(() => {
    root.render(createElement(Probe, props));
  });

  return {
    get current() {
      if (!state.current) throw new Error("Hook state unavailable");
      return state.current;
    },
    rerender(nextProps: typeof props) {
      act(() => {
        root.render(createElement(Probe, nextProps));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useStoryOrchestrator", () => {
  const originalActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = originalActEnv;
  });

  beforeEach(() => {
    ensureStoryMock.mockClear();
    disposeMock.mockClear();
    setHooksMock.mockClear();
    setIntervalTurnsMock.mockClear();
    setArbiterPromptMock.mockClear();
    setFallbackPresetMock.mockClear();
    getOrchestratorMock.mockReset();
    getOrchestratorMock.mockReturnValue({
      reloadPersona: jest.fn(),
      updateCheckpointStatus: jest.fn(),
      setOnActivateCheckpoint: jest.fn(),
      activateIndex: jest.fn(),
    } as any);
  });

  it("wires orchestrator effects and cleans up on unmount", () => {
    const onTurnTick = jest.fn();
    const onEvaluated = jest.fn();
    const hook = renderHook({
      story: { id: "story-1" } as any,
      intervalTurns: 3 as any,
      options: { onTurnTick, onEvaluated, arbiterPrompt: "prompt" as any, fallbackPreset: "preset" },
    });

    expect(setHooksMock).toHaveBeenCalledWith({ onTurnTick, onEvaluated });
    expect(setIntervalTurnsMock).toHaveBeenCalledWith(3);
    expect(setArbiterPromptMock).toHaveBeenCalledWith("prompt");
    expect(setFallbackPresetMock).toHaveBeenCalledWith("preset");
    expect(ensureStoryMock).toHaveBeenCalledWith({ id: "story-1" });
    expect(hook.current.ready).toBe(true);

    hook.unmount();

    expect(setHooksMock).toHaveBeenCalledWith(undefined);
    expect(disposeMock).toHaveBeenCalled();
  });

  it("exposes runtime methods via orchestrator instance", () => {
    const orchestrator = {
      reloadPersona: jest.fn(),
      updateCheckpointStatus: jest.fn(),
      setOnActivateCheckpoint: jest.fn(),
      activateIndex: jest.fn(),
    };
    getOrchestratorMock.mockReturnValue(orchestrator as any);

    const hook = renderHook({
      story: null,
      intervalTurns: 1 as any,
      options: {},
    });
    const onActivate = jest.fn();

    hook.current.reloadPersona();
    hook.current.updateCheckpointStatus(2, "complete");
    hook.current.setOnActivateCheckpoint(onActivate);
    hook.current.activateIndex(3);

    expect(orchestrator.reloadPersona).toHaveBeenCalled();
    expect(orchestrator.updateCheckpointStatus).toHaveBeenCalledWith(2, "complete");
    expect(orchestrator.setOnActivateCheckpoint).toHaveBeenCalledWith(onActivate);
    expect(orchestrator.activateIndex).toHaveBeenCalledWith(3);
    hook.unmount();
  });
});
