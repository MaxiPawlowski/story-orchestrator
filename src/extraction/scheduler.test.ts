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
import { ModelCallError } from "./modelError";

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

const makeHost = (settings: Partial<SchedulerSettings> = {}) => ({
  getStory: () => ({}) as unknown as NormalizedStoryV2,
  getEngineState: () => ({}) as unknown as EngineState,
  getExtractionSettings: () => ({ enabled: true, profileId: null, cadence: 1, stabilityLag: 1, ...settings }),
  getFacts: () => [],
  getFiredTransitions: () => [],
  getExpansionGateSources: () => [],
  getOpenArcs: () => [],
  applyExtractionAudit: async () => undefined,
  onSchedulerChange: () => undefined,
}) as Partial<SchedulerHost> as SchedulerHost;

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

// v2.4 plan 01 (T1 live, 2026-09-24). A queued job carried the window it was scheduled with, messages
// and all. A /cut deletes one row per event, and the first event's rollback queued a re-read over the
// chat as it stood between the two deletes, so the read quoted a message that no longer existed and
// stamped its rows past the end of the chat.
describe("a queued read reads the chat as it is when it runs", () => {
  it("re-reads the window's messages at run time and clamps it to the chat", async () => {
    mockChat.length = 0;
    for (let index = 0; index < 9; index += 1) mockChat.push({ name: index % 2 ? "Arin" : "Max", mes: `m${index}` });
    const { getChatWindow } = jest.requireActual("./chatWindow") as typeof import("./chatWindow");
    const queued = getChatWindow(0, 8);
    mockChat.splice(6, 1);
    const read = runSharedRead as jest.Mock;
    read.mockClear();
    new ExtractionScheduler(makeHost()).schedule({ priority: 0, reason: "rollback:6", window: queued });
    await flush();
    const window = read.mock.calls[0][0].window as { from: number; to: number; messages: Array<{ text: string }> };
    expect(window.to).toBe(7);
    expect(window.messages.map((message) => message.text)).not.toContain("m6");
    expect(window.messages).toHaveLength(8);
    mockChat.length = 0;
  });

  it("a triggered read that starts after later boundaries reads up to the newest committed message", async () => {
    mockChat.length = 0;
    for (let index = 0; index < 6; index += 1) mockChat.push({ name: index % 2 ? "Tobias" : "Max", mes: `m${index}` });
    let lastMessageId = 1;
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = runSharedRead as jest.Mock;
    read.mockClear();
    const scheduler = new ExtractionScheduler({ ...makeHost(), getEngineState: () => ({ lastMessageId }) as unknown as EngineState });
    scheduler.schedule({ priority: 0, reason: "scene:cast", run: async () => { await gate; } });
    scheduler.schedule({ priority: 0, reason: "cue:guild-hall->road" });
    lastMessageId = 5;
    release();
    await flush();
    expect(read.mock.calls[0][0].window).toMatchObject({ from: 0, to: 5 });
    mockChat.length = 0;
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

  it("at cadence 3, three boundaries of two messages each are all read", async () => {
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

describe("v2.4 plan 02 §10: the window the scheduler would read next", () => {
  beforeEach(() => {
    mockChat.length = 0;
    for (let index = 0; index < 16; index += 1) mockChat.push({ name: index % 2 ? "Arin" : "Max", mes: `m${index}` });
  });
  afterEach(() => { mockChat.length = 0; });

  it("predicts the cadence read the next boundary actually takes", async () => {
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 0 }));
    expect(scheduler.nextReadWindow(11)).toMatchObject({ source: "cadence", window: { from: 4, to: 11 } });
    const read = runSharedRead as jest.Mock;
    read.mockClear();
    scheduler.onBoundary(1, false, 11);
    await flush();
    const predicted = scheduler.nextReadWindow(13);
    scheduler.onBoundary(2, false, 13);
    await flush();
    expect(predicted?.window).toEqual(read.mock.calls[1][0].window);
    expect(predicted?.window).toMatchObject({ from: 12, to: 13 });
  });

  it("keeps a hidden message inside the range and out of the messages", () => {
    (mockChat[6] as { is_system?: boolean }).is_system = true;
    const next = new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 0 })).nextReadWindow(11);
    expect(next?.window).toMatchObject({ from: 4, to: 11 });
    expect(next?.window.messages.map((message) => message.messageId)).toEqual([4, 5, 7, 8, 9, 10, 11]);
  });

  it("a queued read with a window is what runs next, not the cadence read", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scheduler = new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 0 }));
    scheduler.schedule({ priority: 2, reason: "hold", run: async () => { await gate; } });
    await Promise.resolve();
    scheduler.schedule({ priority: 0, reason: "rollback:3", window: { from: 3, to: 9, messages: [] } });
    expect(scheduler.nextReadWindow(11)).toEqual({ source: "queued", reason: "rollback:3", window: { from: 3, to: 9, messages: [] } });
    release();
    await flush();
  });

  it("answers null before there is a stable message to read", () => {
    expect(new ExtractionScheduler(makeHost({ cadence: 1, stabilityLag: 1 })).nextReadWindow(0)).toBeNull();
  });
});

describe("v2.4 plan 03 D2: a lapsed read is discarded, never retried, never an error", () => {
  afterEach(() => jest.useRealTimers());
  const lapsedHost = (overrides: Partial<SchedulerHost> = {}) => {
    const calls = { failures: [] as string[], lapses: [] as Array<[string, string]>, released: 0, signal: new AbortController().signal };
    const host: SchedulerHost = {
      ...makeHost(),
      beginRead: () => ({ stillOwns: () => false, lapsedDetail: () => "window: message 3 was edited", signal: calls.signal, release: () => { calls.released += 1; } }),
      noteHealth: (summary) => { calls.failures.push(summary); },
      noteLapse: (reason, detail) => { calls.lapses.push([reason, detail]); },
      ...overrides,
    };
    return { host, calls };
  };

  it("an aborted read is not retried and records no error", async () => {
    const read = runSharedRead as jest.Mock;
    read.mockClear();
    read.mockRejectedValueOnce(new ModelCallError("lapsed", "the request was cancelled"));
    const { host, calls } = lapsedHost();
    jest.useFakeTimers();
    const scheduler = new ExtractionScheduler(host);
    scheduler.schedule({ priority: 0, reason: "rollback:3", window: { from: 0, to: 4, messages: [] } });
    await jest.advanceTimersByTimeAsync(900);
    expect(read).toHaveBeenCalledTimes(1);
    expect(scheduler.getSnapshot().lastError).toBeNull();
    expect(calls.failures).toEqual([]);
    expect(calls.lapses).toEqual([["extraction read lapsed: rollback:3", "the request was cancelled"]]);
    expect(calls.released).toBe(1);
  });

  it("hands the read's own signal to the model call", async () => {
    const read = runSharedRead as jest.Mock;
    read.mockClear();
    const { host, calls } = lapsedHost({ applyExtractionAudit: async () => undefined });
    new ExtractionScheduler(host).schedule({ priority: 0, reason: "manual", window: { from: 0, to: 0, messages: [] } });
    await flush();
    expect(read.mock.calls[0][0].ask.signal).toBe(calls.signal);
    expect(calls.released).toBe(1);
  });

  it("control: a transport failure is still retried, and opens the breaker instead of recording an error", async () => {
    const read = runSharedRead as jest.Mock;
    read.mockReset();
    read.mockRejectedValue(new ModelCallError("transport", "API request failed: Response not OK"));
    const { host, calls } = lapsedHost({ getExtractionSettings: () => ({ enabled: true, profileId: "p1", cadence: 1, stabilityLag: 1 }) });
    jest.useFakeTimers();
    const scheduler = new ExtractionScheduler(host);
    scheduler.schedule({ priority: 0, reason: "manual", window: { from: 0, to: 0, messages: [] } });
    await jest.advanceTimersByTimeAsync(900);
    expect(read).toHaveBeenCalledTimes(3);
    expect(scheduler.getSnapshot().lastError).toBeNull();
    expect(scheduler.health()).toMatchObject({ kind: "transport", detail: "API request failed: Response not OK" });
    expect(calls.lapses).toEqual([]);
    scheduler.dispose();
    read.mockReset();
  });

  it("a lapsed heavy job leaves no heavy error either", async () => {
    const { host, calls } = lapsedHost();
    const scheduler = new ExtractionScheduler(host);
    let attempts = 0;
    scheduler.schedule({ priority: 4, reason: "wi-curator:scene", run: async () => { attempts += 1; throw new ModelCallError("lapsed", "the request was cancelled"); } });
    await flush();
    expect(attempts).toBe(1);
    expect(scheduler.getSnapshot().lastHeavyError).toBeNull();
    expect(calls.lapses).toHaveLength(1);
  });
});
