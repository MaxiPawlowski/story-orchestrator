import { plantedModel } from "../../test/support/modelCall";
// v2.4 acceptance A6 (J7 run 3, lane 2): reads were held for about 32 minutes while the main model
// kept rendering turns. The trip was honest (three reads missed a 64 s budget on a queued pod), but
// every recovery probe died on a fixed 10 s budget ("signal timed out" overwrote the trip detail),
// so a host that was answering, only slowly, could never close the breaker.

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
import { BREAKER_BACKOFF_MS, PROBE_TIMEOUT_MAX_MS, PROBE_TIMEOUT_MS, probeTimeoutMs, type ProbeResult } from "./breaker";
import { ModelCallError } from "./client";
import { ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";
import { finding, must } from "../../test/findings/ledger";

const read = runSharedRead as jest.Mock;
const okRead = async (options: { window: { from: number; to: number } }) => ({
  audit: { id: "x", createdAt: "t", priority: 1, reason: "cadence", contractHash: "h", scope: [], window: options.window, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
  facts: [], memory: [], arcs: [],
});
const timedOut = () => new ModelCallError("timeout", "the memory model did not answer within 64214 ms", "artemis");
const refused = () => new ModelCallError("transport", "API request failed: connect ECONNREFUSED", "artemis");

type Probe = (profileId: string, timeoutMs?: number) => Promise<ProbeResult>;

function harness(probe: Probe) {
  const settings: SchedulerSettings = { enabled: true, profileId: "artemis", cadence: 1, reconciliationMultiplier: 2, stabilityLag: 0 };
  const applied: number[] = [];
  const notes: Array<[string, string]> = [];
  const budgets: Array<number | undefined> = [];
  let open = 0;
  let maxOpen = 0;
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
    noteHealth: (summary, detail) => { notes.push([summary, detail]); },
    probeModel: async (profileId, timeoutMs) => {
      budgets.push(timeoutMs);
      open += 1;
      maxOpen = Math.max(maxOpen, open);
      try {
        return await probe(profileId, timeoutMs);
      } finally {
        open -= 1;
      }
    },
    profileExists: () => true,
    epoch: () => 1,
  };
  return { scheduler: new ExtractionScheduler(host), applied, notes, budgets, maxOpen: () => maxOpen };
}

const wait = (ms: number) => new Promise<void>((resolve) => { globalThis.setTimeout(resolve, ms); });

// A queued llama-server: the probe itself costs nothing, it waits for a slot. It answers when the
// slot frees, provided the probe is still willing to wait by then.
const queuedHost = (queueMs: number): Probe => async (_profileId, timeoutMs = PROBE_TIMEOUT_MS) => {
  await wait(Math.min(queueMs, timeoutMs));
  return queueMs <= timeoutMs ? { ok: true } : { ok: false, kind: "timeout", message: `no answer within ${timeoutMs} ms` };
};

// A host that accepts the connection and never answers: every probe runs to its own budget.
const blackHole: Probe = async (_profileId, timeoutMs = PROBE_TIMEOUT_MS) => {
  await wait(timeoutMs);
  return { ok: false, kind: "timeout", message: `no answer within ${timeoutMs} ms` };
};

const cadenceRead = (from: number, to: number) => ({ priority: 1 as const, reason: "cadence", window: { from, to, messages: [] } });

async function tripOn(h: ReturnType<typeof harness>, error: () => ModelCallError) {
  read.mockRejectedValueOnce(error()).mockRejectedValueOnce(error()).mockRejectedValueOnce(error());
  h.scheduler.schedule(cadenceRead(0, 4));
  await jest.advanceTimersByTimeAsync(800);
  expect(h.scheduler.breakerOpen()).toBe(true);
}

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset();
  read.mockImplementation(okRead);
  mockChat.length = 0;
  for (let index = 0; index < 20; index += 1) mockChat.push({ name: index % 2 ? "Arin" : "Max", mes: `m${index}` });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("A6: the probe budget follows the backoff, floored by the slowest answer seen, capped", () => {
  it("a probe may wait as long as the pause before it, from the 10 s floor up to the 300 s cap", () => {
    expect([0, 1, 2, 3, 4, 9].map((step) => probeTimeoutMs(step, null))).toEqual([PROBE_TIMEOUT_MS, 15000, 60000, 300000, 300000, 300000]);
    expect(PROBE_TIMEOUT_MAX_MS).toBe(BREAKER_BACKOFF_MS[BREAKER_BACKOFF_MS.length - 1]);
  });

  it("the slowest answer the profile gave recently is the least a probe will wait", () => {
    expect(probeTimeoutMs(0, 42000)).toBe(42000);
    expect(probeTimeoutMs(2, 42000)).toBe(60000);
  });

  it("control: a slow answer never lifts a probe past the cap", () => {
    expect(probeTimeoutMs(0, 900000)).toBe(PROBE_TIMEOUT_MAX_MS);
  });
});

describe("A6: a slow but answering host closes the breaker", () => {
  finding("ACC-A6", async () => {
    const h = harness(queuedHost(45000));
    await tripOn(h, timedOut);
    await jest.advanceTimersByTimeAsync(5000 + 10000 + 15000 + 15000 + 60000 + 45000 + 1000);
    must(!h.scheduler.breakerOpen() && h.applied.length === 1, `a queued host that answers a probe within 45 s left the breaker open: probe budgets ${JSON.stringify(h.budgets)}, reads applied ${JSON.stringify(h.applied)}`);
  });

  it("a queued host that answers a probe after 45 s recovers the held reads (J7: 10 s probes never did)", async () => {
    const h = harness(queuedHost(45000));
    await tripOn(h, timedOut);
    await jest.advanceTimersByTimeAsync(5000 + 10000 + 15000 + 15000 + 60000 + 45000 + 1000);
    expect(h.budgets).toEqual([10000, 15000, 60000]);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.applied).toEqual([4]);
    expect(h.notes.at(-1)).toEqual(["memory model answering again", "probe (backoff) succeeded"]);
  });

  it("the first probe waits as long as the slowest call this profile answered", async () => {
    const h = harness(queuedHost(40000));
    h.scheduler.noteAnswered("artemis", 40000);
    await tripOn(h, timedOut);
    await jest.advanceTimersByTimeAsync(5000 + 40000 + 1000);
    expect(h.budgets).toEqual([40000]);
    expect(h.scheduler.breakerOpen()).toBe(false);
  });

  it("control: another profile's slow answer does not stretch this profile's probe", async () => {
    const h = harness(queuedHost(40000));
    h.scheduler.noteAnswered("director-profile", 40000);
    await tripOn(h, timedOut);
    await jest.advanceTimersByTimeAsync(5000 + 10000 + 1);
    expect(h.budgets).toEqual([10000]);
    expect(h.scheduler.breakerOpen()).toBe(true);
  });

  it("a real call that answers on the profile closes its breaker and pumps the held reads", async () => {
    const h = harness(blackHole);
    await tripOn(h, timedOut);
    h.scheduler.noteAnswered("artemis", 70000);
    await jest.advanceTimersByTimeAsync(10);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.scheduler.health()).toBeNull();
    expect(h.applied).toEqual([4]);
    expect(h.notes.at(-1)).toEqual(["memory model answering again", "a model call answered in 70000 ms"]);
    await jest.advanceTimersByTimeAsync(BREAKER_BACKOFF_MS[0] + 1000);
    expect(h.budgets).toEqual([]);
  });

  it("control: an answer on another profile leaves this profile's breaker open", async () => {
    const h = harness(blackHole);
    await tripOn(h, timedOut);
    h.scheduler.noteAnswered("director-profile", 900);
    await jest.advanceTimersByTimeAsync(10);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.applied).toEqual([]);
  });
});

describe("A6 controls: a dead backend still opens the breaker and is never hammered", () => {
  it("a refusing host opens the breaker and keeps the 5/15/60/300 s probe schedule", async () => {
    const h = harness(async () => ({ ok: false, kind: "transport", message: "API request failed: connect ECONNREFUSED" }));
    await tripOn(h, refused);
    await jest.advanceTimersByTimeAsync(5000 + 15000 + 60000 + 300000 + 300000);
    expect(h.budgets).toHaveLength(5);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.scheduler.health()).toMatchObject({ kind: "transport", detail: "API request failed: connect ECONNREFUSED" });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("a host that never answers gets one probe at a time, each bounded by the cap, and stays open", async () => {
    const h = harness(blackHole);
    await tripOn(h, timedOut);
    await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(h.maxOpen()).toBe(1);
    expect(h.budgets.every((budget) => budget !== undefined && budget <= PROBE_TIMEOUT_MAX_MS)).toBe(true);
    expect(h.budgets.length).toBeLessThanOrEqual(8);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.applied).toEqual([]);
    expect(read).toHaveBeenCalledTimes(3);
  });
});
