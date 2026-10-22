import { TurnBridge } from "@runtime/turnBridge";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { testOwnership } from "../../test/findings/testOwnership";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const host = { generating: false };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [] }),
  isHostGenerating: () => host.generating,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    entries.forEach((entry) => handlers.set(entry.eventName, entry.handler));
    return () => handlers.clear();
  },
}));

const settle = async () => { for (let at = 0; at < 4; at += 1) await Promise.resolve(); };

const setup = () => {
  const manager = {
    commitBoundary: jest.fn(async () => {}), fireAfterSpeak: jest.fn(async () => {}), rollbackFromMessage: jest.fn(async () => {}),
    rollbackOnEnter: jest.fn(async () => false), loadSelectedFromChat: jest.fn(async () => {}), reapplyPromptBlocks: jest.fn(),
    reapplyCopilotNudge: jest.fn(), getOwnership: () => testOwnership(), notify: jest.fn(),
  };
  new TurnBridge(manager as unknown as RuntimeManager).start();
  return manager;
};

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-22T00:00:00Z")); handlers.clear(); host.generating = false; });
afterEach(() => jest.useRealTimers());

test("B17: a reply rendered while a peer holds the send lock past 60 s still commits once the lock clears", async () => {
  const manager = setup();
  host.generating = true;
  await handlers.get("CHARACTER_MESSAGE_RENDERED")?.(1, "normal");
  await settle();
  await jest.advanceTimersByTimeAsync(61_000);
  expect(manager.commitBoundary).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(30_000);
  host.generating = false;
  await jest.advanceTimersByTimeAsync(2_500);
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
});

test("B17: the group wrapper finishing flushes a parked reply without waiting for the poll", async () => {
  const manager = setup();
  host.generating = true;
  await handlers.get("CHARACTER_MESSAGE_RENDERED")?.(1, "normal");
  await settle();
  host.generating = false;
  await handlers.get("GROUP_WRAPPER_FINISHED")?.({ selected_group: "g1", type: "normal" });
  await settle();
  expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
});
