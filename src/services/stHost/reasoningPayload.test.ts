import { foldIncludeBody, readReasoning, reasoningPayload, type ReasoningRoute } from "./reasoningPayload";

const chat = (source: string, extra: Partial<ReasoningRoute> = {}): ReasoningRoute => ({ api: "chat", source, model: "m", includeBody: null, ...extra });

describe("reasoningPayload: one effort per route kind (v2.6 plan 05 R1, host facts R0)", () => {
  it("default sends nothing and claims nothing, whatever the route", () => {
    for (const route of [chat("openrouter"), chat("custom"), { api: "text" as const, source: null, model: null, includeBody: null }, null]) {
      expect(reasoningPayload(route, "default")).toMatchObject({ payload: {}, applied: false, thinks: false, collapsed: false, unsupported: null, sent: null });
    }
  });

  it("OpenRouter: levels ride reasoning_effort with the reasoning included; off is `none` (chat-completions.js:2348)", () => {
    expect(reasoningPayload(chat("openrouter"), "medium")).toMatchObject({ payload: { reasoning_effort: "medium", include_reasoning: true }, applied: true, thinks: true, collapsed: false, unsupported: null });
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

  it("a source that forwards levels only refuses off rather than pretending", () => {
    expect(reasoningPayload(chat("claude", { model: "claude-sonnet-4-5" }), "high")).toMatchObject({ payload: { reasoning_effort: "high" }, applied: true });
    expect(reasoningPayload(chat("claude", { model: "claude-sonnet-4-5" }), "off")).toMatchObject({ payload: {}, applied: false, unsupported: "claude cannot switch it off" });
    expect(reasoningPayload(chat("makersuite", { model: "gemini-2.5-flash" }), "off")).toMatchObject({ payload: { reasoning_effort: "min" }, applied: true, thinks: false });
    expect(reasoningPayload(chat("deepseek"), "medium")).toMatchObject({ payload: {}, applied: false, unsupported: "deepseek is not mapped" });
  });

  it("Text Completion and unknown sources are unsupported and send nothing", () => {
    for (const effort of ["off", "low", "medium", "high"] as const) {
      expect(reasoningPayload({ api: "text", source: null, model: null, includeBody: null }, effort)).toMatchObject({ payload: {}, applied: false, unsupported: expect.stringContaining("Text Completion") });
      expect(reasoningPayload(chat("cohere"), effort)).toMatchObject({ payload: {}, applied: false, unsupported: "cohere is not mapped" });
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
  it("reads the OpenAI-shaped out-of-band fields (custom/llama, DeepSeek: reasoning_content; OpenRouter: reasoning) and the usage count", () => {
    expect(readReasoning({ choices: [{ message: { content: "", reasoning_content: "abcd" } }], usage: { completion_tokens_details: { reasoning_tokens: 3 } } })).toEqual({ chars: 4, tokens: 3 });
    expect(readReasoning({ choices: [{ message: { content: "x", reasoning: "ab" } }] })).toEqual({ chars: 2, tokens: null });
  });

  it("control: a reply with no reasoning reads zero", () => {
    expect(readReasoning({ choices: [{ text: "NO_DELTA" }] })).toEqual({ chars: 0, tokens: null });
    expect(readReasoning("plain")).toEqual({ chars: 0, tokens: null });
  });
});

describe("AS-5: requested, supported and sent effort are told apart, from ST's own routing (chat-completions.js)", () => {
  it("OpenAI and Azure strip reasoning_effort for a model off ST's list (:1731, :2600): not applied, nothing claimed", () => {
    for (const source of ["openai", "azure_openai"]) {
      expect(reasoningPayload(chat(source, { model: "gpt-4o" }), "high")).toMatchObject({ payload: {}, applied: false, supported: false, requested: "high", sent: null, unsupported: expect.stringContaining("gpt-4o") });
      expect(reasoningPayload(chat(source, { model: "o3" }), "high")).toMatchObject({ payload: { reasoning_effort: "high" }, applied: true, supported: true, sent: "high" });
    }
  });

  it("a fixed-effort model and a remapping source report the effort ST really sends", () => {
    expect(reasoningPayload(chat("openai", { model: "gpt-5.3-chat-latest" }), "high")).toMatchObject({ applied: true, requested: "high", sent: "medium" });
    expect(reasoningPayload(chat("xai", { model: "grok-4" }), "medium")).toMatchObject({ applied: true, requested: "medium", sent: "low" });
    expect(reasoningPayload(chat("openrouter"), "medium")).toMatchObject({ requested: "medium", sent: "medium", supported: true });
  });

  it("Claude thinks only on its thinking models (:255); Gemini only on its thinking-config models (:526)", () => {
    expect(reasoningPayload(chat("claude", { model: "claude-3-5-sonnet-20241022" }), "high")).toMatchObject({ applied: false, supported: false, sent: null });
    expect(reasoningPayload(chat("claude", { model: "claude-sonnet-4-5" }), "high")).toMatchObject({ applied: true, supported: true, sent: "high" });
    expect(reasoningPayload(chat("makersuite", { model: "gemini-2.0-flash" }), "low")).toMatchObject({ applied: false, supported: false });
    expect(reasoningPayload(chat("makersuite", { model: "gemini-2.5-flash" }), "low")).toMatchObject({ applied: true, sent: "low" });
  });

  it("readReasoning reads ST's normalized Claude reply: the thinking blocks ride `content` (:438)", () => {
    const claude = { choices: [{ message: { content: "Hello" } }], content: [{ type: "thinking", thinking: "abcdef", signature: "s" }, { type: "redacted_thinking", data: "zz" }, { type: "text", text: "Hello" }] };
    expect(readReasoning(claude)).toEqual({ chars: 6, tokens: null });
  });

  it("readReasoning reads ST's normalized Gemini reply: thought parts ride `responseContent.parts` (:784)", () => {
    const gemini = { choices: [{ message: { content: "Hi" } }], responseContent: { role: "model", parts: [{ text: "plan it", thought: true }, { text: "Hi" }, { thoughtSignature: "sig" }] } };
    expect(readReasoning(gemini)).toEqual({ chars: 7, tokens: null });
    expect(readReasoning({ choices: [{ message: { content: "Hi" } }], responseContent: "Hi" })).toEqual({ chars: 0, tokens: null });
  });
});
