const mockChat: Array<{ name: string; mes: string }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: mockChat }),
}));

import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { BREAKER_BACKOFF_MS, type FailoverGate, type ProbeResult } from "@extraction/breaker";
import { ModelCallError } from "@extraction/modelError";
import type { ModelRoute } from "@extraction/modelRoute";
import type { RouteReply } from "@extraction/reply";
import { ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "@extraction/scheduler";
import { createModelCallVia, failoverRoute } from "./modelCallCore";
import type { ModelCallRecord } from "./modelCallLog";
import { derivePipelineStatus, failoverDetail, TRANSPORT_PLAYER_TEXT } from "./pipeline";
import type { RunOwnership } from "./runToken";
import { sanitizeGlobalSettings } from "./settingsModel";
import type { ExtractionRuntimeState } from "./types";

const timeout = (profileId: string) => new ModelCallError("timeout", `the memory model did not answer within 45000 ms`, profileId, 45000);
const transport = (profileId: string) => new ModelCallError("transport", "API request failed: Response not OK", profileId);
const exists = (id: string) => ["deepseek", "artemis"].includes(id);
const steady = { mint: () => ({}) as never, check: () => ({ ok: true as const }) } as unknown as RunOwnership;

interface Backend {
  down: Set<string>;
  asked: string[];
  failWith: (profileId: string) => ModelCallError;
}

const backend = (down: string[] = [], failWith: (profileId: string) => ModelCallError = timeout): Backend => ({ down: new Set(down), asked: [], failWith });

const replyOf = (b: Backend): RouteReply => async (_prompt, route) => {
  const profileId = route && route.kind === "profile" ? route.profileId : "none";
  b.asked.push(profileId);
  if (b.down.has(profileId)) throw b.failWith(profileId);
  return { text: `ANSWER from ${profileId}`, finish: "stop" };
};

const fakeGate = () => {
  const open = new Set<string>();
  const failures: Array<[string, string]> = [];
  const gate: FailoverGate = { open: (id) => open.has(id), failed: (id, kind) => { failures.push([id, kind]); } };
  return { gate, open, failures };
};

const settingsWith = (fallbackProfileId: string | null = "artemis") => ({ profileId: "deepseek", ...(fallbackProfileId ? { fallbackProfileId } : {}) });

describe("model fallback: the in-flight call", () => {
  it("a primary that times out is asked once more on the fallback, recorded as a fallback from the primary", async () => {
    const b = backend(["deepseek"]);
    const records: ModelCallRecord[] = [];
    const { gate, failures } = fakeGate();
    const model = createModelCallVia(replyOf(b), { settings: () => settingsWith(), exists, gate, ownership: steady, record: (row) => records.push(row), planted: false });
    await expect(model("p", { role: "read", pass: "read" })).resolves.toMatchObject({ text: "ANSWER from artemis" });
    expect(b.asked).toEqual(["deepseek", "artemis"]);
    expect(failures).toEqual([["deepseek", "timeout"]]);
    expect(records.map((row) => [row.route, row.result, row.fallbackFrom])).toEqual([["deepseek", "timeout", undefined], ["artemis", "fallback", "deepseek"]]);
  });

  it("re-checks the run's ownership before the fallback is asked: a call whose chat went away is not retried", async () => {
    const b = backend(["deepseek"]);
    let epoch = 1;
    const ownership = {
      mint: () => ({ epoch }) as never,
      check: (token: never) => ((token as { epoch: number }).epoch === epoch ? { ok: true as const } : { ok: false as const, reason: "epoch" as const }),
    } as unknown as RunOwnership;
    const reply: RouteReply = async (prompt, route, options) => {
      epoch += 1;
      return replyOf(b)(prompt, route, options);
    };
    const model = createModelCallVia(reply, { settings: () => settingsWith(), exists, gate: fakeGate().gate, ownership, planted: false });
    await expect(model("p", { role: "read", pass: "read" })).rejects.toMatchObject({ kind: "lapsed" });
    expect(b.asked).toEqual(["deepseek"]);
  });

  it("a configuration refusal or a reply that ran out of tokens is not an outage: no fallback, no breaker strike", async () => {
    for (const kind of ["config", "reasoning-exhausted", "auth"] as const) {
      const b = backend(["deepseek"], (profileId) => new ModelCallError(kind, kind, profileId));
      const { gate, failures } = fakeGate();
      const model = createModelCallVia(replyOf(b), { settings: () => settingsWith(), exists, gate, planted: false });
      await expect(model("p", { role: "read", pass: "read" })).rejects.toMatchObject({ kind });
      expect(b.asked).toEqual(["deepseek"]);
      expect(failures).toEqual([]);
    }
  });

  it("an answer that does not parse is still an answer: it is returned from the primary and strikes nothing", async () => {
    const { gate, failures } = fakeGate();
    const model = createModelCallVia(async () => ({ text: "garbage {{", finish: "stop" }), { settings: () => settingsWith(), exists, gate, planted: false });
    await expect(model("p", { role: "read", pass: "read" })).resolves.toMatchObject({ text: "garbage {{" });
    expect(failures).toEqual([]);
  });

  it("while the primary's breaker is open the call goes straight to the fallback; with no fallback it still asks the primary", async () => {
    const b = backend();
    const { gate, open } = fakeGate();
    open.add("deepseek");
    const records: ModelCallRecord[] = [];
    const model = createModelCallVia(replyOf(b), { settings: () => settingsWith(), exists, gate, record: (row) => records.push(row), planted: false });
    await model("p", { role: "read", pass: "read" });
    expect(records.map((row) => [row.route, row.result, row.fallbackFrom])).toEqual([["artemis", "fallback", "deepseek"]]);
    const alone = createModelCallVia(replyOf(b), { settings: () => settingsWith(null), exists, gate, planted: false });
    await alone("p", { role: "read", pass: "read" });
    expect(b.asked).toEqual(["artemis", "deepseek"]);
  });

  it("the fallback is a profile route only, never the primary itself, never a missing profile", () => {
    const primary: ModelRoute = { kind: "profile", profileId: "deepseek", effort: "low" };
    expect(failoverRoute(primary, "artemis", exists)).toEqual({ kind: "profile", profileId: "artemis", effort: "low" });
    expect(failoverRoute(primary, "deepseek", exists)).toBeNull();
    expect(failoverRoute(primary, "gone", exists)).toBeNull();
    expect(failoverRoute({ kind: "harness", harness: "claude", model: "sonnet" }, "artemis", exists)).toBeNull();
  });

  it("the setting is install-wide, trimmed, and an empty value means off", () => {
    expect(sanitizeGlobalSettings({ extraction: { profileId: "deepseek", fallbackProfileId: " artemis " } }).extraction.fallbackProfileId).toBe("artemis");
    expect(sanitizeGlobalSettings({ extraction: { profileId: "deepseek", fallbackProfileId: "" } }).extraction).not.toHaveProperty("fallbackProfileId");
    expect(sanitizeGlobalSettings({ extraction: { profileId: "deepseek", fallbackProfileId: null } }).extraction).not.toHaveProperty("fallbackProfileId");
  });
});

interface Harness {
  scheduler: ExtractionScheduler;
  settings: SchedulerSettings;
  notes: Array<[string, string]>;
  probeAnswers: ProbeResult[];
  probed: string[];
  backend: Backend;
  ran: string[];
  job: (name: string) => { priority: 2; reason: string; run: () => Promise<void> };
}

function harness(fallbackProfileId: string | null, down: string[] = ["deepseek"]): Harness {
  const settings: SchedulerSettings = { enabled: true, profileId: "deepseek", cadence: 1, stabilityLag: 0, ...(fallbackProfileId ? { fallbackProfileId } : {}) };
  const h = { settings, notes: [] as Array<[string, string]>, probeAnswers: [] as ProbeResult[], probed: [] as string[], backend: backend(down), ran: [] as string[] } as Harness;
  const gate: FailoverGate = { open: (id) => h.scheduler.gate.open(id), failed: (id, kind, detail) => h.scheduler.gate.failed(id, kind, detail) };
  const model = createModelCallVia(replyOf(h.backend), { settings: () => settings, exists, gate, ownership: steady, planted: false });
  const host: SchedulerHost = {
    getStory: () => ({}) as unknown as NormalizedStoryV2,
    getEngineState: () => ({ lastMessageId: 9 }) as unknown as EngineState,
    getExtractionSettings: () => settings,
    model,
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    applyExtractionAudit: async () => undefined,
    onSchedulerChange: () => undefined,
    noteHealth: (summary, detail) => { h.notes.push([summary, detail]); },
    probeModel: async (id) => { h.probed.push(id); return h.probeAnswers.shift() ?? { ok: true }; },
    profileExists: exists,
    profileName: (id) => (id === "artemis" ? "Story Orchestrator Memory RunPod" : id),
    epoch: () => 1,
  };
  h.scheduler = new ExtractionScheduler(host);
  h.job = (name) => ({ priority: 2, reason: name, run: async () => { h.ran.push((await model("p", { role: "read", pass: "sceneSummary" })).text); } });
  return h;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockChat.length = 0;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("model fallback: the breaker", () => {
  it("one timeout opens the primary's breaker; a transport error needs two in a row, and an answer in between resets the count", () => {
    const h = harness("artemis");
    h.scheduler.gate.failed("deepseek", "transport", "502");
    expect(h.scheduler.gate.open("deepseek")).toBe(false);
    h.scheduler.noteAnswered("deepseek", 900);
    h.scheduler.gate.failed("deepseek", "transport", "502");
    expect(h.scheduler.gate.open("deepseek")).toBe(false);
    h.scheduler.gate.failed("deepseek", "transport", "502");
    expect(h.scheduler.gate.open("deepseek")).toBe(true);
    const other = harness("artemis");
    other.scheduler.gate.failed("deepseek", "timeout", "45 s");
    expect(other.scheduler.gate.open("deepseek")).toBe(true);
  });

  it("an outage switches every pass to the fallback, the pipeline keeps going and only the author detail names it", async () => {
    const h = harness("artemis");
    h.probeAnswers.push({ ok: false, kind: "timeout", message: "still down" });
    h.scheduler.schedule(h.job("first"));
    await jest.advanceTimersByTimeAsync(10);
    h.scheduler.schedule(h.job("second"));
    await jest.advanceTimersByTimeAsync(10);
    expect(h.ran).toEqual(["ANSWER from artemis", "ANSWER from artemis"]);
    expect(h.backend.asked).toEqual(["deepseek", "artemis", "artemis"]);
    expect(h.scheduler.breakerOpen()).toBe(false);
    const health = h.scheduler.health();
    expect(health).toMatchObject({ kind: "transport", fallback: "Story Orchestrator Memory RunPod" });
    const pipeline = derivePipelineStatus({ settings: { enabled: true, profileId: "deepseek" }, scheduler: { queueDepth: 0, inFlight: false, lastError: null }, reconciliationEvents: [] } as unknown as ExtractionRuntimeState, undefined, health);
    expect(pipeline).toMatchObject({ state: "idle", detail: failoverDetail("Story Orchestrator Memory RunPod") });
    expect(pipeline.text).not.toContain("Memory");
    expect(pipeline.text).not.toBe(TRANSPORT_PLAYER_TEXT);
  });

  it("the half-open probe of the primary switches back on success, and the switch is journaled once each way", async () => {
    const h = harness("artemis");
    h.probeAnswers.push({ ok: false, kind: "timeout", message: "still down" });
    h.scheduler.schedule(h.job("first"));
    await jest.advanceTimersByTimeAsync(10);
    h.scheduler.gate.failed("deepseek", "timeout", "again");
    h.scheduler.schedule(h.job("second"));
    await jest.advanceTimersByTimeAsync(BREAKER_BACKOFF_MS[0]);
    expect(h.probed).toEqual(["deepseek"]);
    expect(h.scheduler.gate.open("deepseek")).toBe(true);
    h.backend.down.clear();
    await jest.advanceTimersByTimeAsync(BREAKER_BACKOFF_MS[1]);
    expect(h.probed).toEqual(["deepseek", "deepseek"]);
    expect(h.scheduler.gate.open("deepseek")).toBe(false);
    expect(h.scheduler.health()).toBeNull();
    h.scheduler.schedule(h.job("third"));
    await jest.advanceTimersByTimeAsync(10);
    expect(h.ran.at(-1)).toBe("ANSWER from deepseek");
    expect(h.notes.map(([summary]) => summary)).toEqual([
      "memory model unreachable; using Story Orchestrator Memory RunPod",
      "memory model answering again; leaving Story Orchestrator Memory RunPod",
    ]);
  });

  it("when the fallback is down too, passes are held on both and the first to answer a probe resumes them", async () => {
    const h = harness("artemis", ["deepseek", "artemis"]);
    h.probeAnswers.push({ ok: false, kind: "timeout", message: "still down" });
    h.scheduler.schedule(h.job("first"));
    await jest.advanceTimersByTimeAsync(800);
    expect(h.ran).toEqual([]);
    expect(h.scheduler.breakerOpen()).toBe(true);
    h.backend.down.clear();
    await jest.advanceTimersByTimeAsync(BREAKER_BACKOFF_MS[0] + BREAKER_BACKOFF_MS[1]);
    expect(h.ran).toHaveLength(1);
    expect(h.scheduler.breakerOpen()).toBe(false);
  });
});

describe("model fallback: none configured", () => {
  it("keeps today's hold, names the outage, and the half-open probe un-pauses on its own", async () => {
    const h = harness(null);
    h.scheduler.schedule(h.job("first"));
    await jest.advanceTimersByTimeAsync(800);
    expect(h.ran).toEqual([]);
    expect(h.backend.asked.every((id) => id === "deepseek")).toBe(true);
    expect(h.scheduler.breakerOpen()).toBe(true);
    expect(h.scheduler.health()).not.toHaveProperty("fallback");
    expect(h.settings.enabled).toBe(true);
    expect(h.notes).toHaveLength(1);
    expect(h.notes[0][0]).toBe("memory model not answering (outage); reads held until it answers");
    h.backend.down.clear();
    await jest.advanceTimersByTimeAsync(BREAKER_BACKOFF_MS[0]);
    expect(h.probed).toEqual(["deepseek"]);
    expect(h.ran).toEqual(["ANSWER from deepseek"]);
    expect(h.scheduler.breakerOpen()).toBe(false);
    expect(h.notes.map(([summary]) => summary)).toEqual(["memory model not answering (outage); reads held until it answers", "memory model answering again"]);
  });
});
