// Promoted from the 2026-09-18 external review. R10/R11: a rendered reply is deduped by elapsed
// time (250 ms) rather than by message identity, so two fast replies collapse into one boundary and
// two events for one reply 300 ms apart commit two. v2.3 plan 01 §A.

import { TurnBridge } from "@runtime/turnBridge";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { control, finding, must } from "../../test/findings/ledger";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readBackBoundary: () => null,
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    entries.forEach((entry) => handlers.set(entry.eventName, entry.handler));
    return () => handlers.clear();
  },
}));

const emit = async (name: string, id: number) => {
  await handlers.get(name)?.(id);
  await Promise.resolve();
  await Promise.resolve();
};

const setup = () => {
  const manager = {
    commitBoundary: jest.fn(async () => {}),
    fireAfterSpeak: jest.fn(async () => {}),
    rollbackFromMessage: jest.fn(async () => {}),
    loadSelectedFromChat: jest.fn(async () => {}),
    getOwnership: () => undefined,
    notify: jest.fn(),
  };
  const bridge = new TurnBridge(manager as unknown as RuntimeManager);
  bridge.start();
  return { manager, bridge };
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-19T00:00:00Z"));
  handlers.clear();
});
afterEach(() => jest.useRealTimers());

control("duplicate host events for one reply produce one boundary", async () => {
  const { manager } = setup();
  await emit("MESSAGE_RECEIVED", 1);
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
});

control("distinct replies separated by 300ms both commit", async () => {
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  jest.advanceTimersByTime(300);
  await emit("CHARACTER_MESSAGE_RENDERED", 2);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});

finding("R10", async () => {
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  jest.advanceTimersByTime(100);
  await emit("CHARACTER_MESSAGE_RENDERED", 2);
  must(
    manager.commitBoundary.mock.calls.length === 2,
    `two distinct replies inside the 250 ms window committed ${manager.commitBoundary.mock.calls.length} boundary instead of two: the bridge dedupes by elapsed time, not by message identity, so a fast second reply is silently dropped`,
  );
});

finding("R11", async () => {
  const { manager } = setup();
  await emit("MESSAGE_RECEIVED", 1);
  jest.advanceTimersByTime(300);
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  must(
    manager.commitBoundary.mock.calls.length === 1,
    `two host events for the SAME reply committed ${manager.commitBoundary.mock.calls.length} boundaries because they arrived more than 250 ms apart — identity, not timing, decides what one turn is`,
  );
});

// --- v2.3 plan 03: the cases identity must get right that timing never could. ---

control("a swipe of the same message commits a new boundary", async () => {
  // A swipe gives an existing message id new content. The gotchas record that a boundary at the
  // same message id must rescan it, so keying on the id alone would have dropped this.
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", 4);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  await emit("MESSAGE_SWIPED", 4);
  await emit("CHARACTER_MESSAGE_RENDERED", 4);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});

control("an edit of the same message commits a new boundary", async () => {
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", 4);
  await emit("MESSAGE_EDITED", 4);
  await emit("CHARACTER_MESSAGE_RENDERED", 4);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});

control("three events for one reply still commit one boundary", async () => {
  const { manager } = setup();
  await emit("MESSAGE_RECEIVED", 7);
  await emit("CHARACTER_MESSAGE_RENDERED", 7);
  jest.advanceTimersByTime(5000);
  await emit("CHARACTER_MESSAGE_RENDERED", 7);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
});

control("a delayed duplicate stays deduped after a different message renders", async () => {
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  await emit("CHARACTER_MESSAGE_RENDERED", 2);
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});

control("only a mutation of the rendered message re-admits its delayed event", async () => {
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  await emit("MESSAGE_EDITED", 3);
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  await emit("MESSAGE_EDITED", 1);
  await emit("CHARACTER_MESSAGE_RENDERED", 1);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});

control("message ids restart per chat without deduping the new chat's first turn", async () => {
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", 2);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  await emit("CHAT_CHANGED", 0);
  await emit("CHARACTER_MESSAGE_RENDERED", 2);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});

control("an id-less first event is accepted immediately after a chat change", async () => {
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", undefined as never);
  await emit("CHAT_CHANGED", 0);
  await emit("CHARACTER_MESSAGE_RENDERED", undefined as never);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});

control("an emitter that sends no message id still falls back to the elapsed-time guard", async () => {
  // Stepped Thinking and other third-party emitters fire untyped events with no id. Without a key
  // there is nothing to compare, so the old rule survives here and only here.
  const { manager } = setup();
  await emit("CHARACTER_MESSAGE_RENDERED", undefined as never);
  await emit("CHARACTER_MESSAGE_RENDERED", undefined as never);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(300);
  await emit("CHARACTER_MESSAGE_RENDERED", undefined as never);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
});
