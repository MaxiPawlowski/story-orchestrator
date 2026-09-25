// AE-04 (external review, 2026-09-25): `extraction|delayedError` cited "onBoundary returns
// synchronously and never rejects", which injects no failure at all. These hold a read's model call
// open, fail it after the wait, and assert what the scheduler is left holding.

const mockChat: Array<{ name: string; mes: string }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: mockChat }),
}));

jest.mock("./sharedRead", () => ({
  sharedReadWindow: jest.requireActual("./sharedRead").sharedReadWindow,
  runSharedRead: jest.fn(),
}));

import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";

type Held = { window: { from: number; to: number }; answer: () => void; fail: (error: Error) => void };

const read = runSharedRead as jest.Mock;
const held: Held[] = [];

const answerFor = (window: { from: number; to: number }) => ({
  audit: { id: "x", createdAt: "t", priority: 1, reason: "cadence", contractHash: "h", scope: [], window, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
  facts: [], memory: [], arcs: [],
});

function harness() {
  const settings: SchedulerSettings = { enabled: true, profileId: "artemis", cadence: 1, reconciliationMultiplier: 2, stabilityLag: 0 };
  let epoch = 1;
  const applied: number[] = [];
  const health: Array<[string, string]> = [];
  const host: SchedulerHost = {
    getStory: () => ({}) as unknown as NormalizedStoryV2,
    getEngineState: () => ({ lastMessageId: 9 }) as unknown as EngineState,
    getExtractionSettings: () => settings,
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    applyExtractionAudit: async (audit) => { applied.push(audit.window.to); },
    onSchedulerChange: () => undefined,
    noteHealth: (summary, detail) => { health.push([summary, detail]); },
    probeModel: async () => ({ ok: true }),
    profileExists: () => true,
    epoch: () => epoch,
  };
  return { scheduler: new ExtractionScheduler(host), settings, applied, health, endTheWorld: () => { epoch += 1; } };
}

const cadenceRead = (from: number, to: number) => ({ priority: 1 as const, reason: "cadence", window: { from, to, messages: [] } });

const failHeldAfter = async (delayMs: number, message: string) => {
  await jest.advanceTimersByTimeAsync(delayMs);
  held[held.length - 1].fail(new Error(message));
  await jest.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  jest.useFakeTimers();
  held.length = 0;
  read.mockReset();
  read.mockImplementation((options: { window: { from: number; to: number } }) => new Promise((resolve, reject) => {
    held.push({ window: { from: options.window.from, to: options.window.to }, answer: () => resolve(answerFor(options.window)), fail: reject });
  }));
  mockChat.length = 0;
  for (let index = 0; index < 20; index += 1) mockChat.push({ name: index % 2 ? "Arin" : "Max", mes: `m${index}` });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("AE-04 extraction|delayedError: a read whose model call fails after a wait", () => {
  it("retries it, then records the error on the scheduler, applies nothing and keeps serving reads", async () => {
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(0);
    expect(held).toHaveLength(1);
    expect(h.scheduler.getSnapshot()).toMatchObject({ inFlight: true, lastError: null });

    await failHeldAfter(20_000, "the memory model answered 500");
    await jest.advanceTimersByTimeAsync(250);
    expect(held).toHaveLength(2);
    expect(h.scheduler.getSnapshot()).toMatchObject({ inFlight: true, lastError: null });
    await failHeldAfter(20_000, "the memory model answered 500");
    await jest.advanceTimersByTimeAsync(500);
    expect(held).toHaveLength(3);
    await failHeldAfter(20_000, "the memory model answered 500");

    expect(h.scheduler.getSnapshot()).toMatchObject({ inFlight: false, queueDepth: 0, lastError: "the memory model answered 500" });
    expect(h.health).toEqual([["extraction failed: cadence", "the memory model answered 500"]]);
    expect(h.applied).toEqual([]);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.scheduler.health()).toBeNull();
    expect(h.settings.enabled).toBe(true);

    h.scheduler.schedule(cadenceRead(5, 9));
    await jest.advanceTimersByTimeAsync(0);
    held[3].answer();
    await jest.advanceTimersByTimeAsync(0);
    expect(h.applied).toEqual([9]);
    expect(h.scheduler.getSnapshot().lastError).toBeNull();
  });

  it("a recorded error is dropped at the next boundary instead of standing forever", async () => {
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    for (const backoff of [250, 500, 0]) {
      await failHeldAfter(5_000, "the memory model answered 500");
      await jest.advanceTimersByTimeAsync(backoff);
    }
    expect(h.scheduler.getSnapshot().lastError).toBe("the memory model answered 500");
    h.settings.enabled = false;
    h.scheduler.onBoundary(6, false, 12);
    expect(h.scheduler.getSnapshot().lastError).toBeNull();
  });

  it("a failure that lands after the world moved records nothing in the new world", async () => {
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(0);
    h.endTheWorld();
    for (const backoff of [250, 500, 0]) {
      await failHeldAfter(5_000, "the memory model answered 500");
      await jest.advanceTimersByTimeAsync(backoff);
    }
    expect(held).toHaveLength(3);
    expect(h.scheduler.getSnapshot()).toMatchObject({ inFlight: false, lastError: null });
    expect(h.health).toEqual([]);
    expect(h.applied).toEqual([]);
  });

  it("control: the same held read that answers after the wait is applied and leaves no error", async () => {
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(20_000);
    held[0].answer();
    await jest.advanceTimersByTimeAsync(0);
    expect(held).toHaveLength(1);
    expect(h.applied).toEqual([4]);
    expect(h.scheduler.getSnapshot()).toMatchObject({ inFlight: false, lastError: null });
    expect(h.health).toEqual([]);
  });
});
