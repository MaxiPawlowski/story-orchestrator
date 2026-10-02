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

import { readFileSync } from "fs";
import { join } from "path";
import type { EngineHistory, EngineState, NormalizedStoryV2 } from "@engine/index";
import { droppedReadEnd, readCursorSeed } from "./readCursor";
import { ExtractionScheduler, RESUME_DROPPED_REASON, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";

interface Recorded {
  appliedRanges: Array<{ boundary: number; from: number; to: number }>;
  audits: Array<{ id: string; reason: string; window: { from: number; to: number }; accepted: number }>;
  returnedAt: { boundary: number; lastMessageId: number };
  cadence: number;
  stabilityLag: number;
  firstCampEvidenceMessage: number;
}

const recorded = (JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/t4-2-2-chat-switch.recorded.json"), "utf8")) as { readCursor: Recorded }).readCursor;

const history = (): EngineHistory => {
  const boundaries = [...new Set(recorded.appliedRanges.map((range) => range.boundary)), recorded.returnedAt.boundary];
  const log = Array.from({ length: Math.max(...boundaries) }, (_unused, index) => ({
    boundary: index + 1,
    queue: {
      applied: recorded.appliedRanges.filter((range) => range.boundary === index + 1)
        .map((range) => ({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: range.from, to: range.to }, deltas: [], outcomes: [] })),
      discarded: [],
    },
  }));
  return { from: { boundary: 0, messageId: 0 }, base: {}, log } as unknown as EngineHistory;
};

const audits = () => recorded.audits.map((audit) => ({ window: audit.window, acceptedDeltas: Array.from({ length: audit.accepted }, () => ({ q: "x", v: true })) })) as never;

const read = runSharedRead as jest.Mock;
const windows = () => read.mock.calls.map((call) => `${call[0].window.from}-${call[0].window.to}`);
const reasons = () => read.mock.calls.map((call) => call[0].reason);

function harness(lastMessageId: () => number) {
  const settings: SchedulerSettings = { enabled: true, profileId: "deepseek", cadence: recorded.cadence, reconciliationMultiplier: 2, stabilityLag: recorded.stabilityLag };
  const host: SchedulerHost = {
    getStory: () => ({}) as unknown as NormalizedStoryV2,
    getEngineState: () => ({ lastMessageId: lastMessageId() }) as unknown as EngineState,
    getExtractionSettings: () => settings,
    model: plantedModel,
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    applyExtractionAudit: async () => undefined,
    onSchedulerChange: () => undefined,
    profileExists: () => true,
    readCursorSeed: () => readCursorSeed(history()),
  };
  return new ExtractionScheduler(host);
}

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset();
  read.mockImplementation(async (options: { window: { from: number; to: number } }) => ({
    audit: { id: "x", createdAt: "t", priority: 1, reason: "r", contractHash: "h", scope: [], window: options.window, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
    facts: [], memory: [], arcs: [],
  }));
  mockChat.length = 0;
  for (let index = 0; index < 30; index += 1) mockChat.push({ name: index % 2 ? "Narrator" : "Player", mes: `m${index}` });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("T4-2-2 finding 2: deltas queued just before a chat switch are read again on return (first_camp, journal.jsonl:393-400)", () => {
  it("the recorded history applied reads up to msg 7, and two reads of msgs 2-9 accepted deltas no boundary applied", () => {
    const seed = readCursorSeed(history());
    expect(seed).toBe(7);
    expect(droppedReadEnd(seed, audits())).toBe(9);
  });

  it("coming back, the dropped span is read at once, before the next boundary, so its deltas apply at boundary 8", async () => {
    let last = recorded.returnedAt.lastMessageId;
    const scheduler = harness(() => last);
    scheduler.clearForNewWorld();
    scheduler.resumeDroppedRead(droppedReadEnd(readCursorSeed(history()), audits()), recorded.returnedAt.lastMessageId);
    await jest.advanceTimersByTimeAsync(10);
    expect(windows()).toEqual(["8-9"]);
    expect(read.mock.calls[0][0].window.from).toBeLessThanOrEqual(recorded.firstCampEvidenceMessage);
    expect(read.mock.calls[0][0].window.to).toBeGreaterThanOrEqual(recorded.firstCampEvidenceMessage);
    last = 11;
    scheduler.onBoundary(8, false, 11);
    await jest.advanceTimersByTimeAsync(10);
    expect(windows()).toEqual(["8-9"]);
    last = 12;
    scheduler.onBoundary(9, false, 12);
    await jest.advanceTimersByTimeAsync(10);
    expect(windows()).toEqual(["8-9", "10-12"]);
    expect(reasons()[0]).toBe(RESUME_DROPPED_REASON);
  });

  it("control (the recording): without the resume nothing reads msg 9 until the cadence read at boundary 9 (8-12), so first_camp applies at boundary 10", async () => {
    const scheduler = harness(() => 12);
    scheduler.clearForNewWorld();
    scheduler.onBoundary(8, false, 11);
    await jest.advanceTimersByTimeAsync(10);
    expect(windows()).toEqual([]);
    scheduler.onBoundary(9, false, 12);
    await jest.advanceTimersByTimeAsync(10);
    expect(windows()).toEqual(["8-12"]);
  });

  it("control: a chat whose every accepted read was applied asks for nothing on return", async () => {
    const applied = recorded.audits.filter((audit) => audit.window.to <= 7).map((audit) => ({ window: audit.window, acceptedDeltas: [{ q: "x", v: true }] })) as never;
    expect(droppedReadEnd(7, applied)).toBeNull();
    const scheduler = harness(() => 9);
    scheduler.resumeDroppedRead(droppedReadEnd(7, applied), 9);
    await jest.advanceTimersByTimeAsync(10);
    expect(windows()).toEqual([]);
  });

  it("a read that accepted nothing is not a dropped read", () => {
    expect(droppedReadEnd(7, [{ window: { from: 2, to: 9 }, acceptedDeltas: [] }] as never)).toBeNull();
  });
});
