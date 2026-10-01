import { isTurnMessageType, TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";
import { testOwnership } from "../../test/findings/testOwnership";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
let hostGenerating = false;

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [] }),
  isHostGenerating: () => hostGenerating,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) handlers.set(entry.eventName, entry.handler);
    return () => handlers.clear();
  },
}));

const emit = async (eventName: string, ...args: unknown[]) => {
  await handlers.get(eventName)?.(...args);
};

const makeManager = () => ({
  commitBoundary: jest.fn(async () => undefined),
  fireAfterSpeak: jest.fn(async () => undefined),
  rollbackFromMessage: jest.fn(async () => undefined),
  rollbackOnEnter: jest.fn(async () => false),
  loadSelectedFromChat: jest.fn(async () => undefined),
  reapplyPromptBlocks: jest.fn(),
  reapplyCopilotNudge: jest.fn(),
  getOwnership: () => testOwnership(),
  notify: jest.fn(),
});

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("TurnBridge boundary commits", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    handlers.clear();
    hostGenerating = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("commits immediately when a reply renders while host is idle", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("CHARACTER_MESSAGE_RENDERED");

    expect(manager.fireAfterSpeak).toHaveBeenCalledTimes(1);
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  });

  it("commits once after host stops generating even when generation_ended fires mid-round", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    hostGenerating = true;
    await emit("MESSAGE_RECEIVED");
    expect(manager.commitBoundary).not.toHaveBeenCalled();

    await emit("GENERATION_ENDED");
    expect(manager.commitBoundary).not.toHaveBeenCalled();

    hostGenerating = false;
    jest.advanceTimersByTime(400);
    await flushAsync();

    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  });

  it("dedupes message_received and character_message_rendered for the same reply", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("MESSAGE_RECEIVED");
    await emit("CHARACTER_MESSAGE_RENDERED");

    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(300);
    await emit("CHARACTER_MESSAGE_RENDERED");
    expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
  });

  it("drops the pending boundary when the chat changes", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    hostGenerating = true;
    await emit("MESSAGE_RECEIVED");
    await emit("CHAT_CHANGED");

    hostGenerating = false;
    jest.advanceTimersByTime(1000);
    await flushAsync();

    expect(manager.loadSelectedFromChat).toHaveBeenCalledTimes(1);
    expect(manager.commitBoundary).not.toHaveBeenCalled();
  });

  it.each(["normal", "swipe", "regenerate", "continue", "appendFinal", "command"])("commits a boundary for a rendered '%s' reply", async (type) => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("MESSAGE_RECEIVED", 3, type);
    await emit("CHARACTER_MESSAGE_RENDERED", 3, type);

    expect(manager.fireAfterSpeak).toHaveBeenCalledTimes(1);
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  });

  it.each(["first_message", "extension"])("ignores a '%s' message: no boundary, no afterSpeak replies", async (type) => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("MESSAGE_RECEIVED", 0, type);
    await emit("CHARACTER_MESSAGE_RENDERED", 0, type);
    jest.advanceTimersByTime(1000);
    await flushAsync();

    expect(manager.fireAfterSpeak).not.toHaveBeenCalled();
    expect(manager.commitBoundary).not.toHaveBeenCalled();
  });

  it("commits nothing for a fresh group chat posting every member's greeting before chat_changed", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    for (const messageId of [0, 1, 2]) {
      await emit("MESSAGE_RECEIVED", messageId, "first_message");
      await emit("CHARACTER_MESSAGE_RENDERED", messageId, "first_message");
    }
    await emit("CHAT_CHANGED");

    expect(manager.commitBoundary).not.toHaveBeenCalled();
    expect(manager.loadSelectedFromChat).toHaveBeenCalledTimes(1);
  });

  it("lets the first real reply after a greeting commit without the 250ms dedupe swallowing it", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("MESSAGE_RECEIVED", 0, "first_message");
    expect(manager.commitBoundary).not.toHaveBeenCalled();

    await emit("MESSAGE_RECEIVED", 2, "normal");
    expect(manager.fireAfterSpeak).toHaveBeenCalledTimes(1);
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  });

  it("keeps a pending reply boundary when an image is posted before generation ends", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    hostGenerating = true;
    await emit("MESSAGE_RECEIVED", 2, "normal");
    jest.advanceTimersByTime(300);
    await emit("MESSAGE_RECEIVED", 3, "extension");
    await emit("CHARACTER_MESSAGE_RENDERED", 3, "extension");
    hostGenerating = false;
    jest.advanceTimersByTime(400);
    await flushAsync();

    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
    expect(manager.fireAfterSpeak).toHaveBeenCalledTimes(1);
  });

  it("routes a swipe through rollback first and then commits the regenerated reply", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("MESSAGE_SWIPED", 4);
    expect(manager.rollbackFromMessage).toHaveBeenCalledWith(4, undefined, "swipe");
    expect(manager.commitBoundary).not.toHaveBeenCalled();

    await emit("MESSAGE_RECEIVED", 4, "swipe");
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  });

  it("hands a mutation the onEnter rollback claims to the manager, and skips the ordinary rollback", async () => {
    const manager = makeManager();
    manager.rollbackOnEnter.mockResolvedValueOnce(true);
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("MESSAGE_SWIPED", 4);
    expect(manager.rollbackOnEnter).toHaveBeenCalledWith("swipe", 4);
    expect(manager.rollbackFromMessage).not.toHaveBeenCalled();
  });

  it("treats a greeting swipe as an ordinary mutation of message 0 and commits nothing", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    await emit("MESSAGE_SWIPED", 0);

    expect(manager.rollbackFromMessage).toHaveBeenCalledWith(0, undefined, "swipe");
    expect(manager.commitBoundary).not.toHaveBeenCalled();
  });

  it("stops polling after stop()", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();

    hostGenerating = true;
    await emit("MESSAGE_RECEIVED");
    bridge.stop();

    hostGenerating = false;
    jest.advanceTimersByTime(1000);
    await flushAsync();

    expect(manager.commitBoundary).not.toHaveBeenCalled();
  });
});

describe("isTurnMessageType", () => {
  it("excludes only the types ST posts without a player turn; untyped emitters keep committing", () => {
    expect(isTurnMessageType("first_message")).toBe(false);
    expect(isTurnMessageType("extension")).toBe(false);
    expect(isTurnMessageType("normal")).toBe(true);
    expect(isTurnMessageType("command")).toBe(true);
    expect(isTurnMessageType(undefined)).toBe(true);
  });
});
