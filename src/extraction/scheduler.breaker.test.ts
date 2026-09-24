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
import { BREAKER_BACKOFF_MS, DANGLING_PROFILE_DETAIL, type ProbeResult } from "./breaker";
import { ModelCallError } from "./client";
import { CADENCE_WINDOW_MAX, ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";

const read = runSharedRead as jest.Mock;
const okRead = async (options: { window: { from: number; to: number } }) => ({
  audit: { id: "x", createdAt: "t", priority: 1, reason: "cadence", contractHash: "h", scope: [], window: options.window, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
  facts: [], memory: [], arcs: [],
});
const transport = () => new ModelCallError("transport", "API request failed: Response not OK");

interface Harness {
  scheduler: ExtractionScheduler;
  settings: SchedulerSettings;
  applied: number[];
  probes: number[];
  failures: Array<[string, string]>;
  probeAnswers: ProbeResult[];
  profiles: Set<string>;
  endTheWorld(): void;
}

function harness(overrides: Partial<SchedulerHost> = {}): Harness {
  const settings: SchedulerSettings = { enabled: true, profileId: "artemis", cadence: 1, reconciliationMultiplier: 2, stabilityLag: 0 };
  let epoch = 1;
  const h = { settings, applied: [] as number[], probes: [] as number[], failures: [] as Array<[string, string]>, probeAnswers: [] as ProbeResult[], profiles: new Set(["artemis"]) } as Harness;
  const host: SchedulerHost = {
    getStory: () => ({}) as unknown as NormalizedStoryV2,
    getEngineState: () => ({ lastMessageId: 9 }) as unknown as EngineState,
    getExtractionSettings: () => settings,
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    applyExtractionAudit: async (audit) => { h.applied.push(audit.window.to); },
    onSchedulerChange: () => undefined,
    noteHealth: (summary, detail) => { h.failures.push([summary, detail]); },
    probeModel: async () => { h.probes.push(Date.now()); return h.probeAnswers.shift() ?? { ok: true }; },
    profileExists: (id) => h.profiles.has(id),
    epoch: () => epoch,
    ...overrides,
  };
  h.scheduler = new ExtractionScheduler(host);
  h.endTheWorld = () => { epoch += 1; };
  return h;
}

const cadenceRead = (from: number, to: number) => ({ priority: 1 as const, reason: "cadence", window: { from, to, messages: [] } });

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset();
  mockChat.length = 0;
  for (let index = 0; index < 60; index += 1) mockChat.push({ name: index % 2 ? "Arin" : "Max", mes: `m${index}` });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("v2.4 plan 03 D3: a dead backend opens a breaker, never an install-wide pause", () => {
  it("a dead profile never writes extraction.enabled and resumes on probe success", async () => {
    read.mockRejectedValueOnce(transport()).mockRejectedValueOnce(transport()).mockRejectedValueOnce(transport()).mockImplementation(okRead);
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    expect(read).toHaveBeenCalledTimes(3);
    expect(h.settings.enabled).toBe(true);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.scheduler.health()).toMatchObject({ kind: "transport", detail: "API request failed: Response not OK" });
    expect(h.scheduler.getSnapshot()).toMatchObject({ lastError: null, queueDepth: 1 });
    expect(h.applied).toEqual([]);
    await jest.advanceTimersByTimeAsync(BREAKER_BACKOFF_MS[0]);
    expect(h.probes).toHaveLength(1);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.scheduler.health()).toBeNull();
    expect(h.applied).toEqual([4]);
    expect(h.settings.enabled).toBe(true);
  });

  it("probe success pumps held queue, reads and heavy work alike", async () => {
    read.mockRejectedValueOnce(transport()).mockRejectedValueOnce(transport()).mockRejectedValueOnce(transport()).mockImplementation(okRead);
    const h = harness();
    let heavyRuns = 0;
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    h.scheduler.schedule({ priority: 3, reason: "expansion", run: async () => { heavyRuns += 1; } });
    await jest.advanceTimersByTimeAsync(10);
    expect(heavyRuns).toBe(0);
    expect(read).toHaveBeenCalledTimes(3);
    await h.scheduler.probe("player");
    await jest.advanceTimersByTimeAsync(10);
    expect(h.applied).toEqual([4]);
    expect(heavyRuns).toBe(1);
  });

  it("a failed probe backs off 5 s, 15 s, 60 s, then holds at the 300 s cap", async () => {
    read.mockRejectedValue(transport());
    const h = harness();
    h.probeAnswers.push(...Array.from({ length: 5 }, () => ({ ok: false, kind: "transport" as const, message: "API request failed" })));
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    const health = h.scheduler.health();
    const opened = health?.kind === "transport" ? health.since : Number.NaN;
    await jest.advanceTimersByTimeAsync(5000 + 15000 + 60000 + 300000 + 300000);
    expect(h.probes.map((at) => at - opened)).toEqual([5000, 20000, 80000, 380000, 680000]);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("while open a new cadence read merges into the held one, bounded by CADENCE_WINDOW_MAX", async () => {
    read.mockRejectedValue(transport());
    const h = harness();
    h.probeAnswers.push({ ok: false, kind: "transport", message: "down" });
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    h.scheduler.schedule(cadenceRead(5, 30));
    h.scheduler.schedule(cadenceRead(31, 50));
    expect(h.scheduler.getSnapshot().queueDepth).toBe(1);
    expect(h.scheduler.nextReadWindow(50)?.window).toMatchObject({ from: 50 - CADENCE_WINDOW_MAX + 1, to: 50 });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("Try again probes at once, before the backoff runs out", async () => {
    read.mockRejectedValue(transport());
    const h = harness();
    h.probeAnswers.push({ ok: false, kind: "timeout", message: "the memory model did not answer in time" });
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    expect(await h.scheduler.probe("player")).toBe(false);
    expect(h.probes).toHaveLength(1);
    expect(h.scheduler.health()).toMatchObject({ kind: "transport", detail: "the memory model did not answer in time" });
  });

  it("control: a probe while the breaker is closed sends nothing", async () => {
    const h = harness();
    expect(await h.scheduler.probe("online-status")).toBe(true);
    expect(h.probes).toEqual([]);
  });

  it("a heavy job's transport failure opens the same breaker, and holds the reads", async () => {
    const h = harness();
    let attempts = 0;
    h.scheduler.schedule({ priority: 4, reason: "wi-curator:scene", run: async () => { attempts += 1; throw transport(); } });
    await jest.advanceTimersByTimeAsync(800);
    expect(attempts).toBe(3);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.scheduler.getSnapshot().lastHeavyError).toBeNull();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(10);
    expect(read).not.toHaveBeenCalled();
  });

  it("a transport failure after the world changed opens the breaker but does not carry the old job into the new world", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", run: async () => { h.endTheWorld(); throw transport(); } });
    await jest.advanceTimersByTimeAsync(800);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.scheduler.getSnapshot().queueDepth).toBe(0);
  });

  it("control: a transport failure with no profile to key a breaker on is recorded, never held in a loop", async () => {
    read.mockRejectedValue(transport());
    const h = harness();
    h.settings.profileId = null;
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(2000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.scheduler.getSnapshot()).toMatchObject({ queueDepth: 0, lastError: "API request failed: Response not OK" });
  });

  it("the breaker is never part of the persisted snapshot", async () => {
    read.mockRejectedValue(transport());
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(Object.keys(h.scheduler.getSnapshot()).sort()).toEqual(["heavyInFlight", "heavyQueueDepth", "inFlight", "lastError", "lastHeavyError", "queueDepth"]);
  });
});

describe("v2.4 plan 03 D3: config and bug failures are not transport", () => {
  it("a config failure is not retried, not held, and never opens the breaker", async () => {
    read.mockRejectedValue(new ModelCallError("config", "Connection Manager is not available"));
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    expect(read).toHaveBeenCalledTimes(1);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.scheduler.health()).toEqual({ kind: "config", detail: "Connection Manager is not available" });
    expect(h.scheduler.getSnapshot()).toMatchObject({ queueDepth: 0, lastError: null });
    expect(h.settings.enabled).toBe(true);
  });

  it("a deleted profile is config, named as missing, and a created one re-evaluates it away", async () => {
    read.mockRejectedValue(new ModelCallError("config", "The selected memory model profile no longer exists or is not supported (ID: artemis)"));
    const h = harness();
    h.profiles.clear();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(10);
    expect(h.scheduler.health()).toEqual({ kind: "config", detail: DANGLING_PROFILE_DETAIL });
    h.profiles.add("artemis");
    h.scheduler.reevaluateConfig();
    expect(h.scheduler.health()).toBeNull();
  });

  it("a dangling profile id is config before any read is attempted", () => {
    const h = harness();
    h.profiles.clear();
    h.scheduler.reevaluateConfig();
    expect(h.scheduler.health()).toEqual({ kind: "config", detail: DANGLING_PROFILE_DETAIL });
    expect(read).not.toHaveBeenCalled();
  });

  it("control: a profile that exists is not flagged by re-evaluation", () => {
    const h = harness();
    h.scheduler.reevaluateConfig();
    expect(h.scheduler.health()).toBeNull();
  });

  it("deleting the profile under an open breaker turns the problem into config", async () => {
    read.mockRejectedValue(transport());
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    h.profiles.clear();
    h.scheduler.reevaluateConfig();
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.scheduler.health()).toEqual({ kind: "config", detail: DANGLING_PROFILE_DETAIL });
  });

  it("a bug is this chat's error, journaled, never a pause, and cleared at the next boundary", async () => {
    read.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'q')"));
    const h = harness();
    h.scheduler.schedule(cadenceRead(0, 4));
    await jest.advanceTimersByTimeAsync(800);
    expect(h.scheduler.getSnapshot().lastError).toBe("Cannot read properties of undefined (reading 'q')");
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.failures).toEqual([["extraction failed: cadence", "Cannot read properties of undefined (reading 'q')"]]);
    expect(h.settings.enabled).toBe(true);
    read.mockImplementation(okRead);
    h.scheduler.onBoundary(2, true, 9);
    expect(h.scheduler.getSnapshot().lastError).toBeNull();
  });

  it("a bug after the world changed writes nothing into the new world", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 0, reason: "cadence:1", run: async () => { h.endTheWorld(); throw new Error("parse crash"); } });
    await jest.advanceTimersByTimeAsync(1200);
    expect(h.scheduler.getSnapshot().lastError).toBeNull();
    expect(h.failures).toEqual([]);
  });
});
