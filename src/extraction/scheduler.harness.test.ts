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

import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { Breaker, failureClass, type ProbeResult } from "./breaker";
import { ModelCallError } from "./modelError";
import { ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";

const read = runSharedRead as jest.Mock;
const HARNESS = "harness:claude:sonnet";

function harness(readRoute: string, heavyRoute: string | null) {
  const settings: SchedulerSettings = { enabled: true, profileId: readRoute, cadence: 1, reconciliationMultiplier: 2, stabilityLag: 0 };
  const probed: string[] = [];
  const answers: ProbeResult[] = [];
  const applied: number[] = [];
  const host: SchedulerHost = {
    getStory: () => ({}) as unknown as NormalizedStoryV2,
    getEngineState: () => ({ lastMessageId: 9 }) as unknown as EngineState,
    getExtractionSettings: () => settings,
    model: plantedModel,
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    applyExtractionAudit: async (audit) => { applied.push(audit.window.to); },
    onSchedulerChange: () => undefined,
    noteHealth: () => undefined,
    probeModel: async (key) => { probed.push(key); return answers.shift() ?? { ok: true }; },
    profileExists: (id) => id === "local",
    heavyRouteKey: () => heavyRoute,
    epoch: () => 1,
  };
  return { scheduler: new ExtractionScheduler(host), probed, answers, applied };
}

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset();
  read.mockImplementation(async (options: { window: { from: number; to: number } }) => ({
    audit: { id: "x", createdAt: "t", priority: 1, reason: "cadence", contractHash: "h", scope: [], window: options.window, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
    facts: [], memory: [], arcs: [],
  }));
  mockChat.length = 0;
  for (let index = 0; index < 20; index += 1) mockChat.push({ name: index % 2 ? "Arin" : "Max", mes: `m${index}` });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("H3: a harness route has its own breaker, and each lane is gated by its own route", () => {
  it("the new failure kinds: auth, quota and malformed hold the route; refused is config", () => {
    for (const kind of ["auth", "quota", "malformed"] as const) expect(failureClass(new ModelCallError(kind, "x", HARNESS))).toBe("transport");
    expect(failureClass(new ModelCallError("refused", "x", HARNESS))).toBe("config");
  });

  it("a quota answer holds its route until the retry time, not just the first backoff step", () => {
    const breaker = new Breaker();
    breaker.trip(HARNESS, "usage limit", 1000, 1000 + 3_600_000);
    expect(breaker.entry(HARNESS)?.nextProbeAt).toBe(1000 + 3_600_000);
    breaker.trip("local", "down", 1000);
    expect(breaker.entry("local")?.nextProbeAt).toBe(6000);
  });

  it("a dangling-profile check never mistakes a harness key for a deleted profile", async () => {
    const h = harness(HARNESS, "local");
    h.scheduler.schedule({ priority: 2, reason: "scene", run: async () => { throw new ModelCallError("quota", "usage limit", HARNESS, null, Date.now() + 3_600_000); } });
    await jest.advanceTimersByTimeAsync(800);
    expect(h.scheduler.profileHealth(HARNESS)).toMatchObject({ kind: "transport", detail: "usage limit" });
    await jest.advanceTimersByTimeAsync(300_000);
    expect(h.probed).toEqual([]);
  });

  it("a read route on a held harness does not hold the background lane on its local route", async () => {
    const h = harness(HARNESS, "local");
    read.mockImplementation(async () => { throw new ModelCallError("auth", "not logged in", HARNESS); });
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 0, to: 4, messages: [] } });
    await jest.advanceTimersByTimeAsync(800);
    expect(h.scheduler.breakerOpen(HARNESS)).toBe(true);
    const summary = jest.fn(async () => undefined);
    h.scheduler.schedule({ priority: 4, reason: "arc-summary", run: summary });
    await jest.advanceTimersByTimeAsync(10);
    expect(summary).toHaveBeenCalledTimes(1);
  });

  it("a background failure on a harness trips that harness, never the read route that did not fail", async () => {
    const h = harness("local", HARNESS);
    h.scheduler.schedule({ priority: 4, reason: "arc-summary", run: async () => { throw new ModelCallError("quota", "usage limit", HARNESS, null, Date.now() + 3_600_000); } });
    await jest.advanceTimersByTimeAsync(800);
    expect(h.scheduler.breakerOpen(HARNESS)).toBe(true);
    expect(h.scheduler.breakerOpen("local")).toBe(false);
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 0, to: 4, messages: [] } });
    await jest.advanceTimersByTimeAsync(800);
    expect(h.applied).toEqual([4]);
  });

  it("control: with no background route of its own the background lane waits on the read route", async () => {
    const h = harness(HARNESS, null);
    read.mockImplementation(async () => { throw new ModelCallError("auth", "not logged in", HARNESS); });
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 0, to: 4, messages: [] } });
    await jest.advanceTimersByTimeAsync(800);
    const summary = jest.fn(async () => undefined);
    h.scheduler.schedule({ priority: 4, reason: "arc-summary", run: summary });
    await jest.advanceTimersByTimeAsync(10);
    expect(summary).not.toHaveBeenCalled();
  });
});
