import { fakeHosts } from "../../../test/support/fakeHosts";
import { sendModel } from "../../../test/support/modelCall";
// v2.4 plan 03 D5 wiring (wave 2). The budget modules were pure and unwired; this pins that every
// pass that sends the transcript to the memory model now sends a bounded request, through the real
// shared read and the real client, with only the host seam faked.

const host = {
  chat: [] as Array<{ name: string; mes: string; is_user: boolean }>,
  calls: [] as Array<{ prompt: string; maxTokens: number; signal: AbortSignal | undefined }>,
  reply: (prompt: string): { text: string; finish: "stop" | "length" } => ({ text: prompt.includes("SCENE") || prompt.includes("PART SUMMARIES") || prompt.includes("NEW MESSAGES") ? "A summary." : "NO_DELTA", finish: "stop" }),
  hold: null as null | ((signal: AbortSignal | undefined, prompt: string) => Promise<unknown>),
};

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  sendConnectionProfileRequest: async (_profile: string, prompt: string, maxTokens: number, options: { signal?: AbortSignal }) => {
    host.calls.push({ prompt, maxTokens, signal: options.signal });
    if (host.hold) return host.hold(options.signal, prompt);
    return { ok: true, ...host.reply(prompt) };
  },
};

import { ExtractionCoordinator } from "./extractionCoordinator";
import { estimateTokens, maxTokensCap } from "@extraction/callBudget";
import { createTokenMeter } from "@extraction/tokenMeter";
import { inputBudget } from "@extraction/inputBudget";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { finding, must } from "../../../test/findings/ledger";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "wiring",
  title: "Wiring",
  description: "v2.4 plan 03 D5",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
});
const engine = new StoryEngine();
engine.loadStory(story);

const LIMIT = 3000;
const words = (index: number) => `m${index}: ${"the river runs past the old mill and the ferry waits ".repeat(8)}`;
const seedChat = (length: number) => { host.chat = Array.from({ length }, (_, index) => ({ name: index % 2 ? "Mira" : "Max", mes: words(index), is_user: index % 2 === 0 })); };
const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

function harness(options: { lastSceneEnd?: number; shortTermEnd?: number; limit?: number; countAsync?: (text: string) => Promise<number>; judgeUses?: string[] } = {}) {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  type Audit = { reason: string; window: { from: number; to: number }; prompt: string; trimmedFrom?: number; budget?: { inputBudget: number; tokens: number } };
  const scenes: Array<{ text: string; window: { from: number; to: number } }> = [];
  const shortTerms: Array<{ text: string; window: { from: number; to: number } }> = [];
  let backfill: { running: boolean; processed: number; total: number; lastError: string | null; stoppedNote?: string | null; preparing?: boolean } | null = null;
  const memory = {
    enabled: true,
    capable: false,
    get backfill() { return backfill; },
    setBackfill: (next: typeof backfill) => { backfill = next; },
    getFacts: () => [],
    getOpenArcs: () => [],
    getEntities: () => [],
    applyEntries: async () => {},
    recordVerifyDrops: () => {},
    applyArcSignals: () => [],
    applyEpistemic: () => {},
    applyLedger: () => {},
    updateInjection: () => {},
    syncWorldInfo: async () => {},
    sceneStart: (to: number) => (options.lastSceneEnd === undefined ? 0 : Math.min(options.lastSceneEnd + 1, to)),
    addSceneSummary: async (entry: { text: string }, window: { from: number; to: number }) => { scenes.push({ text: entry.text, window }); return scenes.length; },
    shortTermSummaryEnd: options.shortTermEnd ?? -1,
    shortTermEntry: () => ({ text: "Earlier, they met at the mill.", pinned: false }),
    replaceShortTerm: async (entry: { text: string }, window: { from: number; to: number }) => { shortTerms.push({ text: entry.text, window }); },
  };
  const extraction = { audits: [] as Audit[], reconciliationEvents: [], judgedReads: [] };
  const coordinator = new ExtractionCoordinator({ hosts: fakeHosts(stapi),
    getStory: () => story,
    getState: () => ({ ...engine.serialize(), lastMessageId: host.chat.length - 1 }),
    getExtraction: () => extraction,
    model: sendModel(stapi.sendConnectionProfileRequest as never, "p1"),
    requestBudget: () => ({ contextLimit: { value: options.limit ?? LIMIT, source: "preset" }, meter: createTokenMeter(options.countAsync) }),
    memory,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => {},
    fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    judge: () => (options.judgeUses ? ({ active: (use: string) => options.judgeUses!.includes(use) } as never) : null),
    persist: async () => {},
    notify: () => {},
    ownership: { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) },
  } as never);
  return {
    coordinator, get audits() { return extraction.audits; }, scenes, shortTerms, backfill: () => backfill,
    editMessage: (messageId: number) => { current = { ...current, windowRevision: current.windowRevision + 1, lowestMutatedMessageId: messageId }; },
  };
}

beforeEach(() => { host.calls = []; host.hold = null; seedChat(60); });

const readBudget = inputBudget({ value: LIMIT, source: "preset" }, maxTokensCap("sharedRead")).input;

describe("memorize backlog: token-bounded windows and a bounded full pass", () => {
  it("replaces the fixed 8-message windows with token-bounded ones that cover the chat in order", async () => {
    const h = harness();
    expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(true);
    const windows = h.audits.filter((audit) => audit.reason === "memorize:window");
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.length).not.toBe(Math.ceil(60 / 8));
    expect(windows[0].window.from).toBe(0);
    windows.slice(1).forEach((audit, index) => expect(audit.window.from).toBe(windows[index].window.to + 1));
    expect(windows[windows.length - 1].window.to).toBe(59);
    for (const audit of windows) {
      expect(estimateTokens(audit.prompt)).toBeLessThanOrEqual(readBudget);
      expect(audit.trimmedFrom).toBeUndefined();
    }
    expect(h.backfill()).toMatchObject({ running: false, processed: windows.length + 1, total: windows.length + 1, lastError: null });
  });

  it("memorize:full never exceeds the budget and records trimmedFrom", async () => {
    const h = harness();
    await h.coordinator.backlog.runMemorizeBacklog();
    const full = h.audits.find((audit) => audit.reason === "memorize:full")!;
    expect(full.trimmedFrom).toBe(0);
    expect(full.window.to).toBe(59);
    expect(full.window.from).toBeGreaterThan(0);
    expect(estimateTokens(full.prompt)).toBeLessThanOrEqual(readBudget);
    expect(full.budget!.tokens).toBeLessThanOrEqual(full.budget!.inputBudget);
    for (const call of host.calls) expect(estimateTokens(call.prompt)).toBeLessThanOrEqual(readBudget);
  });

  it("a manual run over the thresholds asks first, and a cancel sends nothing", async () => {
    const h = harness();
    const asked: Array<{ requests: number; tokens: number }> = [];
    const ok = await h.coordinator.backlog.runMemorizeBacklog(undefined, async (preflight) => { asked.push(preflight); return false; });
    expect(ok).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0].requests).toBeGreaterThan(3);
    expect(asked[0].tokens).toBeGreaterThan(0);
    expect(host.calls).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(h.backfill()).toBeNull();
    expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(true);
  });

  it("the confirm is shown before any token count call, and the exact count runs only after it, while the run reads as preparing", async () => {
    const counted: Array<{ preparing: boolean; running: boolean }> = [];
    const h = harness({ countAsync: async (text) => { counted.push({ preparing: h.backfill()?.preparing === true, running: h.backfill()?.running === true }); return estimateTokens(text); } });
    const countsAtConfirm: number[] = [];
    const preparingAtFirstRead: boolean[] = [];
    host.hold = async () => { preparingAtFirstRead.push(h.backfill()?.preparing === true); host.hold = null; return { ok: true, text: "NO_DELTA", finish: "stop" } as never; };
    expect(await h.coordinator.backlog.runMemorizeBacklog(undefined, async () => { countsAtConfirm.push(counted.length); return true; })).toBe(true);
    expect(countsAtConfirm).toEqual([0]);
    expect(preparingAtFirstRead).toEqual([false]);
    expect(counted.length).toBeGreaterThan(0);
    expect(counted.every((entry) => entry.preparing && entry.running)).toBe(true);
    expect(h.backfill()?.preparing).toBeUndefined();
  });

  it("control: a cancelled confirm counts nothing and writes nothing", async () => {
    const counts = jest.fn(async (text: string) => estimateTokens(text));
    const h = harness({ countAsync: counts });
    expect(await h.coordinator.backlog.runMemorizeBacklog(undefined, async () => false)).toBe(false);
    expect(counts).not.toHaveBeenCalled();
    expect(h.backfill()).toBeNull();
  });

  it("a confirmed run sends exactly the requests it announced", async () => {
    const h = harness();
    const asked: Array<{ requests: number; tokens: number }> = [];
    expect(await h.coordinator.backlog.runMemorizeBacklog(undefined, async (preflight) => { asked.push(preflight); return true; })).toBe(true);
    expect(host.calls).toHaveLength(asked[0].requests);
  });

  it("the confirm names the judge calls a run adds when Check memory before storing is on (v2.4 plan 07)", async () => {
    const asked: Array<{ requests: number; judgeCalls?: number }> = [];
    expect(await harness({ judgeUses: ["memoryVerify"] }).coordinator.backlog.runMemorizeBacklog(undefined, async (preflight) => { asked.push(preflight); return false; })).toBe(false);
    expect(asked[0].judgeCalls).toBe(asked[0].requests);
  });

  it("control: with memory checking off, or another judge use on, the confirm names no judge calls", async () => {
    const asked: Array<{ judgeCalls?: number }> = [];
    await harness({ judgeUses: ["stallCheck"] }).coordinator.backlog.runMemorizeBacklog(undefined, async (preflight) => { asked.push(preflight); return false; });
    await harness().coordinator.backlog.runMemorizeBacklog(undefined, async (preflight) => { asked.push(preflight); return false; });
    expect(asked.map((preflight) => preflight.judgeCalls)).toEqual([undefined, undefined]);
  });

  it("control: a run under both thresholds does not ask", async () => {
    seedChat(4);
    const h = harness({ limit: 32768 });
    const confirm = jest.fn(async () => false);
    expect(await h.coordinator.backlog.runMemorizeBacklog(undefined, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("Stop cancels the request in flight, and a player's Stop is a note, not an error", async () => {
    const h = harness();
    host.hold = (signal) => new Promise((resolve) => signal?.addEventListener("abort", () => resolve({ ok: false, kind: "lapsed", message: "cancelled" }), { once: true }));
    const pending = h.coordinator.backlog.runMemorizeBacklog();
    await settle();
    expect(host.calls).toHaveLength(1);
    expect(host.calls[0].signal?.aborted).toBe(false);
    expect(h.coordinator.backlog.cancelMemorizeBacklog()).toBe(true);
    expect(host.calls[0].signal?.aborted).toBe(true);
    expect(await pending).toBe(false);
    expect(host.calls).toHaveLength(1);
    expect(h.backfill()).toMatchObject({ running: false, lastError: null });
    expect(h.backfill()?.stoppedNote).toMatch(/^Stopped after 0 of \d+ parts/);
  });

  it("control: a real failure still lands in lastError", async () => {
    const h = harness();
    host.hold = async () => ({ ok: false, kind: "transport", message: "Response not OK" }) as never;
    expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(false);
    expect(h.backfill()).toMatchObject({ running: false, lastError: "Response not OK" });
    expect(h.backfill()?.stoppedNote ?? null).toBeNull();
  });
});

describe("scene summary spans the whole scene", () => {
  const audit = (from: number, to: number) => ({ window: { from, to }, sceneBreak: { reason: "location" }, reason: "cadence", acceptedDeltas: [] });

  it("reads from after the previous scene to the break, map -> reduce, one summary for the whole range", async () => {
    const h = harness({ lastSceneEnd: 9 });
    await h.coordinator.runSceneBreakPass(audit(52, 59) as never);
    expect(h.scenes).toEqual([{ text: "A summary.", window: { from: 10, to: 59 } }]);
    const maps = host.calls.filter((call) => call.prompt.includes("SCENE:"));
    expect(maps.length).toBeGreaterThan(1);
    expect(host.calls[host.calls.length - 1].prompt).toContain("PART SUMMARIES:");
    expect(maps[0].prompt).toContain(": m10:");
    expect(maps.some((call) => call.prompt.includes(": m9:"))).toBe(false);
    expect(maps[maps.length - 1].prompt).toContain(": m59:");
  });

  it("an edit before the detecting window but inside the scene discards the summary", async () => {
    const h = harness({ lastSceneEnd: 9 });
    host.hold = async () => { h.editMessage(20); return { ok: true, text: "A summary.", finish: "stop" } as never; };
    await h.coordinator.runSceneBreakPass(audit(52, 59) as never);
    expect(h.scenes).toEqual([]);
    expect(host.calls).toHaveLength(1);
  });

  it("control: an edit before the scene keeps the summary", async () => {
    const h = harness({ lastSceneEnd: 50 });
    host.hold = async () => { h.editMessage(60); return { ok: true, text: "A summary.", finish: "stop" } as never; };
    await h.coordinator.runSceneBreakPass(audit(52, 59) as never);
    expect(h.scenes.map((scene) => scene.window)).toEqual([{ from: 51, to: 59 }]);
  });
});

describe("short-term compaction is tail-fit", () => {
  it("sends the previous summary and the newest messages that fit, and records the span it summarised", async () => {
    const h = harness();
    await h.coordinator.runShortTermCompaction();
    expect(host.calls).toHaveLength(1);
    const prompt = host.calls[0].prompt;
    expect(prompt).toContain("Earlier, they met at the mill.");
    expect(prompt).toContain(": m59:");
    expect(prompt).not.toContain(": m0:");
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(inputBudget({ value: LIMIT, source: "preset" }, 1024).input);
    expect(h.shortTerms).toHaveLength(1);
    expect(h.shortTerms[0].window.to).toBe(59);
    expect(h.shortTerms[0].window.from).toBeGreaterThan(0);
    expect(prompt).toContain(`: m${h.shortTerms[0].window.from}:`);
    expect(prompt).not.toContain(`: m${h.shortTerms[0].window.from - 1}:`);
  });
});

describe("A11: the memorize backlog survives a slow backend and gives up honestly", () => {
  const timedOut = { ok: false, kind: "timeout", message: "signal timed out" };
  const answered = (prompt: string) => ({ ok: true, ...host.reply(prompt) });
  const GAVE_UP = /^the memory model did not answer within (\d+) ms, nor within (\d+) ms on one retry$/;

  async function healthyCalls(): Promise<number> {
    expect(await harness().coordinator.backlog.runMemorizeBacklog()).toBe(true);
    const count = host.calls.length;
    host.calls = [];
    return count;
  }

  let timeout: jest.SpyInstance;
  beforeEach(() => { timeout = jest.spyOn(AbortSignal, "timeout"); });
  afterEach(() => timeout.mockRestore());
  const budgets = () => timeout.mock.calls.map(([ms]) => ms as number);

  finding("ACC-A11", async () => {
    const total = await healthyCalls();
    const h = harness();
    let sent = 0;
    host.hold = async (_signal, prompt) => { sent += 1; return sent === total ? timedOut : answered(prompt); };
    const completed = await h.coordinator.backlog.runMemorizeBacklog();
    must(completed && host.calls.length === total + 1, `the whole-chat pass that timed out once was not asked again: completed ${completed}, ${host.calls.length} asks for ${total} parts, backfill ${JSON.stringify(h.backfill())}`);
  });

  it("a whole-chat pass that times out is asked again with twice the budget, and the backlog completes (P03 run 4)", async () => {
    const total = await healthyCalls();
    timeout.mockClear();
    const h = harness();
    let sent = 0;
    host.hold = async (_signal, prompt) => { sent += 1; return sent === total ? timedOut : answered(prompt); };
    expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(true);
    expect(host.calls).toHaveLength(total + 1);
    expect(host.calls[total].prompt).toBe(host.calls[total - 1].prompt);
    expect(budgets()[total]).toBe(budgets()[total - 1] * 2);
    expect(h.audits.filter((audit) => audit.reason === "memorize:full")).toHaveLength(1);
    expect(h.backfill()).toMatchObject({ running: false, processed: total, total, lastError: null });
  });

  it("a window that times out is retried the same way, and the run carries on", async () => {
    const total = await healthyCalls();
    timeout.mockClear();
    const h = harness();
    let sent = 0;
    host.hold = async (_signal, prompt) => { sent += 1; return sent === 1 ? timedOut : answered(prompt); };
    expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(true);
    expect(host.calls).toHaveLength(total + 1);
    expect(budgets()[1]).toBe(budgets()[0] * 2);
    expect(h.backfill()).toMatchObject({ running: false, processed: total, total, lastError: null });
  });

  it("a whole-chat pass that times out twice gives up after exactly two asks and names both budgets", async () => {
    const total = await healthyCalls();
    timeout.mockClear();
    const h = harness();
    let sent = 0;
    host.hold = async (_signal, prompt) => { sent += 1; return sent >= total ? timedOut : answered(prompt); };
    expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(false);
    expect(host.calls).toHaveLength(total + 1);
    const failure = GAVE_UP.exec(h.backfill()?.lastError ?? "");
    expect(failure).not.toBeNull();
    expect(Number(failure![1])).toBe(budgets()[total - 1]);
    expect(Number(failure![2])).toBe(budgets()[total - 1] * 2);
    expect(h.backfill()).toMatchObject({ running: false, processed: total - 1, total });
    expect(h.audits.some((audit) => audit.reason === "memorize:full")).toBe(false);
  });

  describe("the A11 targeted arm: a debug scale aimed at memorize:full", () => {
    afterEach(() => {
      delete globalThis.storyOrchestratorDebugCallBudgetScale;
      delete globalThis.storyOrchestratorDebugCallBudgetTarget;
    });

    it("scales only the whole-chat pass: every window keeps its unscaled budget, and the full pass's retry is twice its scaled first ask", async () => {
      const total = await healthyCalls();
      const unscaled = budgets();
      timeout.mockClear();
      globalThis.storyOrchestratorDebugCallBudgetScale = 0.25;
      globalThis.storyOrchestratorDebugCallBudgetTarget = "memorize:full";
      const h = harness();
      let sent = 0;
      host.hold = async (_signal, prompt) => { sent += 1; return sent === total ? timedOut : answered(prompt); };
      expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(true);
      const scaled = budgets();
      expect(scaled.slice(0, total - 1)).toEqual(unscaled.slice(0, total - 1));
      expect(scaled[total - 1]).toBe(Math.round(unscaled[total - 1] * 0.25));
      expect(scaled[total]).toBe(scaled[total - 1] * 2);
    });

    it("control: without a target the same scale reaches every window too", async () => {
      await healthyCalls();
      const unscaled = budgets();
      timeout.mockClear();
      globalThis.storyOrchestratorDebugCallBudgetScale = 0.25;
      expect(await harness().coordinator.backlog.runMemorizeBacklog()).toBe(true);
      expect(budgets()).toEqual(unscaled.map((ms) => Math.round(ms * 0.25)));
    });
  });

  it("control: a refusing backend is asked once and gives up at once", async () => {
    const h = harness();
    host.hold = async () => ({ ok: false, kind: "transport", message: "Response not OK" });
    expect(await h.coordinator.backlog.runMemorizeBacklog()).toBe(false);
    expect(host.calls).toHaveLength(1);
    expect(h.backfill()).toMatchObject({ running: false, processed: 0, lastError: "Response not OK" });
  });

  it("control: Stop while the first ask waits is not retried", async () => {
    const h = harness();
    host.hold = (signal) => new Promise((resolve) => signal?.addEventListener("abort", () => resolve({ ok: false, kind: "lapsed", message: "cancelled" }), { once: true }));
    const pending = h.coordinator.backlog.runMemorizeBacklog();
    await settle();
    h.coordinator.backlog.cancelMemorizeBacklog();
    expect(await pending).toBe(false);
    expect(host.calls).toHaveLength(1);
    expect(h.backfill()).toMatchObject({ running: false, lastError: null });
  });
});
