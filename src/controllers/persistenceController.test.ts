import { createPersistenceController } from "@controllers/persistenceController";
import { createBasicStory, createRuntime } from "@services/__mocks__/testData";
import { loadStoryState, persistStoryState, sanitizeChatKey } from "@utils/story-state";

jest.mock("@utils/story-state", () => ({
  loadStoryState: jest.fn(),
  persistStoryState: jest.fn(),
  sanitizeChatKey: jest.fn((value: unknown) => (typeof value === "string" ? value.trim() : null)),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: jest.fn(() => ({})),
  },
}));

const loadStoryStateMock = loadStoryState as jest.MockedFunction<typeof loadStoryState>;
const persistStoryStateMock = persistStoryState as jest.MockedFunction<typeof persistStoryState>;
const sanitizeChatKeyMock = sanitizeChatKey as jest.MockedFunction<typeof sanitizeChatKey>;

function createStoreDouble(overrides: Record<string, unknown> = {}) {
  const state: any = {
    story: null,
    storyKey: null,
    chatId: null,
    groupChatSelected: false,
    hydrated: false,
    runtime: createRuntime(),
    ...overrides,
  };

  state.setStory = jest.fn((story: any) => {
    state.story = story;
    state.runtime = createRuntime({ activeCheckpointKey: story?.startId ?? null });
    state.hydrated = false;
    return state.runtime;
  });
  state.setChatContext = jest.fn(({ chatId, groupChatSelected }: any) => {
    state.chatId = chatId;
    state.groupChatSelected = groupChatSelected;
  });
  state.resetRuntime = jest.fn(() => {
    state.runtime = createRuntime();
    state.hydrated = false;
    return state.runtime;
  });
  state.setRuntime = jest.fn((runtime: any, options?: { hydrated?: boolean }) => {
    state.runtime = runtime;
    state.hydrated = options?.hydrated ?? state.hydrated;
    return runtime;
  });
  state.setTurnsSinceEval = jest.fn((next: number) => {
    state.runtime = { ...state.runtime, turnsSinceEval: next };
    return state.runtime;
  });
  state.setCheckpointTurnCount = jest.fn((next: number) => {
    state.runtime = { ...state.runtime, checkpointTurnCount: next };
    return state.runtime;
  });
  state.updateCheckpointStatus = jest.fn((index: number, status: string) => {
    state.runtime = {
      ...state.runtime,
      checkpointStatusMap: { ...state.runtime.checkpointStatusMap, [String(index)]: status },
    };
    return state.runtime;
  });
  state.setStoryKey = jest.fn((key: string | null) => {
    state.storyKey = key;
    return key;
  });
  state.setRoadmap = jest.fn((roadmap: string | null) => {
    state.roadmap = roadmap;
  });

  return {
    getState: () => state,
  };
}

describe("persistenceController", () => {
  beforeEach(() => {
    loadStoryStateMock.mockReset();
    persistStoryStateMock.mockReset();
    sanitizeChatKeyMock.mockClear();
  });

  it("hydrates defaults when story is missing or group chat is not selected", () => {
    const store = createStoreDouble({ story: null, groupChatSelected: false, storyKey: "existing-key" }) as any;
    const controller = createPersistenceController(store);

    const result = controller.hydrate();

    expect(result.source).toBe("default");
    expect(result.storyKey).toBe("existing-key");
    expect(store.getState().resetRuntime).toHaveBeenCalledTimes(1);
    expect(loadStoryStateMock).not.toHaveBeenCalled();
  });

  it("hydrates stored runtime and syncs story key", () => {
    const story = createBasicStory();
    const loadedRuntime = createRuntime({ checkpointIndex: 1, activeCheckpointKey: "cp-2" });
    loadStoryStateMock.mockReturnValue({
      state: loadedRuntime as any,
      source: "stored",
      storyKey: "story-key-a",
    });

    const store = createStoreDouble({
      story,
      groupChatSelected: true,
      chatId: "chat-1",
      hydrated: false,
    }) as any;
    const controller = createPersistenceController(store);

    const result = controller.hydrate();

    expect(loadStoryStateMock).toHaveBeenCalledWith({ chatId: "chat-1", story });
    expect(store.getState().setStoryKey).toHaveBeenCalledWith("story-key-a");
    expect(store.getState().setRuntime).toHaveBeenCalledWith(loadedRuntime, { hydrated: true });
    expect(result.source).toBe("stored");
  });

  it("persists runtime changes only when persistence is allowed", () => {
    const story = createBasicStory();
    const store = createStoreDouble({
      story,
      storyKey: "story-key",
      chatId: "chat-9",
      groupChatSelected: true,
      hydrated: false,
    }) as any;
    const controller = createPersistenceController(store);
    const nextRuntime = createRuntime({ turnsSinceEval: 7 });

    const runtime = controller.writeRuntime(nextRuntime as any);

    expect(runtime).toEqual(nextRuntime);
    expect(persistStoryStateMock).toHaveBeenCalledWith({
      chatId: "chat-9",
      story,
      state: nextRuntime,
      storyKey: "story-key",
    });
    expect(store.getState().setRuntime).toHaveBeenCalledWith(nextRuntime, { hydrated: true });
  });

  it("normalizes chat context and exposes persistability checks", () => {
    const story = createBasicStory();
    const store = createStoreDouble({ story, groupChatSelected: false, chatId: null }) as any;
    const controller = createPersistenceController(store);

    controller.setChatContext({ chatId: "  chat-a  ", groupChatSelected: 1 as any });

    expect(sanitizeChatKeyMock).toHaveBeenCalledWith("  chat-a  ");
    expect(store.getState().setChatContext).toHaveBeenCalledWith({ chatId: "chat-a", groupChatSelected: true });
    expect(controller.canPersist()).toBe(true);
  });
});
