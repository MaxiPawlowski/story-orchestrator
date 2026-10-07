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
import { BREAKER_BACKOFF_MS, type ProbeResult } from "./breaker";
import { ModelCallError } from "./modelError";
import { ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "./scheduler";
import { runSharedRead } from "./sharedRead";

const read = runSharedRead as jest.Mock;
const okRead = async (options: { window: { from: number; to: number } }) => ({
  audit: { id: "x", createdAt: "t", priority: 1, reason: "cadence", contractHash: "h", scope: [], window: options.window, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
  facts: [], memory: [], arcs: [],
});

function harness() {
  const settings: SchedulerSettings = { enabled: true, profileId: "artemis", cadence: 1, stabilityLag: 0 };
  const probed: string[] = [];
  const probeAnswers: ProbeResult[] = [];
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
    probeModel: async (profileId) => { probed.push(profileId); return probeAnswers.shift() ?? { ok: true }; },
    profileExists: () => true,
    epoch: () => 1,
  };
  return { scheduler: new ExtractionScheduler(host), probed, probeAnswers, applied };
}

const deadCurator = () => new ModelCallError("transport", "API request failed: curator pod down", "curator-pod");

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

describe("v2.4 plan 08 T18: one breaker per routed profile", () => {
  it("a dead curator profile trips its own breaker and never holds the read path", async () => {
    const h = harness();
    const curator = jest.fn(async () => { throw deadCurator(); });
    h.scheduler.schedule({ priority: 4, reason: "wi-curator", run: curator });
    await jest.advanceTimersByTimeAsync(800);
    expect(curator).toHaveBeenCalledTimes(3);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.scheduler.breakerOpen("curator-pod")).toBe(true);
    expect(h.scheduler.health()).toBeNull();
    expect(h.scheduler.profileHealth("curator-pod")).toMatchObject({ kind: "transport", detail: "API request failed: curator pod down" });
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 0, to: 4, messages: [] } });
    await jest.advanceTimersByTimeAsync(10);
    expect(h.applied).toEqual([4]);
    expect(h.scheduler.getSnapshot()).toMatchObject({ heavyQueueDepth: 1, lastHeavyError: null });
  });

  it("a held job waits for its own profile's probe, and runs again when that profile answers", async () => {
    const h = harness();
    let calls = 0;
    const curator = jest.fn(async () => { calls += 1; if (calls <= 3) throw deadCurator(); });
    h.scheduler.schedule({ priority: 4, reason: "wi-curator", run: curator });
    await jest.advanceTimersByTimeAsync(800);
    expect(curator).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(BREAKER_BACKOFF_MS[0]);
    expect(h.probed).toEqual(["curator-pod"]);
    await jest.advanceTimersByTimeAsync(10);
    expect(curator).toHaveBeenCalledTimes(4);
    expect(h.scheduler.breakerOpen("curator-pod")).toBe(false);
  });

  it("a refused route on another role is that role's problem, not the story's not-configured state", async () => {
    const h = harness();
    const summary = jest.fn(async () => { throw new ModelCallError("config", "The profile chosen for Summaries and canon no longer exists (ID: gone)", "gone"); });
    h.scheduler.schedule({ priority: 2, reason: "scene-break:location", run: summary });
    await jest.advanceTimersByTimeAsync(10);
    expect(summary).toHaveBeenCalledTimes(1);
    expect(h.scheduler.health()).toBeNull();
    expect(h.scheduler.profileHealth("gone")).toEqual({ kind: "config", detail: "The profile chosen for Summaries and canon no longer exists (ID: gone)" });
  });

  it("control: a failure on the read profile itself is still the story's health", async () => {
    const h = harness();
    const epistemic = jest.fn(async () => { throw new ModelCallError("transport", "API request failed: read pod down", "artemis"); });
    h.scheduler.schedule({ priority: 2, reason: "epistemic-ledger:location", run: epistemic });
    await jest.advanceTimersByTimeAsync(800);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.scheduler.health()).toMatchObject({ kind: "transport" });
  });
});
