/**
 * @jest-environment jsdom
 */
// v2.3 plan 03 (§Abort and cleanup): "stopRuntime ... disposes every subscription it created, and
// start/stop/start dispatches each boundary once".
//
// `RuntimeManager.onBoundary`, `onRollback` and `subscribe` all return an unsubscribe function.
// `startRuntime` called them and threw the return value away, and `stopRuntime` disposed only the
// host-event subscription. So a stop/start cycle left the previous run's listeners registered, and
// every boundary after it dispatched twice — once into live wiring and once into a scheduler,
// scene coordinator and talk controller belonging to a runtime that had been torn down.
//
// This test works against the manager's own subscription bookkeeping rather than `startRuntime`,
// which needs the whole SillyTavern host to run. What it pins is the contract that makes the fix
// possible and the defect visible: a disposed listener stops receiving boundaries.

import { control, must } from "../../test/findings/ledger";

// startRuntime touches a wide slice of the host, so the whole surface it imports is stubbed. The
// point is to run the REAL function: a narrower mock only proves the mock works.
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  observeSamplerPayloads: () => () => undefined,
  observeWorldInfoScans: () => ({ reassert: () => undefined, ordered: false, dispose: () => undefined }),
  loadedEntries: () => [],
  readProfileContextLimit: () => ({ value: 8192, source: "default", reason: "no memory model profile is selected" }),
  countTokens: async (text: string) => Math.ceil(text.length / 4),
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [], groups: [] }),
  registerHostMacro: () => {},
  unregisterHostMacro: () => {},
  startSaveWatcherSurface: () => () => {},
  subscribeToHostEvents: () => () => {},
  judgeTransport: async () => ({ model: null, answers: null }),
  judgeStatus: async () => null,
  getPlayerName: () => "Max",
  getActiveGroup: () => null,
  getActiveCharacterId: () => null,
  getCharacterNameById: () => null,
  getScannableEntries: async () => [],
  forceActivateEntries: async () => true,
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
  executeSlashCommands: async () => ({ pipe: "" }),
  willAddUserMessage: () => false,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  readPromptBuckets: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: async () => undefined,
}));

import { RuntimeManager, runtimeManager } from "./runtimeManager";

// startRuntime wires the module singleton, not a fresh instance.
const runtimeManagerSingleton = () => runtimeManager;

type Probe = {
  onBoundary: (listener: (result: unknown) => void) => () => void;
  onRollback: (listener: (messageId: number, window: unknown) => void) => () => void;
  subscribe: (listener: () => void) => () => void;
  boundaryListeners: Set<(result: unknown) => void>;
  rollbackListeners: Set<unknown>;
  listeners: Set<() => void>;
};

const probe = (manager: RuntimeManager) => manager as unknown as Probe;

/**
 * What `startRuntime` does today, and what it should do: register the three listeners, keeping (or
 * discarding) the disposers. `dispose` models the corrected `stopRuntime`.
 */
function session(manager: Probe, keepDisposers: boolean) {
  const disposers: Array<() => void> = [];
  const keep = (off: () => void) => { if (keepDisposers) disposers.push(off); };
  keep(manager.onBoundary(() => {}));
  keep(manager.onRollback(() => {}));
  keep(manager.subscribe(() => {}));
  return { dispose: () => { disposers.forEach((off) => off()); disposers.length = 0; } };
}

const counts = (manager: Probe) => ({
  boundary: manager.boundaryListeners.size,
  rollback: manager.rollbackListeners.size,
  snapshot: manager.listeners.size,
});

control("a fresh manager starts with no listeners of its own", () => {
  const manager = probe(new RuntimeManager());
  expect(counts(manager)).toEqual({ boundary: 0, rollback: 0, snapshot: 0 });
});

control("one session registers one listener of each kind", () => {
  const manager = probe(new RuntimeManager());
  session(manager, true);
  expect(counts(manager)).toEqual({ boundary: 1, rollback: 1, snapshot: 1 });
});

control("start / stop / start leaves exactly one listener of each kind", () => {
  // The contract the plan states. Without disposal this reads 2 of each, and every boundary is
  // dispatched into a runtime that was torn down.
  const manager = probe(new RuntimeManager());
  const first = session(manager, true);
  first.dispose();
  session(manager, true);

  const after = counts(manager);
  must(
    after.boundary === 1 && after.rollback === 1 && after.snapshot === 1,
    `after start/stop/start the manager holds ${JSON.stringify(after)} — a boundary now dispatches into the torn-down runtime as well as the live one`,
  );
});

control("discarding the disposers is what makes the second start double up", () => {
  // The defect stated positively, so the fix cannot be mistaken for the test being lenient: a
  // session that throws its unsubscribers away leaves its listeners behind for ever.
  const manager = probe(new RuntimeManager());
  session(manager, false).dispose();
  session(manager, false);
  expect(counts(manager)).toEqual({ boundary: 2, rollback: 2, snapshot: 2 });
});

control("a disposed listener stops receiving boundaries", () => {
  // Counting registrations is only a proxy. This is the thing that actually matters.
  const manager = probe(new RuntimeManager());
  let heard = 0;
  const off = manager.onBoundary(() => { heard += 1; });
  manager.boundaryListeners.forEach((listener) => listener({}));
  expect(heard).toBe(1);

  off();
  manager.boundaryListeners.forEach((listener) => listener({}));
  expect(heard).toBe(1);
});

// --- the real startRuntime / stopRuntime ---
//
// The controls above pin the manager's bookkeeping. This one exercises the actual functions, which
// is where the defect lived: they were the caller that threw the unsubscribers away.

control("startRuntime / stopRuntime / startRuntime leaves one listener of each kind", async () => {
  const { startRuntime, stopRuntime } = await import("./index");
  const manager = probe(runtimeManagerSingleton());

  startRuntime();
  const afterFirst = counts(manager);
  stopRuntime();
  const afterStop = counts(manager);
  startRuntime();
  const afterSecond = counts(manager);
  stopRuntime();

  // Stopping must actually remove them, or the second start is simply additive.
  expect(afterStop.boundary).toBe(0);
  must(
    afterSecond.boundary === afterFirst.boundary && afterSecond.rollback === afterFirst.rollback && afterSecond.snapshot === afterFirst.snapshot,
    `a second startRuntime doubled the listeners: first ${JSON.stringify(afterFirst)}, second ${JSON.stringify(afterSecond)}`,
  );
});

// --- the epoch bump reaches its listeners (v2.3 plan 03 §Abort and cleanup) ---

control("an epoch bump notifies listeners, and a disposed one stops hearing it", () => {
  // This is the seam that lets the scheduler drop work queued for a world that has ended. If the
  // bump does not reach a listener, the scheduler keeps the old queue and every fix downstream of
  // it is decoration.
  const manager = probe(new RuntimeManager()) as unknown as {
    onEpochChanged: (listener: () => void) => () => void;
    invalidateRuns: () => void;
  };
  let heard = 0;
  const off = manager.onEpochChanged(() => { heard += 1; });

  manager.invalidateRuns();
  expect(heard).toBe(1);

  off();
  manager.invalidateRuns();
  expect(heard).toBe(1);
});

control("a throwing epoch listener does not stop the others", () => {
  // Same rule as disposal: one bad listener must not strand the rest, or a scheduler somewhere
  // keeps running the previous world's queue.
  const manager = probe(new RuntimeManager()) as unknown as {
    onEpochChanged: (listener: () => void) => () => void;
    invalidateRuns: () => void;
  };
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  let second = 0;
  manager.onEpochChanged(() => { throw new Error("boom"); });
  manager.onEpochChanged(() => { second += 1; });

  expect(() => manager.invalidateRuns()).not.toThrow();
  expect(second).toBe(1);
  warn.mockRestore();
});

control("stopRuntime invalidates old work and restart gets a fresh signal", async () => {
  const { startRuntime, stopRuntime } = await import("./index");
  startRuntime();
  const before = runtimeManager.getOwnership().signal?.();
  const epoch = runtimeManager.getRunContext().sessionEpoch;

  stopRuntime();
  expect(before?.aborted).toBe(true);
  expect(runtimeManager.getRunContext().sessionEpoch).toBeGreaterThan(epoch);

  startRuntime();
  const after = runtimeManager.getOwnership().signal?.();
  expect(after?.aborted).toBe(false);
  stopRuntime();
});
