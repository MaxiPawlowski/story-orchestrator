jest.mock("@services/STAPI", () => ({ getContext: () => ({ chat: [] }) }));

import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

const makeHost = (settings: Partial<SchedulerSettings> = {}): SchedulerHost => ({
  getStory: () => ({}) as unknown as NormalizedStoryV2,
  getEngineState: () => ({}) as unknown as EngineState,
  getExtractionSettings: () => ({ enabled: true, profileId: null, cadence: 1, reconciliationMultiplier: 2, stabilityLag: 1, ...settings }),
  getFacts: () => [],
  getFiredTransitions: () => [],
  getExpansionGateSources: () => [],
  applyExtractionAudit: async () => undefined,
  onSchedulerChange: () => undefined,
  pauseExtraction: () => undefined,
});

describe("ExtractionScheduler reply-path isolation", () => {
  it("does not block the caller while a heavy job runs", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started = false;
    let finished = false;
    const scheduler = new ExtractionScheduler(makeHost());
    scheduler.schedule({ priority: 3, reason: "slow", run: async () => { started = true; await gate; finished = true; } });
    expect(finished).toBe(false);
    await Promise.resolve();
    expect(started).toBe(true);
    expect(finished).toBe(false);
    release();
    await flush();
    expect(finished).toBe(true);
  });

  it("onBoundary returns synchronously and never rejects", () => {
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 1 }));
    expect(scheduler.onBoundary(4, false, 10)).toBeUndefined();
  });
});

describe("ExtractionScheduler pressure rules", () => {
  it("widens cadence: skips the cadence read when the reads lane is backed up", async () => {
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 1, pressureThreshold: 1 }));
    scheduler.schedule({ priority: 2, reason: "a", run: () => new Promise(() => {}) });
    scheduler.schedule({ priority: 2, reason: "b", run: () => new Promise(() => {}) });
    expect(scheduler.getSnapshot().queueDepth).toBe(1);
    scheduler.onBoundary(2, false, 10);
    expect(scheduler.getSnapshot().queueDepth).toBe(1);
  });

  it("coalesces pending P2 scene passes to the latest under pressure", async () => {
    const scheduler = new ExtractionScheduler(makeHost({ pressureThreshold: 2 }));
    scheduler.schedule({ priority: 2, reason: "a", run: () => new Promise(() => {}) });
    scheduler.schedule({ priority: 2, reason: "b", run: () => new Promise(() => {}) });
    scheduler.schedule({ priority: 2, reason: "c", run: () => new Promise(() => {}) });
    expect(scheduler.getSnapshot().queueDepth).toBe(2);
    scheduler.schedule({ priority: 2, reason: "d", run: () => new Promise(() => {}) });
    expect(scheduler.getSnapshot().queueDepth).toBe(1);
  });

  it("defers P4 while reads are under pressure and resumes once it clears", async () => {
    let releaseA = () => {};
    const aGate = new Promise<void>((resolve) => { releaseA = resolve; });
    let p4ran = false;
    const scheduler = new ExtractionScheduler(makeHost({ pressureThreshold: 1 }));
    scheduler.schedule({ priority: 2, reason: "a", run: () => aGate });
    scheduler.schedule({ priority: 2, reason: "b", run: async () => undefined });
    scheduler.schedule({ priority: 4, reason: "consolidate", run: async () => { p4ran = true; } });
    await flush();
    expect(p4ran).toBe(false);
    releaseA();
    await flush();
    expect(p4ran).toBe(true);
  });
});
