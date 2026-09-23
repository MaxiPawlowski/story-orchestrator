const mockChat: Array<{ name: string; mes: string }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: mockChat }) }));

jest.mock("./sharedRead", () => ({
  sharedReadWindow: jest.requireActual("./sharedRead").sharedReadWindow,
  runSharedRead: jest.fn(async () => ({
    audit: { id: "x", createdAt: "t", priority: 0, reason: "r", contractHash: "h", scope: [], window: { from: 0, to: 0 }, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
    facts: [{ text: "a fact", evidence: "e", importance: 2 }],
    memory: [{ tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "a memory", evidence: "e" }],
    arcs: [{ kind: "open", text: "an unresolved thread from the read" }],
  })),
}));


import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { CADENCE_WINDOW_MAX, ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

const makeHost = (settings: Partial<SchedulerSettings> = {}): SchedulerHost => ({
  getStory: () => ({}) as unknown as NormalizedStoryV2,
  getEngineState: () => ({}) as unknown as EngineState,
  getExtractionSettings: () => ({ enabled: true, profileId: null, cadence: 1, reconciliationMultiplier: 2, stabilityLag: 1, ...settings }),
  getFacts: () => [],
  getFiredTransitions: () => [],
  getExpansionGateSources: () => [],
  getOpenArcs: () => [],
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

  it("the first cadence window ends at lastMessageId with lag 0, lags behind otherwise, and spans the fallback", async () => {
    mockChat.length = 0;
    for (let index = 0; index < 12; index += 1) mockChat.push({ name: index % 2 ? "Arin" : "Max", mes: `m${index}` });
    const read = runSharedRead as jest.Mock;

    read.mockClear();
    new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 0 })).onBoundary(3, false, 11);
    await flush();
    expect(read.mock.calls[0][0].window).toMatchObject({ from: 4, to: 11 });

    read.mockClear();
    new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 2 })).onBoundary(3, false, 11);
    await flush();
    expect(read.mock.calls[0][0].window).toMatchObject({ from: 2, to: 9 });
    mockChat.length = 0;
  });

  it("forwards parsed memory and arcs from the read to applyExtractionAudit", async () => {
    const applied: unknown[][] = [];
    const host: SchedulerHost = { ...makeHost(), applyExtractionAudit: async (...args: unknown[]) => { applied.push(args); } };
    const scheduler = new ExtractionScheduler(host);
    scheduler.schedule({ priority: 0, reason: "read" });
    await flush();
    expect(applied).toHaveLength(1);
    const [, facts, memory, arcs] = applied[0] as [unknown, Array<{ text: string }>, Array<{ text: string }>, Array<{ text: string }>];
    expect(facts[0].text).toBe("a fact");
    expect(memory[0].text).toBe("a memory");
    expect(arcs[0].text).toBe("an unresolved thread from the read");
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

// V25, found live by V13: cadence counts boundaries and the window counted messages, so at cadence 1
// a read saw only the newest reply and the player's own line was never read.
describe("V25: cadence reads cover the chat without gaps", () => {
  const windows = async (scheduler: ExtractionScheduler, boundaries: Array<[number, number]>) => {
    const read = runSharedRead as jest.Mock;
    read.mockClear();
    for (const [boundary, lastMessageId] of boundaries) {
      scheduler.onBoundary(boundary, false, lastMessageId);
      await flush();
    }
    return read.mock.calls.map((call) => ({ from: call[0].window.from, to: call[0].window.to }));
  };
  beforeEach(() => {
    mockChat.length = 0;
    for (let index = 0; index < 80; index += 1) mockChat.push({ name: index % 4 ? "Arin" : "Max", mes: `m${index}` });
  });
  afterEach(() => { mockChat.length = 0; });

  it("each read starts where the previous one ended, so the player's line between replies is read", async () => {
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 0 }));
    expect(await windows(scheduler, [[1, 11], [2, 13], [3, 14]])).toEqual([{ from: 4, to: 11 }, { from: 12, to: 13 }, { from: 14, to: 14 }]);
  });

  it("at cadence 3 in a solo chat, three boundaries of two messages are all read", async () => {
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 3, stabilityLag: 0 }));
    expect(await windows(scheduler, [[3, 11], [4, 13], [5, 15], [6, 17]])).toEqual([{ from: 4, to: 11 }, { from: 12, to: 17 }]);
  });

  it("a long pause is capped, not sent whole", async () => {
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 0 }));
    expect(await windows(scheduler, [[1, 11], [2, 70]])).toEqual([{ from: 4, to: 11 }, { from: 70 - CADENCE_WINDOW_MAX + 1, to: 70 }]);
  });

  it("a new world, or a chat a rollback made shorter than the cursor, falls back to the default span", async () => {
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 0 }));
    await windows(scheduler, [[1, 30]]);
    expect(await windows(scheduler, [[2, 20]])).toEqual([{ from: 13, to: 20 }]);
    scheduler.clearForNewWorld();
    expect(await windows(scheduler, [[1, 40]])).toEqual([{ from: 33, to: 40 }]);
  });
});
