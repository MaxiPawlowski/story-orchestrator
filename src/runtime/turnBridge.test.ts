import { TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
let hostGenerating = false;

jest.mock("@services/STAPI", () => ({
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
  loadSelectedFromChat: jest.fn(async () => undefined),
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
