import { foldIncludeBody, readReasoning, reasoningPayload, type ReasoningRoute } from "./reasoningPayload";

const chat = (source: string, extra: Partial<ReasoningRoute> = {}): ReasoningRoute => ({ api: "chat", source, model: "m", includeBody: null, ...extra });

describe("reasoningPayload: one effort per route kind (v2.6 plan 05 R1, host facts R0)", () => {
  it("default sends nothing and claims nothing, whatever the route", () => {
    for (const route of [chat("openrouter"), chat("custom"), { api: "text" as const, source: null, model: null, includeBody: null }, null]) {
      expect(reasoningPayload(route, "default")).toEqual({ payload: {}, applied: false, thinks: false, collapsed: false, unsupported: null });
    }
  });

  it("OpenRouter: levels ride reasoning_effort with the reasoning included; off is `none` (chat-completions.js:2348)", () => {
    expect(reasoningPayload(chat("openrouter"), "medium")).toEqual({ payload: { reasoning_effort: "medium", include_reasoning: true }, applied: true, thinks: true, collapsed: false, unsupported: null });
    expect(reasoningPayload(chat("openrouter"), "off")).toMatchObject({ payload: { reasoning_effort: "none", include_reasoning: false }, applied: true, thinks: false });
  });

  it("custom (llama-server) switches the chat template, MERGING the author's own body instead of replacing it (F4)", () => {
    const route = chat("custom", { includeBody: { top_k: 20, chat_template_kwargs: { reasoning_budget: 128 } } });
    const off = reasoningPayload(route, "off");
    expect(JSON.parse(off.payload.custom_include_body as string)).toEqual({ top_k: 20, chat_template_kwargs: { reasoning_budget: 128, enable_thinking: false } });
    expect(off).toMatchObject({ applied: true, thinks: false, collapsed: false });
    const high = reasoningPayload(route, "high");
    expect(JSON.parse(high.payload.custom_include_body as string).chat_template_kwargs.enable_thinking).toBe(true);
    expect(high).toMatchObject({ applied: true, thinks: true, collapsed: true });
  });

  it("control: a koboldcpp model on the custom source takes the effort key the server forwards for it (chat-completions.js:2604)", () => {
    expect(reasoningPayload(chat("custom", { model: "koboldcpp/x" }), "low").payload).toEqual({ reasoning_effort: "low", include_reasoning: true });
    expect(reasoningPayload(chat("custom", { model: "koboldcpp/x" }), "off")).toMatchObject({ payload: { reasoning_effort: "minimal" }, thinks: false });
  });

  it("a source that forwards levels only refuses off rather than pretending", () => {
    expect(reasoningPayload(chat("claude"), "high")).toMatchObject({ payload: { reasoning_effort: "high" }, applied: true });
    expect(reasoningPayload(chat("claude"), "off")).toMatchObject({ payload: {}, applied: false, unsupported: expect.stringContaining("cannot switch reasoning off") });
    expect(reasoningPayload(chat("makersuite"), "off")).toMatchObject({ payload: { reasoning_effort: "min" }, applied: true, thinks: false });
    expect(reasoningPayload(chat("deepseek"), "medium").payload).toEqual({ reasoning_effort: "high", include_reasoning: true });
  });

  it("Text Completion and unknown sources are unsupported and send nothing", () => {
    for (const effort of ["off", "low", "medium", "high"] as const) {
      expect(reasoningPayload({ api: "text", source: null, model: null, includeBody: null }, effort)).toMatchObject({ payload: {}, applied: false, unsupported: expect.stringContaining("Text Completion") });
      expect(reasoningPayload(chat("cohere"), effort)).toMatchObject({ payload: {}, applied: false, unsupported: expect.stringContaining("cohere") });
    }
    expect(reasoningPayload(null, "low")).toMatchObject({ applied: false, unsupported: expect.any(String) });
  });
});

describe("foldIncludeBody mirrors mergeObjectWithYaml (src/util.js:844)", () => {
  it("a mapping is kept, a sequence folds its objects in order, anything else is nothing", () => {
    expect(foldIncludeBody({ a: 1 })).toEqual({ a: 1 });
    expect(foldIncludeBody([{ a: 1 }, "x", { a: 2, b: 3 }])).toEqual({ a: 2, b: 3 });
    expect(foldIncludeBody("scalar")).toBeNull();
    expect(foldIncludeBody(undefined)).toBeNull();
  });
});

describe("readReasoning: what the reply spent thinking (F7)", () => {
  it("reads every out-of-band shape and the usage count", () => {
    expect(readReasoning({ choices: [{ message: { content: "", reasoning_content: "abcd" } }], usage: { completion_tokens_details: { reasoning_tokens: 3 } } })).toEqual({ chars: 4, tokens: 3 });
    expect(readReasoning({ choices: [{ message: { content: "x", reasoning: "ab" } }] })).toEqual({ chars: 2, tokens: null });
    expect(readReasoning({ content: [{ type: "thinking", thinking: "abc" }, { type: "text", text: "x" }] })).toEqual({ chars: 3, tokens: null });
    expect(readReasoning({ candidates: [{ content: { parts: [{ thought: true, text: "ab" }, { text: "x" }] } }], usageMetadata: { thoughtsTokenCount: 7 } })).toEqual({ chars: 2, tokens: 7 });
  });

  it("control: a reply with no reasoning reads zero", () => {
    expect(readReasoning({ choices: [{ text: "NO_DELTA" }] })).toEqual({ chars: 0, tokens: null });
    expect(readReasoning("plain")).toEqual({ chars: 0, tokens: null });
  });
});
