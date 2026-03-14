const mockSaveSettingsDebounced = jest.fn();
const mockContext = {
  extensionSettings: {} as Record<string, unknown>,
  saveSettingsDebounced: mockSaveSettingsDebounced,
};

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(() => mockContext),
}));

jest.mock("@utils/story-state", () => {
  const actual = jest.requireActual("@utils/story-state");
  return {
    ...actual,
    loadStoryState: jest.fn(),
    persistStoryState: jest.fn(),
  };
});

import {
  CheckpointStatus,
  loadStoryState,
  persistStoryState,
  type RuntimeStoryState,
} from "@utils/story-state";
import { extensionName } from "@constants/main";
import { createBasicStory } from "@services/__mocks__/testData";
import type { NormalizedStory } from "@utils/story-validator";
import { storySessionStore } from "./storySessionStore";

const actualStoryState = jest.requireActual<typeof import("@utils/story-state")>("@utils/story-state");

const loadStoryStateMock = loadStoryState as jest.MockedFunction<typeof loadStoryState>;
const persistStoryStateMock = persistStoryState as jest.MockedFunction<typeof persistStoryState>;

const createStory = () => createBasicStory({
  checkpoints: [
    { id: "cp-1", name: "CP1", objective: "obj-1" },
    { id: "cp-2", name: "CP2", objective: "obj-2" },
  ],
  transitions: [],
  startId: "cp-1",
}) as any;

const createNormalizedStory = (overrides: Partial<NormalizedStory> = {}): NormalizedStory => ({
  schemaVersion: "2.0",
  title: "Story 1",
  description: "desc",
  global_lorebook: "Lorebook",
  checkpoints: [{ id: "cp-1", name: "CP1", objective: "obj-1" }],
  transitions: [],
  startId: "cp-1",
  ...overrides,
});

describe("storySessionStore runtime writes", () => {
  beforeEach(() => {
    mockContext.extensionSettings = {};
    mockSaveSettingsDebounced.mockReset();
    loadStoryStateMock.mockReset();
    persistStoryStateMock.mockReset();
    const state = storySessionStore.getState();
    state.setStory(null);
    state.setChatContext({ chatId: null, groupChatSelected: false });
    state.setStoryKey(null);
    state.setRoadmap(null);
    state.setTurn(0);
  });

  it("hydrates stored runtime through the store and preserves checkpoint identity", () => {
    const story = createStory();
    const storedRuntime: RuntimeStoryState = {
      checkpointIndex: 1,
      activeCheckpointKey: "cp-2",
      turnsSinceEval: 3,
      checkpointTurnCount: 2,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
      },
    };
    loadStoryStateMock.mockReturnValue({
      state: storedRuntime,
      source: "stored",
      storyKey: "story-b",
      roadmap: "roadmap text",
    });

    const state = storySessionStore.getState();
    state.setStory(story);
    state.setChatContext({ chatId: "chat-1", groupChatSelected: true });

    const result = storySessionStore.getState().hydrateRuntime();
    const snapshot = storySessionStore.getState();

    expect(result).toEqual({ runtime: storedRuntime, source: "stored", storyKey: "story-b" });
    expect(loadStoryStateMock).toHaveBeenCalledWith({ chatId: "chat-1", story });
    expect(snapshot.runtime.activeCheckpointKey).toBe("cp-2");
    expect(snapshot.runtime.checkpointIndex).toBe(1);
    expect(snapshot.runtime.checkpointStatusMap).toEqual(storedRuntime.checkpointStatusMap);
    expect(snapshot.storyKey).toBe("story-b");
    expect(snapshot.roadmap).toBe("roadmap text");
    expect(snapshot.hydrated).toBe(true);
  });

  it("persists canonical runtime writes only for eligible group chats", () => {
    const story = createStory();
    const state = storySessionStore.getState();
    state.setStory(story);
    state.setStoryKey("story-key");
    state.setChatContext({ chatId: "chat-9", groupChatSelected: true });

    storySessionStore.getState().writeRuntime({
      checkpointIndex: 1,
      activeCheckpointKey: "cp-2",
      turnsSinceEval: 1,
      checkpointTurnCount: 0,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
      },
    }, { persist: true, hydrated: true });
    storySessionStore.getState().setTurnsSinceEval(4, { persist: true });
    storySessionStore.getState().updateCheckpointStatus(0, CheckpointStatus.Failed, { persist: true });

    expect(persistStoryStateMock).toHaveBeenCalledTimes(3);
    expect(persistStoryStateMock).toHaveBeenLastCalledWith({
      chatId: "chat-9",
      story,
      state: {
        checkpointIndex: 1,
        activeCheckpointKey: "cp-2",
        turnsSinceEval: 4,
        checkpointTurnCount: 0,
        checkpointStatusMap: {
          "cp-1": CheckpointStatus.Failed,
          "cp-2": CheckpointStatus.Current,
        },
      },
      storyKey: "story-key",
    });

    state.setChatContext({ chatId: "chat-9", groupChatSelected: false });
    storySessionStore.getState().setTurnsSinceEval(5, { persist: true });

    expect(persistStoryStateMock).toHaveBeenCalledTimes(3);
  });

  it("treats checkpointIndex as the canonical checkpoint identity on runtime writes", () => {
    const story = createStory();
    const state = storySessionStore.getState();
    state.setStory(story);

    const runtime = storySessionStore.getState().writeRuntime({
      checkpointIndex: 1,
      activeCheckpointKey: "cp-1",
      turnsSinceEval: 2,
      checkpointTurnCount: 1,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
      },
    }, { persist: false, hydrated: true });

    expect(runtime).toEqual({
      checkpointIndex: 1,
      activeCheckpointKey: "cp-2",
      turnsSinceEval: 2,
      checkpointTurnCount: 1,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
      },
    });
  });

  it("selects a story through the canonical reset path and persists the default runtime", () => {
    const story = createStory();
    const state = storySessionStore.getState();
    state.setChatContext({ chatId: "chat-3", groupChatSelected: true });

    const runtime = storySessionStore.getState().selectStory(story, {
      storyKey: "story-c",
      roadmap: "opening roadmap",
    });

    expect(runtime).toEqual({
      checkpointIndex: 0,
      activeCheckpointKey: "cp-1",
      turnsSinceEval: 0,
      checkpointTurnCount: 0,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Current,
        "cp-2": CheckpointStatus.Pending,
      },
    });
    expect(storySessionStore.getState().story).toBe(story);
    expect(storySessionStore.getState().storyKey).toBe("story-c");
    expect(storySessionStore.getState().roadmap).toBe("opening roadmap");
    expect(storySessionStore.getState().hydrated).toBe(false);
    expect(persistStoryStateMock).toHaveBeenCalledWith({
      chatId: "chat-3",
      story,
      state: runtime,
      storyKey: "story-c",
      roadmap: "opening roadmap",
    });
  });

  it("persists roadmap updates through the store without resetting runtime", () => {
    const story = createStory();
    const state = storySessionStore.getState();
    state.selectStory(story, { storyKey: "story-d" });
    persistStoryStateMock.mockClear();
    state.setChatContext({ chatId: "chat-4", groupChatSelected: true });
    state.writeRuntime({
      checkpointIndex: 1,
      activeCheckpointKey: "cp-2",
      turnsSinceEval: 2,
      checkpointTurnCount: 1,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
      },
    }, { hydrated: true, persist: false });
    persistStoryStateMock.mockClear();

    state.setRoadmap("updated roadmap");

    expect(storySessionStore.getState().runtime).toEqual({
      checkpointIndex: 1,
      activeCheckpointKey: "cp-2",
      turnsSinceEval: 2,
      checkpointTurnCount: 1,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
      },
    });
    expect(persistStoryStateMock).toHaveBeenCalledWith({
      chatId: "chat-4",
      story,
      state: {
        checkpointIndex: 1,
        activeCheckpointKey: "cp-2",
        turnsSinceEval: 2,
        checkpointTurnCount: 1,
        checkpointStatusMap: {
          "cp-1": CheckpointStatus.Complete,
          "cp-2": CheckpointStatus.Current,
        },
      },
      storyKey: "story-d",
      roadmap: "updated roadmap",
    });
  });

  it("resets defaults through the canonical write path without persisting non-group chats", () => {
    const story = createStory();
    const state = storySessionStore.getState();
    state.setStory(story);
    state.setChatContext({ chatId: "chat-2", groupChatSelected: false });
    state.writeRuntime({
      checkpointIndex: 1,
      activeCheckpointKey: "cp-2",
      turnsSinceEval: 7,
      checkpointTurnCount: 3,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": CheckpointStatus.Current,
      },
    }, { hydrated: true });

    const runtime = storySessionStore.getState().resetRuntime({ persist: true });

    expect(runtime).toEqual({
      checkpointIndex: 0,
      activeCheckpointKey: "cp-1",
      turnsSinceEval: 0,
      checkpointTurnCount: 0,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Current,
        "cp-2": CheckpointStatus.Pending,
      },
    });
    expect(storySessionStore.getState().hydrated).toBe(false);
    expect(persistStoryStateMock).not.toHaveBeenCalled();
  });

  it("decodeCheckpointStatusMap keeps only valid stored statuses", () => {
    expect(actualStoryState.decodeCheckpointStatusMap({
      "cp-1": CheckpointStatus.Complete,
      "cp-2": "broken",
      "cp-3": 7,
    })).toEqual({
      "cp-1": CheckpointStatus.Complete,
    });
  });

  it("loadStoryState normalizes partial legacy runtime in one place", () => {
    const story = createStory();
    actualStoryState.persistStoryState({
      chatId: "chat-legacy",
      story,
      storyKey: "story-legacy",
      roadmap: "legacy roadmap",
      state: {
        checkpointIndex: 0,
        activeCheckpointKey: "cp-1",
        turnsSinceEval: 0,
        checkpointTurnCount: 0,
        checkpointStatusMap: {
          "cp-1": CheckpointStatus.Current,
          "cp-2": CheckpointStatus.Pending,
        },
      },
    });

    const root = mockContext.extensionSettings[extensionName] as { storyState: Record<string, any> };
    root.storyState["chat-legacy"] = {
      ...root.storyState["chat-legacy"],
      storyKey: "  story-legacy  ",
      checkpointIndex: 1.9,
      activeCheckpointKey: null,
      turnsSinceEval: 4.7,
      checkpointTurnCount: undefined,
      checkpointStatusMap: {
        "cp-1": CheckpointStatus.Complete,
        "cp-2": "bad-status",
      },
    };

    expect(actualStoryState.loadStoryState({ chatId: "chat-legacy", story })).toEqual({
      state: {
        checkpointIndex: 1,
        activeCheckpointKey: "cp-2",
        turnsSinceEval: 4,
        checkpointTurnCount: 0,
        checkpointStatusMap: {
          "cp-1": CheckpointStatus.Complete,
          "cp-2": CheckpointStatus.Current,
        },
      },
      source: "stored",
      storyKey: "story-legacy",
      roadmap: "legacy roadmap",
    });
  });

  it("loadStoryState sanitizes malformed runtime state safely", () => {
    const story = createStory();
    actualStoryState.persistStoryState({
      chatId: "chat-bad",
      story,
      storyKey: "story-bad",
      state: {
        checkpointIndex: 0,
        activeCheckpointKey: "cp-1",
        turnsSinceEval: 0,
        checkpointTurnCount: 0,
        checkpointStatusMap: {
          "cp-1": CheckpointStatus.Current,
          "cp-2": CheckpointStatus.Pending,
        },
      },
    });

    const root = mockContext.extensionSettings[extensionName] as { storyState: Record<string, any> };
    root.storyState["chat-bad"] = {
      ...root.storyState["chat-bad"],
      checkpointIndex: "nope",
      turnsSinceEval: "still-nope",
      checkpointStatusMap: "bad-map",
    };

    expect(actualStoryState.loadStoryState({ chatId: "chat-bad", story })).toEqual({
      state: actualStoryState.makeDefaultState(story),
      source: "stored",
      storyKey: "story-bad",
      roadmap: undefined,
    });
  });

  it("loadStoryState keeps stored runtime when only stub metadata changes", () => {
    const baseStory = createNormalizedStory({
      checkpoints: [
        { id: "cp-1", name: "CP1", objective: "obj-1" },
        { id: "cp-2", name: "Stub", objective: "obj-2", stub: { isStub: true, stubName: "Future Beat" } },
      ],
      transitions: [
        {
          id: "to-stub",
          from: "cp-1",
          to: "cp-2",
          trigger: {
            type: "regex",
            regexes: [/go/i],
            condition: "go",
            raw: { type: "regex", patterns: ["go"], condition: "go" },
          },
        },
      ],
    });
    actualStoryState.persistStoryState({
      chatId: "chat-stub",
      story: baseStory,
      storyKey: "story-stub",
      state: {
        checkpointIndex: 0,
        activeCheckpointKey: "cp-1",
        turnsSinceEval: 2,
        checkpointTurnCount: 1,
        checkpointStatusMap: {
          "cp-1": CheckpointStatus.Current,
          "cp-2": CheckpointStatus.Pending,
        },
      },
    });

    const updatedStubStory = createNormalizedStory({
      checkpoints: [
        { id: "cp-1", name: "CP1", objective: "obj-1" },
        { id: "cp-2", name: "Different Stub", objective: "changed", stub: { isStub: true, stubName: "Renamed Stub" } },
      ],
      transitions: [
        {
          id: "to-stub-renamed",
          from: "cp-1",
          to: "cp-2",
          trigger: {
            type: "regex",
            regexes: [/different/i],
            condition: "different",
            raw: { type: "regex", patterns: ["different"], condition: "different" },
          },
        },
      ],
    });

    expect(actualStoryState.loadStoryState({ chatId: "chat-stub", story: updatedStubStory })).toEqual({
      state: {
        checkpointIndex: 0,
        activeCheckpointKey: "cp-1",
        turnsSinceEval: 2,
        checkpointTurnCount: 1,
        checkpointStatusMap: {
          "cp-1": CheckpointStatus.Current,
          "cp-2": CheckpointStatus.Pending,
        },
      },
      source: "stored",
      storyKey: "story-stub",
      roadmap: undefined,
    });
  });
});
