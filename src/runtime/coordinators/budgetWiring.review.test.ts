// v2.4 plan 03 D5 wiring (wave 2). The budget modules were pure and unwired; this pins that every
// pass that sends the transcript to the memory model now sends a bounded request, through the real
// shared read and the real client, with only the host seam faked.

const host = {
  chat: [] as Array<{ name: string; mes: string; is_user: boolean }>,
  calls: [] as Array<{ prompt: string; maxTokens: number; signal: AbortSignal | undefined }>,
  reply: (prompt: string): { text: string; finish: "stop" | "length" } => ({ text: prompt.includes("SCENE") || prompt.includes("PART SUMMARIES") || prompt.includes("NEW MESSAGES") ? "A summary." : "NO_DELTA", finish: "stop" }),
  hold: null as null | ((signal: AbortSignal | undefined) => Promise<{ ok: false; kind: "lapsed"; message: string }>),
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  sendConnectionProfileRequest: async (_profile: string, prompt: string, maxTokens: number, options: { signal?: AbortSignal }) => {
    host.calls.push({ prompt, maxTokens, signal: options.signal });
    if (host.hold) return host.hold(options.signal);
    return { ok: true, ...host.reply(prompt) };
  },
}));

import { ExtractionCoordinator } from "./extractionCoordinator";
import { estimateTokens } from "@extraction/callBudget";
import { createTokenMeter } from "@extraction/tokenMeter";
import { inputBudget } from "@extraction/inputBudget";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";

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

function harness(options: { lastSceneEnd?: number; shortTermEnd?: number; limit?: number } = {}) {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  type Audit = { reason: string; window: { from: number; to: number }; prompt: string; trimmedFrom?: number; budget?: { inputBudget: number; tokens: number } };
  const scenes: Array<{ text: string; window: { from: number; to: number } }> = [];
  const shortTerms: Array<{ text: string; window: { from: number; to: number } }> = [];
  let backfill: { running: boolean; processed: number; total: number; lastError: string | null; stoppedNote?: string | null } | null = null;
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
  const coordinator = new ExtractionCoordinator({
    getStory: () => story,
    getState: () => ({ ...engine.serialize(), lastMessageId: host.chat.length - 1 }),
    getExtraction: () => extraction,
    getSettings: () => ({ profileId: "p1", enabled: true, cadence: 1 }),
    requestBudget: () => ({ contextLimit: { value: options.limit ?? LIMIT, source: "preset" }, meter: createTokenMeter() }),
    memory,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => {},
    fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    judge: () => null,
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

const readBudget = inputBudget({ value: LIMIT, source: "preset" }, 512).input;

describe("memorize backlog: token-bounded windows and a bounded full pass", () => {
  it("replaces the fixed 8-message windows with token-bounded ones that cover the chat in order", async () => {
    const h = harness();
    expect(await h.coordinator.runMemorizeBacklog()).toBe(true);
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
    await h.coordinator.runMemorizeBacklog();
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
    const ok = await h.coordinator.runMemorizeBacklog(undefined, async (preflight) => { asked.push(preflight); return false; });
    expect(ok).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0].requests).toBeGreaterThan(3);
    expect(asked[0].tokens).toBeGreaterThan(0);
    expect(host.calls).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(h.backfill()).toBeNull();
    expect(await h.coordinator.runMemorizeBacklog()).toBe(true);
  });

  it("a confirmed run sends exactly the requests it announced", async () => {
    const h = harness();
    const asked: Array<{ requests: number; tokens: number }> = [];
    expect(await h.coordinator.runMemorizeBacklog(undefined, async (preflight) => { asked.push(preflight); return true; })).toBe(true);
    expect(host.calls).toHaveLength(asked[0].requests);
  });

  it("control: a run under both thresholds does not ask", async () => {
    seedChat(4);
    const h = harness({ limit: 32768 });
    const confirm = jest.fn(async () => false);
    expect(await h.coordinator.runMemorizeBacklog(undefined, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("Stop cancels the request in flight, and a player's Stop is a note, not an error", async () => {
    const h = harness();
    host.hold = (signal) => new Promise((resolve) => signal?.addEventListener("abort", () => resolve({ ok: false, kind: "lapsed", message: "cancelled" }), { once: true }));
    const pending = h.coordinator.runMemorizeBacklog();
    await settle();
    expect(host.calls).toHaveLength(1);
    expect(host.calls[0].signal?.aborted).toBe(false);
    expect(h.coordinator.cancelMemorizeBacklog()).toBe(true);
    expect(host.calls[0].signal?.aborted).toBe(true);
    expect(await pending).toBe(false);
    expect(host.calls).toHaveLength(1);
    expect(h.backfill()).toMatchObject({ running: false, lastError: null });
    expect(h.backfill()?.stoppedNote).toMatch(/^Stopped after 0 of \d+ parts/);
  });

  it("control: a real failure still lands in lastError", async () => {
    const h = harness();
    host.hold = async () => ({ ok: false, kind: "transport", message: "Response not OK" }) as never;
    expect(await h.coordinator.runMemorizeBacklog()).toBe(false);
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
