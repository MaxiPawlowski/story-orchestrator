import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { callExtractionReply } from "@extraction/client";
import { viaReply } from "../../test/support/modelCall";
import { estimateTokens } from "@extraction/callBudget";
import { runSharedRead } from "@extraction/sharedRead";
import { createTokenMeter, type RequestBudget } from "@extraction/tokenMeter";
import { defaultContextLimit } from "@extraction/inputBudget";
import { ExtractionScheduler, type SchedulerHost } from "@extraction/scheduler";
import type { SharedReadAudit, SharedReadWindow } from "@extraction/types";

const mockChat: Array<{ name: string; mes: string; is_user: boolean }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: mockChat, extensionSettings: {} }) }));
jest.mock("@extraction/client", () => ({ ...jest.requireActual("@extraction/client"), callExtractionReply: jest.fn() }));

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "budget",
  title: "Budget",
  description: "v2.4 plan 03 D5",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
});

const message = (index: number, text = `Message ${index} walks the long road along the river, `.repeat(4)) =>
  ({ index, messageId: index, speaker: index % 2 ? "Mira" : "User", text }) as SharedReadWindow["messages"][number];

const chat = (length: number) => ({ from: 0, to: length - 1, messages: Array.from({ length }, (_, index) => message(index)) });

const budget = (value: number): RequestBudget => ({ contextLimit: { value, source: "preset" }, meter: createTokenMeter() });

async function read(window: ReturnType<typeof chat>, requestBudget: RequestBudget | undefined, reply = "NO_DELTA", reason = "memorize:full") {
  const mock = callExtractionReply as jest.Mock;
  mock.mockReset();
  mock.mockResolvedValue({ text: reply, finish: "stop" });
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  const result = await runSharedRead({
    story: s,
    state: engine.serialize(),
    priority: 0,
    reason,
    scope: [{ quality: s.qualityByKey.crossed, key: "crossed", hints: [] }] as never,
    window,
    model: viaReply(callExtractionReply),
    ask: { role: "read", pass: "read", ...(requestBudget ? { budget: requestBudget } : {}) },
  });
  const sent = mock.mock.calls.map((call) => call[0] as string);
  return { result, sent };
}

describe("v2.4 plan 03 D5: a DELTA read is tail-fit, never split", () => {
  it("memorize:full never exceeds the budget and records trimmedFrom", async () => {
    const { result, sent } = await read(chat(300), budget(4096));
    const { audit } = result;
    expect(sent).toHaveLength(1);
    expect(audit.budget).toBeDefined();
    expect(audit.budget!.contextLimit).toEqual({ value: 4096, source: "preset" });
    expect(estimateTokens(sent[0])).toBeLessThanOrEqual(audit.budget!.inputBudget);
    expect(audit.budget!.tokens).toBeLessThanOrEqual(audit.budget!.inputBudget);
    expect(audit.trimmedFrom).toBe(0);
    expect(audit.window.to).toBe(299);
    expect(audit.window.from).toBeGreaterThan(0);
    expect(sent[0]).toContain(`[${audit.window.from}] `);
    expect(sent[0]).not.toContain(`[${audit.window.from - 1}] `);
    expect(sent[0]).toContain("[299] ");
  });

  it("control: a window under budget is sent whole and records no trimmedFrom", async () => {
    const { result, sent } = await read(chat(6), budget(8192));
    expect(result.audit.trimmedFrom).toBeUndefined();
    expect(result.audit.window).toEqual({ from: 0, to: 5 });
    expect(sent[0]).toContain("[0] ");
    expect(result.audit.budget!.inputBudget).toBe(8192 - 2048 - 820);
  });

  it("control: with no budget wired the read is unchanged and records none", async () => {
    const { result } = await read(chat(300), undefined);
    expect(result.audit.budget).toBeUndefined();
    expect(result.audit.window).toEqual({ from: 0, to: 299 });
  });

  it("a delta quoting a trimmed message is refused as evidence not in window", async () => {
    const window = chat(300);
    window.messages[0] = message(0, "The old ferryman crossed alone in the storm.");
    const { result } = await read(window, budget(4096), 'DELTA crossed value=true evidence="The old ferryman crossed alone"');
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.rejected.map((entry) => entry.reason)).toContain("evidence not in window");
  });

  it("counts with the host's numbers when it has them, so a heavier count keeps fewer messages", async () => {
    const light = await read(chat(300), budget(8192));
    const heavy: RequestBudget = { contextLimit: { value: 8192, source: "preset" }, meter: createTokenMeter(async (text) => estimateTokens(text) * 2) };
    const weighed = await read(chat(300), heavy);
    expect(weighed.result.audit.window.from).toBeGreaterThan(light.result.audit.window.from);
    expect(weighed.result.audit.budget!.tokens).toBeLessThanOrEqual(weighed.result.audit.budget!.inputBudget);
  });

  it("an unreadable limit reads with the declared default and says so in the audit", async () => {
    const { result } = await read(chat(300), { contextLimit: defaultContextLimit("the profile names no settings preset"), meter: createTokenMeter() });
    expect(result.audit.budget!.contextLimit).toEqual({ value: 8192, source: "default", reason: "the profile names no settings preset" });
    expect(result.audit.budget!.tokens).toBeLessThanOrEqual(result.audit.budget!.inputBudget);
  });
});

describe("v2.4 plan 03 D5: the token meter", () => {
  it("counts each primed text once with the host and estimates what it was never shown", async () => {
    const seen: string[] = [];
    const meter = createTokenMeter(async (text) => { seen.push(text); return 99; });
    await meter.prime(["a", "b", "a"]);
    await meter.prime(["a"]);
    expect(seen).toEqual(["a", "b"]);
    expect(meter.count("a")).toBe(99);
    expect(meter.count("never primed")).toBe(estimateTokens("never primed"));
  });

  it("keeps the estimate for a text the host could not count", async () => {
    const meter = createTokenMeter(async (text) => { if (text === "bad") throw new Error("tokenizer down"); return Number.NaN; });
    await meter.prime(["bad", "nan"]);
    expect(meter.count("bad")).toBe(estimateTokens("bad"));
    expect(meter.count("nan")).toBe(estimateTokens("nan"));
  });
});

describe("v2.4 plan 03 D5: the scheduler's reads carry the budget from their settings", () => {
  it("a P0 read over budget is tail-fit and says so in the audit", async () => {
    mockChat.length = 0;
    chat(300).messages.forEach((entry) => mockChat.push({ name: entry.speaker, mes: entry.text, is_user: entry.speaker === "User" }));
    const mock = callExtractionReply as jest.Mock;
    mock.mockReset();
    mock.mockResolvedValue({ text: "NO_DELTA", finish: "stop" });
    const s = story();
    const engine = new StoryEngine();
    engine.loadStory(s);
    const applied: SharedReadAudit[] = [];
    const host = {
      getStory: () => s,
      getEngineState: () => ({ ...engine.serialize(), lastMessageId: 299 }),
      getExtractionSettings: () => ({ enabled: true, profileId: "p1", cadence: 1, stabilityLag: 0, budget: budget(4096) }),
      model: viaReply(callExtractionReply),
      getFacts: () => [],
      getFiredTransitions: () => [],
      getExpansionGateSources: () => [],
      getOpenArcs: () => [],
      applyExtractionAudit: async (audit: SharedReadAudit) => { applied.push(audit); },
      onSchedulerChange: () => undefined,
    } as unknown as SchedulerHost;
    new ExtractionScheduler(host).schedule({ priority: 0, reason: "rollback:0", window: { from: 0, to: 299, messages: [] } });
    for (let tick = 0; tick < 50 && !applied.length; tick += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(applied).toHaveLength(1);
    expect(applied[0].trimmedFrom).toBe(0);
    expect(applied[0].window.to).toBe(299);
    expect(estimateTokens(mock.mock.calls[0][0] as string)).toBeLessThanOrEqual(applied[0].budget!.inputBudget);
    mockChat.length = 0;
  });
});
