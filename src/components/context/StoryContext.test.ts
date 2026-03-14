/** @jest-environment jsdom */

import { act, createElement, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import StoryContext, { StoryProvider } from "@components/context/StoryContext";
import {
  releaseChatSessionBridge,
  retainChatSessionBridge,
  subscribeToChatSessionBridge,
} from "@controllers/chatSessionBridge";

const useExtensionSettingsMock = jest.fn();
const useStoryLibraryMock = jest.fn();
const ensureStoryMacrosMock = jest.fn();
const refreshRoleMacrosMock = jest.fn();
const setActiveOrchestratorSessionMock = jest.fn();
const getPersistedStorySelectionMock = jest.fn();
const deriveCheckpointSummariesMock = jest.fn();
const parseAndNormalizeStoryMock = jest.fn((value) => value);

const selectEntryMock = jest.fn();
const reloadLibraryMock = jest.fn().mockResolvedValue(undefined);
const saveStoryMock = jest.fn().mockResolvedValue({ ok: true, key: "saved:a" });
const deleteStoryMock = jest.fn().mockResolvedValue({ ok: true });
const activateIndexMock = jest.fn();
const reloadPersonaMock = jest.fn();
const updateCheckpointStatusMock = jest.fn();
const setExpandCallbackMock = jest.fn();
const setHooksMock = jest.fn();
const setIntervalTurnsMock = jest.fn();
const setArbiterPromptMock = jest.fn();
const setFallbackPresetMock = jest.fn();
const ensureStoryMock = jest.fn((_story?: unknown) => Promise.resolve());
const disposeMock = jest.fn(() => Promise.resolve());

const setStoryKeyMock = jest.fn();
const setRoadmapMock = jest.fn();

let contextState: { chatId: string | null; groupChatSelected: boolean };
let storeState: any;
let sessionExpandCallback: ((result: any, fromId: string) => Promise<void>) | null = null;
let sessionHooks: { onEvaluated?: (event: any) => void } | undefined;
const eventHandlers: Array<(event: any) => void> = [];

const sessionMock = {
  ensureStory: (story: unknown) => ensureStoryMock(story),
  dispose: () => disposeMock(),
  getOrchestrator: jest.fn(() => ({
    activateIndex: activateIndexMock,
    reloadPersona: reloadPersonaMock,
    updateCheckpointStatus: updateCheckpointStatusMock,
  })),
  getTalkControlInterceptor: jest.fn(() => undefined),
  pauseAutomation: jest.fn(() => false),
  resumeAutomation: jest.fn(() => false),
  isAutomationPaused: jest.fn(() => false),
  setHooks: jest.fn((hooks: { onEvaluated?: (event: any) => void } | undefined) => {
    sessionHooks = hooks;
    setHooksMock(hooks);
  }),
  setIntervalTurns: (value: unknown) => setIntervalTurnsMock(value),
  setArbiterPrompt: (value: unknown) => setArbiterPromptMock(value),
  setFallbackPreset: (value: unknown) => setFallbackPresetMock(value),
  setExpandCallback: jest.fn((cb: any) => {
    sessionExpandCallback = cb;
    setExpandCallbackMock(cb);
  }),
};

jest.mock("zustand", () => ({
  useStore: (_store: unknown, selector: (state: any) => unknown) => selector(storeState),
}));

jest.mock("@components/context/ExtensionSettingsContext", () => ({
  useExtensionSettings: () => useExtensionSettingsMock(),
}));

jest.mock("@hooks/useStoryLibrary", () => ({
  useStoryLibrary: () => useStoryLibraryMock(),
}));

jest.mock("@controllers/chatSessionBridge", () => ({
  getChatSessionBridgeSnapshot: jest.fn(() => ({ chat: contextState })),
  retainChatSessionBridge: jest.fn(),
  releaseChatSessionBridge: jest.fn(),
  subscribeToChatSessionBridge: jest.fn((handler: any) => {
    eventHandlers.push(handler);
    return jest.fn();
  }),
}));

jest.mock("@utils/story-state", () => ({
  deriveCheckpointSummaries: (...args: unknown[]) => deriveCheckpointSummariesMock(...args),
  CheckpointStatus: {
    Complete: "complete",
    Failed: "failed",
    Current: "current",
    Pending: "pending",
  },
  getPersistedStorySelection: (...args: unknown[]) => getPersistedStorySelectionMock(...args),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: () => ({
      setStoryKey: setStoryKeyMock,
      setRoadmap: setRoadmapMock,
      ...storeState,
    }),
  },
}));

jest.mock("@utils/story-macros", () => ({
  ensureStoryMacros: () => ensureStoryMacrosMock(),
  refreshRoleMacros: (...args: unknown[]) => refreshRoleMacrosMock(...args),
}));

jest.mock("@controllers/orchestratorManager", () => ({
  setActiveOrchestratorSession: (...args: unknown[]) => setActiveOrchestratorSessionMock(...args),
}));

jest.mock("@services/runtime/createStoryOrchestratorSession", () => ({
  createStoryOrchestratorSession: () => sessionMock,
}));

jest.mock("@utils/story-validator", () => ({
  parseAndNormalizeStory: (value: unknown) => parseAndNormalizeStoryMock(value),
  formatZodError: jest.fn(() => ["bad story"]),
}));

function renderProvider() {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  const state: { current: any } = { current: null };

  function Probe() {
    state.current = useContext(StoryContext);
    return null;
  }

  act(() => {
    root.render(createElement(StoryProvider, null, createElement(Probe)));
  });

  return {
    get current() {
      return state.current;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("StoryProvider", () => {
  const originalActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = originalActEnv;
  });

  beforeEach(() => {
    eventHandlers.length = 0;
    sessionExpandCallback = null;
    contextState = {
      chatId: "chat-1",
      groupChatSelected: true,
    };
    storeState = {
      chatId: contextState.chatId,
      groupChatSelected: contextState.groupChatSelected,
      requirements: {
        requirementsReady: false,
        currentUserName: "Player",
        personaDefined: true,
        groupChatSelected: true,
        missingGroupMembers: [],
        worldLoreEntriesPresent: true,
        worldLoreEntriesMissing: [],
        globalLoreBookPresent: true,
        globalLoreBookMissing: [],
      },
      runtime: {
        checkpointIndex: 0,
        activeCheckpointKey: null,
        turnsSinceEval: 0,
        checkpointTurnCount: 0,
        checkpointStatusMap: {},
      },
      hydrated: true,
      orchestratorReady: true,
    };
    sessionHooks = undefined;

    useExtensionSettingsMock.mockReturnValue({
      arbiterFrequency: 3,
      arbiterPrompt: "prompt",
      fallbackPreset: null,
    });

    useStoryLibraryMock.mockReturnValue({
      loading: false,
      libraryEntries: [],
      selectedEntry: null,
      selectedKey: null,
      selectedError: null,
      selectEntry: selectEntryMock,
      reloadLibrary: reloadLibraryMock,
      saveStory: saveStoryMock,
      deleteStory: deleteStoryMock,
    });

    deriveCheckpointSummariesMock.mockReturnValue([]);
    getPersistedStorySelectionMock.mockReturnValue(null);

    selectEntryMock.mockClear();
    reloadLibraryMock.mockClear();
    saveStoryMock.mockClear();
    deleteStoryMock.mockClear();
    activateIndexMock.mockClear();
    reloadPersonaMock.mockClear();
    updateCheckpointStatusMock.mockClear();
    setExpandCallbackMock.mockClear();
    setHooksMock.mockClear();
    setIntervalTurnsMock.mockClear();
    setArbiterPromptMock.mockClear();
    setFallbackPresetMock.mockClear();
    ensureStoryMock.mockClear();
    disposeMock.mockClear();
    setStoryKeyMock.mockClear();
    setRoadmapMock.mockClear();
    setActiveOrchestratorSessionMock.mockClear();
    ensureStoryMacrosMock.mockClear();
    refreshRoleMacrosMock.mockClear();
    parseAndNormalizeStoryMock.mockClear();
  });

  it("tracks active chat through the session provider and restores persisted selection", () => {
    useStoryLibraryMock.mockReturnValue({
      loading: false,
      libraryEntries: [
        { key: "saved:a", ok: true, story: { title: "A", checkpoints: [] }, storyRaw: { title: "A", checkpoints: [] } },
        { key: "saved:b", ok: true, story: { title: "B", checkpoints: [] }, storyRaw: { title: "B", checkpoints: [] } },
      ],
      selectedEntry: null,
      selectedKey: null,
      selectedError: null,
      selectEntry: selectEntryMock,
      reloadLibrary: reloadLibraryMock,
      saveStory: saveStoryMock,
      deleteStory: deleteStoryMock,
    });
    getPersistedStorySelectionMock.mockReturnValue("saved:b");

    const view = renderProvider();

    expect(view.current.activeChatId).toBe("chat-1");
    expect(selectEntryMock).toHaveBeenCalledWith("saved:b");
    expect(setHooksMock).toHaveBeenCalledWith({ onEvaluated: expect.any(Function) });
    expect(setIntervalTurnsMock).toHaveBeenCalledWith(3);
    expect(setArbiterPromptMock).toHaveBeenCalledWith("prompt");
    expect(setFallbackPresetMock).toHaveBeenCalledWith(null);
    expect(ensureStoryMock).toHaveBeenCalledWith(null);
    expect(retainChatSessionBridge).toHaveBeenCalledTimes(1);
    expect((subscribeToChatSessionBridge as jest.MockedFunction<typeof subscribeToChatSessionBridge>).mock.calls).toHaveLength(1);

    contextState = { chatId: "chat-2", groupChatSelected: false };
    act(() => {
      eventHandlers.forEach((handler) => handler({ type: "chat", chat: contextState }));
    });
    expect(view.current.activeChatId).toBeNull();

    contextState = { chatId: "chat-3", groupChatSelected: true };
    getPersistedStorySelectionMock.mockReturnValue("saved:a");
    act(() => {
      eventHandlers.forEach((handler) => handler({ type: "chat", chat: contextState }));
    });
    expect(view.current.activeChatId).toBe("chat-3");
    expect(selectEntryMock).toHaveBeenLastCalledWith("saved:a");

    view.unmount();
    expect(releaseChatSessionBridge).toHaveBeenCalledTimes(1);
    expect(setHooksMock).toHaveBeenLastCalledWith(undefined);
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(setActiveOrchestratorSessionMock).toHaveBeenLastCalledWith(null);
  });

  it("keeps derived checkpoint summaries available through the flattened StoryContext", () => {
    const story = {
      title: "Quest",
      checkpoints: [
        { id: "cp-1", name: "Start", objective: "Wake up" },
        { id: "cp-2", name: "Gate", objective: "Open gate" },
      ],
    };

    useStoryLibraryMock.mockReturnValue({
      loading: false,
      libraryEntries: [{ key: "saved:quest", ok: true, story, storyRaw: story }],
      selectedEntry: { key: "saved:quest", ok: true, story, storyRaw: story },
      selectedKey: "saved:quest",
      selectedError: null,
      selectEntry: selectEntryMock,
      reloadLibrary: reloadLibraryMock,
      saveStory: saveStoryMock,
      deleteStory: deleteStoryMock,
    });
    storeState = {
      ...storeState,
      requirements: {
        requirementsReady: true,
        currentUserName: "Player",
        personaDefined: true,
        groupChatSelected: true,
        missingGroupMembers: ["Guide"],
        worldLoreEntriesPresent: true,
        worldLoreEntriesMissing: [],
        globalLoreBookPresent: false,
        globalLoreBookMissing: ["Main Lorebook"],
      },
      runtime: {
        checkpointIndex: 1,
        activeCheckpointKey: "cp-2",
        turnsSinceEval: 3,
        checkpointTurnCount: 0,
        checkpointStatusMap: {},
      },
    };
    deriveCheckpointSummariesMock.mockReturnValue([
      { id: "cp-1", name: "Start", objective: "Wake up", status: "complete" },
      { id: "cp-2", name: "Gate", objective: "Open gate", status: "current" },
    ]);

    const view = renderProvider();

    expect(view.current.story).toBe(story);
    expect(view.current.title).toBe("Quest");
    expect(view.current.selectedLibraryKey).toBe("saved:quest");
    expect(view.current.checkpoints).toEqual([
      { id: "cp-1", name: "Start", objective: "Wake up", status: "complete" },
      { id: "cp-2", name: "Gate", objective: "Open gate", status: "current" },
    ]);
    expect(view.current.turnsSinceEval).toBe(3);
    expect(view.current.missingGroupMembers).toEqual(["Guide"]);
    expect(view.current.globalLoreBookMissing).toEqual(["Main Lorebook"]);
    view.unmount();
  });

  it("routes evaluation side effects through the session-backed runtime provider", () => {
    const story = {
      title: "Quest",
      checkpoints: [
        { id: "cp-1", name: "Start", objective: "Wake up" },
        { id: "cp-2", name: "Gate", objective: "Open gate" },
      ],
    };

    useStoryLibraryMock.mockReturnValue({
      loading: false,
      libraryEntries: [{ key: "saved:quest", ok: true, story, storyRaw: story }],
      selectedEntry: { key: "saved:quest", ok: true, story, storyRaw: story },
      selectedKey: "saved:quest",
      selectedError: null,
      selectEntry: selectEntryMock,
      reloadLibrary: reloadLibraryMock,
      saveStory: saveStoryMock,
      deleteStory: deleteStoryMock,
    });

    const view = renderProvider();

    act(() => {
      sessionHooks?.onEvaluated?.({
        outcome: "advance",
        cpIndex: 0,
        selectedTransition: { targetIndex: 1 },
      });
    });

    expect(updateCheckpointStatusMock).toHaveBeenCalledWith(0, "complete");
    expect(activateIndexMock).toHaveBeenCalledWith(1);
    view.unmount();
  });

  it("wires expansion persistence through the runtime provider callback", async () => {
    const rawStory = {
      title: "Quest",
      checkpoints: [
        { id: "cp-1", name: "Start", objective: "Wake up", transitions: [] },
      ],
    };

    useStoryLibraryMock.mockReturnValue({
      loading: false,
      libraryEntries: [{ key: "saved:quest", ok: true, story: rawStory, storyRaw: rawStory }],
      selectedEntry: { key: "saved:quest", ok: true, story: rawStory, storyRaw: rawStory },
      selectedKey: "saved:quest",
      selectedError: null,
      selectEntry: selectEntryMock,
      reloadLibrary: reloadLibraryMock,
      saveStory: saveStoryMock,
      deleteStory: deleteStoryMock,
    });

    const view = renderProvider();

    expect(setExpandCallbackMock).toHaveBeenCalled();
    expect(sessionExpandCallback).toBeInstanceOf(Function);

    await act(async () => {
      await sessionExpandCallback?.({
        checkpoint: {
          id: "cp-1",
          name: "Start",
          objective: "Wake up",
          transitions: [{ to: "cp-2" }],
        },
        roadmap: "roadmap-v2",
      }, "cp-1");
    });

    expect(saveStoryMock).toHaveBeenCalledWith({
      title: "Quest",
      checkpoints: [
        { id: "cp-1", name: "Start", objective: "Wake up", transitions: [{ to: "cp-2" }] },
        { id: "cp-2", name: "Upcoming Beat (cp-2)", objective: "To be revealed...", _isStub: true },
      ],
    }, { targetKey: "saved:quest" });
    expect(setRoadmapMock).toHaveBeenCalledWith("roadmap-v2", {
      story: {
        title: "Quest",
        checkpoints: [
          { id: "cp-1", name: "Start", objective: "Wake up", transitions: [{ to: "cp-2" }] },
          { id: "cp-2", name: "Upcoming Beat (cp-2)", objective: "To be revealed...", _isStub: true },
        ],
      },
      storyKey: "saved:quest",
    });

    view.unmount();
    expect(setExpandCallbackMock).toHaveBeenLastCalledWith(null);
  });
});
