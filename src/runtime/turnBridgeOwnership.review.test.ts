import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";
import { TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";
import { control } from "../../test/findings/ledger";

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

function deferred() {
  let finish!: (value: undefined) => void;
  const promise = new Promise<undefined>((done) => { finish = done; });
  return { promise, resolve: () => finish(undefined) };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function harness() {
  let current: RunContext = {
    chatId: "chat-a",
    storyId: "story-a",
    playedVersion: 1,
    sessionEpoch: 1,
    windowRevision: 0,
    lowestMutatedMessageId: null,
  };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  const committed: Array<string | null> = [];
  const manager = {
    commitBoundary: jest.fn(async (_at?: number) => { committed.push(current.chatId); }),
    fireAfterSpeak: jest.fn(async () => undefined),
    rollbackFromMessage: jest.fn(async () => undefined),
    loadSelectedFromChat: jest.fn(async () => undefined),
    getOwnership: () => ownership,
    notify: jest.fn(),
  };
  const bridge = new TurnBridge(manager as unknown as RuntimeManager);
  bridge.start();
  return {
    bridge,
    manager,
    committed,
    switchWorld: () => { current = { ...current, chatId: "chat-b", storyId: "story-b", sessionEpoch: 2 }; },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  handlers.clear();
  hostGenerating = false;
});

afterEach(() => {
  jest.useRealTimers();
});

control("a delayed same-world rendered reply commits once", async () => {
  const h = harness();
  const pending = deferred();
  h.manager.fireAfterSpeak.mockImplementationOnce(() => pending.promise);

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  expect(h.manager.fireAfterSpeak).toHaveBeenCalledTimes(1);
  pending.resolve();
  await settle();

  expect(h.committed).toEqual(["chat-a"]);
});

control("an old rendered reply cannot consume the new chat's pending boundary", async () => {
  const h = harness();
  const first = deferred();
  const second = deferred();
  h.manager.fireAfterSpeak
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  expect(h.manager.fireAfterSpeak).toHaveBeenCalledTimes(1);
  h.switchWorld();
  handlers.get("CHAT_CHANGED")?.();
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  expect(h.manager.fireAfterSpeak).toHaveBeenCalledTimes(2);

  first.resolve();
  await settle();
  expect(h.committed).toEqual([]);

  second.resolve();
  await settle();
  expect(h.committed).toEqual(["chat-b"]);
});

control("an older same-world reply commits itself, never the newer reply whose after-speak is still running (V4)", async () => {
  const h = harness();
  const first = deferred();
  const second = deferred();
  h.manager.fireAfterSpeak
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(8, "normal");
  first.resolve();
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7]]);

  second.resolve();
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7], [8]]);
});

control("a poll keeps the ownership of the reply that scheduled it", async () => {
  const h = harness();
  hostGenerating = true;
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  await settle();
  expect(h.committed).toEqual([]);

  h.switchWorld();
  hostGenerating = false;
  jest.advanceTimersByTime(400);
  await settle();
  expect(h.committed).toEqual([]);

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(8, "normal");
  await settle();
  expect(h.committed).toEqual(["chat-b"]);
});

control("a same-world poll commits after generation ends", async () => {
  const h = harness();
  hostGenerating = true;
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  await settle();

  hostGenerating = false;
  jest.advanceTimersByTime(400);
  await settle();

  expect(h.committed).toEqual(["chat-a"]);
});

control("a commit stuck in the chat that was left does not hold the next chat's boundaries back", async () => {
  const h = harness();
  const stuck = deferred();
  h.manager.commitBoundary.mockImplementationOnce(async () => { h.committed.push("chat-a"); await stuck.promise; });

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  await settle();
  expect(h.committed).toEqual(["chat-a"]);

  h.switchWorld();
  handlers.get("CHAT_CHANGED")?.();
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(3, "normal");
  await settle();
  expect(h.committed).toEqual(["chat-a", "chat-b"]);

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(4, "normal");
  stuck.resolve();
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7], [3], [4]]);
});

control("control: a commit still running in the open chat keeps the next boundary waiting its turn", async () => {
  const h = harness();
  const running = deferred();
  h.manager.commitBoundary.mockImplementationOnce(async () => { h.committed.push("chat-a"); await running.promise; });

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  await settle();
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(8, "normal");
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7]]);

  running.resolve();
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7], [8]]);
});

control("the stale drain stops when it resumes, so it never takes a boundary the new chat's drain is holding", async () => {
  const h = harness();
  const stuck = deferred();
  const slowB = deferred();
  h.manager.commitBoundary
    .mockImplementationOnce(async () => { await stuck.promise; })
    .mockImplementationOnce(async () => { await slowB.promise; });

  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(7, "normal");
  await settle();
  h.switchWorld();
  handlers.get("CHAT_CHANGED")?.();
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(3, "normal");
  await settle();
  handlers.get("CHARACTER_MESSAGE_RENDERED")?.(4, "normal");
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7], [3]]);

  stuck.resolve();
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7], [3]]);

  slowB.resolve();
  await settle();
  expect(h.manager.commitBoundary.mock.calls).toEqual([[7], [3], [4]]);
});
