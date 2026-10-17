import { TurnBridge } from "./turnBridge";
import { clearRegeneration, regeneratingMessage } from "./regeneration";
import type { RuntimeManager } from "./runtimeManager";
import { testOwnership } from "../../test/findings/testOwnership";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [] }),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) handlers.set(entry.eventName, entry.handler);
    return () => handlers.clear();
  },
}));

const settle = async () => {
  for (let step = 0; step < 5; step += 1) await Promise.resolve();
};

describe("v2.8 69 follow-up: ST waits for a swipe's rollback before it generates the new swipe", () => {
  it("the MESSAGE_SWIPED handler resolves only once the rollback has landed (ST awaits the emit, then calls Generate('swipe'), script.js:10315-10319)", async () => {
    let release!: () => void;
    const landed = new Promise<void>((resolve) => { release = resolve; });
    const order: string[] = [];
    const manager = {
      commitBoundary: jest.fn(async () => undefined),
      fireAfterSpeak: jest.fn(async () => undefined),
      rollbackOnEnter: jest.fn(async () => false),
      rollbackFromMessage: jest.fn(async () => { await landed; order.push("rollback landed"); }),
      loadSelectedFromChat: jest.fn(async () => undefined),
      reapplyPromptBlocks: jest.fn(),
      reapplyCopilotNudge: jest.fn(),
      getOwnership: () => testOwnership(),
      notify: jest.fn(),
    };
    new TurnBridge(manager as unknown as RuntimeManager).start();
    const emitted = Promise.resolve(handlers.get("MESSAGE_SWIPED")?.(1)).then(() => order.push("emit settled, Generate may run"));
    await settle();
    expect(order).toEqual([]);
    release();
    await emitted;
    expect(order).toEqual(["rollback landed", "emit settled, Generate may run"]);
  });
  it("a swipe that generates marks its message as regenerating until the new reply renders", async () => {
    clearRegeneration();
    const manager = { commitBoundary: jest.fn(async () => undefined), fireAfterSpeak: jest.fn(async () => undefined), rollbackOnEnter: jest.fn(async () => false),
      rollbackFromMessage: jest.fn(async () => undefined), loadSelectedFromChat: jest.fn(async () => undefined), reapplyPromptBlocks: jest.fn(), reapplyCopilotNudge: jest.fn(),
      getOwnership: () => testOwnership(), notify: jest.fn() };
    new TurnBridge(manager as unknown as RuntimeManager).start();
    await handlers.get("MESSAGE_SWIPED")?.(1);
    expect(regeneratingMessage()).toBe(1);
    await handlers.get("CHARACTER_MESSAGE_RENDERED")?.(1, "swipe");
    expect(regeneratingMessage()).toBeNull();
  });
});
