import { createPersistenceController } from "@controllers/persistenceController";
import { createBasicStory, createRuntime } from "@services/__mocks__/testData";

jest.mock("@utils/story-state", () => ({
  sanitizeChatKey: jest.fn((value: unknown) => (typeof value === "string" ? value.trim() : null)),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: jest.fn(() => ({})),
  },
}));

function createStoreDouble(overrides: Record<string, unknown> = {}) {
  const state: any = {
    story: createBasicStory(),
    storyKey: "story-key",
    chatId: "chat-1",
    groupChatSelected: true,
    hydrated: false,
    runtime: createRuntime(),
    setStory: jest.fn(),
    setChatContext: jest.fn(),
    resetRuntime: jest.fn(),
    hydrateRuntime: jest.fn(),
    writeRuntime: jest.fn(),
    setTurnsSinceEval: jest.fn(),
    setCheckpointTurnCount: jest.fn(),
    updateCheckpointStatus: jest.fn(),
    canPersistRuntime: jest.fn().mockReturnValue(true),
    ...overrides,
  };

  return {
    getState: () => state,
  } as any;
}

describe("persistenceController", () => {
  it("delegates hydrate and runtime writes to store actions", () => {
    const hydrated = { runtime: createRuntime({ checkpointIndex: 1 }), source: "stored", storyKey: "story-b" } as const;
    const store = createStoreDouble({
      hydrateRuntime: jest.fn(() => hydrated),
      writeRuntime: jest.fn((next: any) => next),
    });
    const controller = createPersistenceController(store);
    const runtime = createRuntime({ turnsSinceEval: 3 });

    expect(controller.hydrate()).toEqual(hydrated);
    expect(controller.writeRuntime(runtime, { persist: true, hydrated: true })).toEqual(runtime);
    expect(store.getState().hydrateRuntime).toHaveBeenCalledTimes(1);
    expect(store.getState().writeRuntime).toHaveBeenCalledWith(runtime, { persist: true, hydrated: true });
  });

  it("normalizes chat context before delegating", () => {
    const store = createStoreDouble();
    const controller = createPersistenceController(store);

    controller.setChatContext({ chatId: "  chat-a  ", groupChatSelected: 1 as never });

    expect(store.getState().setChatContext).toHaveBeenCalledWith({ chatId: "chat-a", groupChatSelected: true });
  });

  it("delegates persistability and mutation helpers to the store", () => {
    const runtime = createRuntime({ checkpointTurnCount: 2 });
    const store = createStoreDouble({
      resetRuntime: jest.fn(() => runtime),
      setTurnsSinceEval: jest.fn(() => runtime),
      setCheckpointTurnCount: jest.fn(() => runtime),
      updateCheckpointStatus: jest.fn(() => runtime),
      canPersistRuntime: jest.fn().mockReturnValue(false),
    });
    const controller = createPersistenceController(store);

    expect(controller.resetRuntime()).toBe(runtime);
    expect(controller.setTurnsSinceEval(4, { persist: true })).toBe(runtime);
    expect(controller.setCheckpointTurnCount(2, { persist: false })).toBe(runtime);
    expect(controller.updateCheckpointStatus(0, "complete" as never, { persist: true })).toBe(runtime);
    expect(controller.canPersist()).toBe(false);
    expect(controller.isHydrated()).toBe(false);
    expect(store.getState().setTurnsSinceEval).toHaveBeenCalledWith(4, { persist: true });
    expect(store.getState().setCheckpointTurnCount).toHaveBeenCalledWith(2, { persist: false });
    expect(store.getState().updateCheckpointStatus).toHaveBeenCalledWith(0, "complete", { persist: true });
  });
});
