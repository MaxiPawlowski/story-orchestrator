import { plantedModel } from "../../test/support/modelCall";
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

import type { EngineHistory, EngineState, NormalizedStoryV2 } from "@engine/index";
import { readCursorSeed } from "./readCursor";
import { ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";

const read = runSharedRead as jest.Mock;
const okRead = async (options: { window: { from: number; to: number } }) => ({
  audit: { id: "x", createdAt: "t", priority: 1, reason: "cadence", contractHash: "h", scope: [], window: options.window, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
  facts: [], memory: [], arcs: [],
});

const boundary = (number: number, applied: Array<{ from: number; to: number }> = []) => ({
  boundary: number,
  queue: { applied: applied.map((turnRange) => ({ source: "extractor", blackboardVersionSum: 0, turnRange, deltas: [], outcomes: [] })), discarded: [] },
});
const history = (log: ReturnType<typeof boundary>[]) => ({ from: { boundary: 0, messageId: 0 }, base: {}, log }) as unknown as EngineHistory;

function harness(seed: () => number | null) {
  const settings: SchedulerSettings = { enabled: true, profileId: "deepseek", cadence: 1, stabilityLag: 0 };
  const host: SchedulerHost = {
    getStory: () => ({}) as unknown as NormalizedStoryV2,
    getEngineState: () => ({ lastMessageId: 9 }) as unknown as EngineState,
    getExtractionSettings: () => settings,
    model: plantedModel,
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    applyExtractionAudit: async () => undefined,
    onSchedulerChange: () => undefined,
    profileExists: () => true,
    readCursorSeed: seed,
  };
  return new ExtractionScheduler(host);
}

const windows = () => read.mock.calls.map((call) => `${call[0].window.from}-${call[0].window.to}`);

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset();
  read.mockImplementation(okRead);
  mockChat.length = 0;
  for (let index = 0; index < 30; index += 1) mockChat.push({ name: index % 2 ? "Narrator" : "Player", mes: `m${index}` });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("T2-6: a read whose deltas never applied is read again after the chat comes back (T2-6-1 journal.jsonl:122, :237, :306)", () => {
  const replay = async (seed: () => number | null) => {
    const scheduler = harness(seed);
    scheduler.onBoundary(3, false, 4);
    await jest.advanceTimersByTimeAsync(10);
    scheduler.clearForNewWorld();
    scheduler.clearForNewWorld();
    scheduler.onBoundary(6, false, 9);
    await jest.advanceTimersByTimeAsync(10);
    return windows();
  };

  it("the queued deltas of msgs 0-4 were dropped on leave, so the first read back starts at msg 0, not 2", async () => {
    const recorded = history([boundary(1), boundary(2), boundary(3), boundary(4), boundary(5), boundary(6)]);
    expect(await replay(() => readCursorSeed(recorded))).toEqual(["0-4", "0-9"]);
  });

  it("starts after the last read a boundary actually applied", async () => {
    const applied = history([boundary(1), boundary(2), boundary(3), boundary(4, [{ from: 0, to: 4 }]), boundary(5), boundary(6)]);
    expect(await replay(() => readCursorSeed(applied))).toEqual(["0-4", "5-9"]);
  });

  it("control: without the seed the read back takes the default 8-message span, 2-9, and misses the acceptance at msg 1", async () => {
    expect(await replay(() => null)).toEqual(["0-4", "2-9"]);
  });

  it("a story with no boundary yet keeps the default span", () => {
    expect(readCursorSeed(history([]))).toBeNull();
    expect(readCursorSeed(null)).toBeNull();
  });
});

describe("T2-6: a read that fails for good leaves its window for the next cadence read", () => {
  it("a dropped read's window is covered by the next one", async () => {
    const scheduler = harness(() => null);
    scheduler.onBoundary(1, false, 11);
    await jest.advanceTimersByTimeAsync(10);
    read.mockRejectedValueOnce(new Error("parse crash")).mockRejectedValueOnce(new Error("parse crash")).mockRejectedValueOnce(new Error("parse crash"));
    scheduler.onBoundary(2, false, 13);
    await jest.advanceTimersByTimeAsync(1000);
    scheduler.onBoundary(3, false, 15);
    await jest.advanceTimersByTimeAsync(10);
    expect(windows()).toEqual(["4-11", "12-13", "12-13", "12-13", "12-15"]);
  });
});
