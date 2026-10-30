jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {} }), sendConnectionProfileRequest: jest.fn() }));

import { ExtractionScheduler, type SchedulerHost } from "./scheduler";
import { READ_WAIT_BOUND_MS, YIELD_MAX_MS, readWaitClock } from "./yieldGate";

const harness = (yieldTo: () => Promise<unknown> | null) => {
  const host = {
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getEngineState: () => ({ activeCheckpointId: "cp1", boundary: 5, lastMessageId: 9 }),
    getExtractionSettings: () => ({ enabled: true, cadence: 1, profileId: "p1", debugResponse: "SCENE_NONE" }),
    getFacts: () => [], getFiredTransitions: () => [], getExpansionGateSources: () => [], getOpenArcs: () => [],
    getEpistemicLedgerCapable: () => false, getEntities: () => [], applyExtractionAudit: async () => {},
    onSchedulerChange: () => {}, judgeTyped: () => null, yieldTo,
  } as unknown as SchedulerHost;
  return new ExtractionScheduler(host);
};

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe("v2.9 side finding: a boundary's reads wait for the inner beat on the shared model", () => {
  afterEach(() => jest.useRealTimers());

  it("a read job starts only after the in-flight inner beat settles", async () => {
    let finish = () => {};
    const beat = new Promise<void>((resolve) => { finish = resolve; });
    let pending: Promise<unknown> | null = beat;
    const scheduler = harness(() => pending);
    const run = jest.fn(async () => {});
    scheduler.schedule({ priority: 0, reason: "cadence", run });
    await flush();
    expect(run).not.toHaveBeenCalled();
    pending = null;
    finish();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a beat that never settles holds the read at most YIELD_MAX_MS", async () => {
    jest.useFakeTimers();
    const scheduler = harness(() => new Promise(() => {}));
    const run = jest.fn(async () => {});
    scheduler.schedule({ priority: 0, reason: "cadence", run });
    await jest.advanceTimersByTimeAsync(YIELD_MAX_MS - 1);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("v3.0 29: the snapshot says the read waits on the beat only while it does", async () => {
    let finish = () => {};
    const beat = new Promise<void>((resolve) => { finish = resolve; });
    let pending: Promise<unknown> | null = beat;
    const scheduler = harness(() => pending);
    expect(scheduler.getSnapshot().yielding).toBe(false);
    let release = () => {};
    scheduler.schedule({ priority: 0, reason: "cadence", run: () => new Promise<void>((resolve) => { release = resolve; }) });
    await flush();
    expect(scheduler.getSnapshot()).toMatchObject({ yielding: true, inFlight: false });
    pending = null;
    finish();
    await flush();
    expect(scheduler.getSnapshot()).toMatchObject({ yielding: false, inFlight: true });
    release();
    await flush();
    expect(scheduler.getSnapshot()).toMatchObject({ inFlight: false });
  });

  it("v3.0 29: the read-wait clock stamps an in-flight read once, re-publishes at the bound, and clears when it ends", async () => {
    jest.useFakeTimers();
    const changed = jest.fn();
    const clock = readWaitClock(changed);
    expect(clock({ inFlight: false }).inFlightSince).toBeNull();
    const first = clock({ inFlight: true }).inFlightSince;
    expect(typeof first).toBe("number");
    expect(clock({ inFlight: true }).inFlightSince).toBe(first);
    await jest.advanceTimersByTimeAsync(READ_WAIT_BOUND_MS + 50);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(clock({ inFlight: false }).inFlightSince).toBeNull();
    clock({ inFlight: true });
    clock({ inFlight: false });
    await jest.advanceTimersByTimeAsync(READ_WAIT_BOUND_MS + 50);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("control: with no beat in flight the read runs at once", async () => {
    const scheduler = harness(() => null);
    const run = jest.fn(async () => {});
    scheduler.schedule({ priority: 0, reason: "cadence", run });
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
