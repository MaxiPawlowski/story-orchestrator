import { estimateTokens } from "@extraction/callBudget";
import { createTokenMeter, type RequestBudget } from "@extraction/tokenMeter";
import { inputBudget } from "@extraction/inputBudget";
import { MAX_TOKENS_TABLE } from "@extraction/callBudget";
import type { DerivedRecord } from "./derived";
import { fitShortTerm, sceneRangeFrom, summarizeScene } from "./sceneSummary";

const budget = (value: number): RequestBudget => ({ contextLimit: { value, source: "preset" }, meter: createTokenMeter() });
const scene = (length: number, size = 400) => Array.from({ length }, (_, index) => ({ messageId: index + 10, speaker: index % 2 ? "Mira" : "Max", text: `m${index + 10} ${"x".repeat(size)}` }));
const capInput = (value: number) => inputBudget({ value, source: "preset" }, (MAX_TOKENS_TABLE.sceneSummary as { cap: number }).cap).input;

function model(replies: (prompt: string, call: number) => string) {
  const prompts: string[] = [];
  const maxTokens: number[] = [];
  return {
    prompts,
    maxTokens,
    summarize: async (prompt: string, tokens: number) => { prompts.push(prompt); maxTokens.push(tokens); return replies(prompt, prompts.length); },
  };
}

describe("v2.4 plan 03 D5: the whole scene is summarized map -> reduce", () => {
  it("summarizes each chunk under budget, then reduces the chunk summaries into one", async () => {
    const messages = scene(40);
    const m = model((prompt, call) => (prompt.includes("PART SUMMARIES:") ? "The whole scene." : `part ${call}`));
    const outcome = await summarizeScene({ messages, budget: budget(3000), stillOwns: () => true, summarize: m.summarize });
    expect(outcome).not.toBeNull();
    expect(outcome!.summary).toBe("The whole scene.");
    expect(outcome!.chunks).toBeGreaterThan(1);
    expect(outcome!.requests).toBe(outcome!.chunks + 1);
    for (const prompt of m.prompts) expect(estimateTokens(prompt)).toBeLessThanOrEqual(capInput(3000));
    const maps = m.prompts.slice(0, -1);
    const order = messages.map((message) => maps.findIndex((prompt) => prompt.includes(`m${message.messageId} `)));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(messages.every((message) => maps.filter((prompt) => prompt.includes(`m${message.messageId} `)).length === 1)).toBe(true);
    const reduce = m.prompts[m.prompts.length - 1];
    expect(reduce).toContain("PART SUMMARIES:");
    maps.forEach((_, index) => expect(reduce).toContain(`Part ${index + 1}: part ${index + 1}`));
    expect(m.maxTokens.every((tokens) => tokens >= 256 && tokens <= 1024)).toBe(true);
  });

  it("control: a scene that fits is one call and never reduced", async () => {
    const m = model(() => "Short scene.");
    const outcome = await summarizeScene({ messages: scene(3, 40), budget: budget(8192), stillOwns: () => true, summarize: m.summarize });
    expect(outcome).toEqual({ summary: "Short scene.", requests: 1, chunks: 1 });
    expect(m.prompts[0]).toContain("SCENE:");
    expect(m.prompts[0]).not.toContain("PART SUMMARIES:");
  });

  it("checks ownership inside the map loop: a lapse after the first chunk sends nothing more", async () => {
    let owned = true;
    const m = model(() => { owned = false; return "part"; });
    const outcome = await summarizeScene({ messages: scene(40), budget: budget(3000), stillOwns: () => owned, summarize: m.summarize });
    expect(outcome).toBeNull();
    expect(m.prompts).toHaveLength(1);
  });

  it("a refused chunk summary stores no summary rather than a partial one", async () => {
    const m = model((_, call) => (call === 2 ? "" : "part"));
    const outcome = await summarizeScene({ messages: scene(40), budget: budget(3000), stillOwns: () => true, summarize: m.summarize });
    expect(outcome?.summary).toBe("");
    expect(m.prompts).toHaveLength(2);
  });

  it("reduces again when the part summaries themselves do not fit", async () => {
    const m = model((prompt) => (prompt.includes("PART SUMMARIES:") ? `merged ${"y".repeat(900)}` : `part ${"z".repeat(900)}`));
    const outcome = await summarizeScene({ messages: scene(120), budget: budget(3000), stillOwns: () => true, summarize: m.summarize });
    expect(outcome!.summary.startsWith("merged")).toBe(true);
    expect(m.prompts.filter((prompt) => prompt.includes("PART SUMMARIES:")).length).toBeGreaterThan(1);
    for (const prompt of m.prompts) expect(estimateTokens(prompt)).toBeLessThanOrEqual(capInput(3000));
  });
});

describe("v2.4 plan 03 D5: where a scene starts", () => {
  const record = (to: number, kind: DerivedRecord["kind"] = "scene_summary"): DerivedRecord => ({ id: `r${to}`, kind, boundary: 1, messageId: to, inputs: [], range: { from: 0, to } });

  it("starts after the previous scene summary's range", () => {
    expect(sceneRangeFrom([record(12), record(30), record(50, "short_term")], 44)).toBe(31);
  });

  it("starts at 0 when no scene was summarized yet", () => {
    expect(sceneRangeFrom([record(50, "short_term")], 44)).toBe(0);
  });

  it("never starts after the message that ended the scene", () => {
    expect(sceneRangeFrom([record(60)], 44)).toBe(44);
  });

  it("starts at the story's start when no scene was summarized yet", () => {
    expect(sceneRangeFrom([record(50, "short_term")], 320, 298)).toBe(298);
  });

  it("takes the later of the previous summary's end and the story's start", () => {
    expect(sceneRangeFrom([record(310)], 330, 298)).toBe(311);
    expect(sceneRangeFrom([record(100)], 330, 298)).toBe(298);
  });

  it("never starts after the message that ended the scene, even with a later story start", () => {
    expect(sceneRangeFrom([], 44, 60)).toBe(44);
  });
});

describe("v2.4 plan 03 D5: short-term compaction is tail-fit", () => {
  it("keeps the previous summary and the newest messages that fit", async () => {
    const messages = scene(200);
    const fit = await fitShortTerm(messages, "Earlier they met.", budget(4096));
    expect(fit.to).toBe(messages[messages.length - 1].messageId);
    expect(fit.trimmedFrom).toBe(messages[0].messageId);
    expect(fit.from).toBeGreaterThan(messages[0].messageId);
    expect(fit.text.endsWith(`Mira: m209 ${"x".repeat(400)}`)).toBe(true);
    expect(fit.text).not.toContain(`m${fit.from - 1} `);
    expect(fit.tokens).toBeLessThanOrEqual(inputBudget({ value: 4096, source: "preset" }, 1024).input);
  });

  it("control: a window that fits is kept whole", async () => {
    const fit = await fitShortTerm(scene(4, 20), null, budget(8192));
    expect(fit.trimmedFrom).toBeNull();
    expect(fit.from).toBe(10);
    expect(fit.text.split("\n")).toHaveLength(4);
  });
});
