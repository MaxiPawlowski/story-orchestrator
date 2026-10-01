import { timeoutAbortReason } from "@utils/signals";
import { classifyHostFailure, cleanTextCompletionReply, readFinish, requestModelReply, type ModelRequestHost } from "./modelReply";
import type { ReasoningRoute } from "./reasoningPayload";

const wrapped = (cause: unknown) => new Error("API request failed", { cause });
const named = (name: string, message = name) => Object.assign(new Error(message), { name });

describe("classifyHostFailure over the literal ST messages (v2.4 03-H2/H3/H16)", () => {
  it.each([
    "Connection Manager is not available",
    "Profile not found (ID: 7f1c)",
    "Could not find profile.",
    "Select a connection profile that has an API",
    "Unknown API type koboldhorde",
    "API type kobold is not supported. Supported types: Chat Completion, Text Completion",
  ])("an unwrapped refusal before the request is config: %s", (message) => {
    expect(classifyHostFailure(new Error(message))).toEqual({ kind: "config", message });
  });

  it.each([
    "API type openai does not support chat completions",
    "API type textgenerationwebui does not support text completions",
    "Unknown API type mystery",
  ])("a config refusal wrapped inside the try is still config: %s", (message) => {
    expect(classifyHostFailure(wrapped(new Error(message)))).toEqual({ kind: "config", message: `API request failed: ${message}` });
  });

  it("a wrapped server error is transport, with the provider text kept for the author", () => {
    expect(classifyHostFailure(wrapped(new Error("Response not OK")))).toEqual({ kind: "transport", message: "API request failed: Response not OK" });
    expect(classifyHostFailure(wrapped(new TypeError("Failed to fetch")))).toEqual({ kind: "transport", message: "API request failed: Failed to fetch" });
  });

  it("a wrapped AbortError is a lapse and a wrapped TimeoutError is a timeout", () => {
    expect(classifyHostFailure(wrapped(named("AbortError", "The operation was aborted")))).toMatchObject({ kind: "lapsed" });
    expect(classifyHostFailure(wrapped(named("TimeoutError", "The operation timed out")))).toMatchObject({ kind: "timeout" });
  });

  it("our own aborted signal decides: a timeout reason is a timeout, anything else a lapse", () => {
    const lapse = new AbortController();
    lapse.abort();
    const timeout = new AbortController();
    timeout.abort(timeoutAbortReason("the memory model did not answer within 35000 ms"));
    expect(classifyHostFailure(wrapped(new Error("Response not OK")), lapse.signal)).toMatchObject({ kind: "lapsed" });
    expect(classifyHostFailure(wrapped(named("AbortError")), timeout.signal)).toEqual({ kind: "timeout", message: "the memory model did not answer within 35000 ms" });
  });
});

describe("readFinish (v2.4 03-H6/H18)", () => {
  it("reads every provider shape the seam can meet", () => {
    expect(readFinish({ choices: [{ text: "x", finish_reason: "length" }] })).toBe("length");
    expect(readFinish({ choices: [{ message: { content: "x" }, finish_reason: "stop" }] })).toBe("stop");
    expect(readFinish({ content: [{ type: "text", text: "x" }], stop_reason: "max_tokens" })).toBe("length");
    expect(readFinish({ content: [{ type: "text", text: "x" }], stop_reason: "end_turn" })).toBe("stop");
    expect(readFinish({ candidates: [{ finishReason: "MAX_TOKENS" }] })).toBe("length");
    expect(readFinish({ response: "x", done_reason: "length" })).toBe("length");
    expect(readFinish({ content: "x", stop_type: "limit", stopped_limit: true })).toBe("length");
    expect(readFinish({ content: "x", stopped_limit: true })).toBe("length");
    expect(readFinish({ content: "x", stopped_eos: true })).toBe("stop");
  });

  it("says unknown rather than guessing", () => {
    expect(readFinish({ choices: [{ text: "x" }] })).toBe("unknown");
    expect(readFinish({ choices: [{ finish_reason: "content_filter" }] })).toBe("unknown");
    expect(readFinish("plain")).toBe("unknown");
    expect(readFinish(null)).toBe("unknown");
  });
});

describe("cleanTextCompletionReply mirrors the TC clean-up extractData:false skips (v2.4 03-H17)", () => {
  const gemma = { stop_sequence: "<end_of_turn>", input_sequence: "<start_of_turn>user", output_sequence: "<start_of_turn>model", last_output_sequence: "" };

  it("cuts at a leaked user turn, drops a partial stop string and the output sequence, trims line ends", () => {
    expect(cleanTextCompletionReply("<start_of_turn>model\nDELTA a value=true evidence=\"x\"  \n<start_of_turn>user\nDELTA b value=true evidence=\"y\"", gemma)).toBe("\nDELTA a value=true evidence=\"x\"\n");
    expect(cleanTextCompletionReply("NO_DELTA\n<end_of", gemma)).toBe("NO_DELTA\n");
  });

  it("only trims line ends when the profile has no instruct template", () => {
    expect(cleanTextCompletionReply("NO_DELTA   \n<start_of_turn>user", null)).toBe("NO_DELTA\n<start_of_turn>user");
  });
});

const NO_METER = { effort: "default", applied: false, collapsed: false, unsupported: null, budget: 0, chars: 0, tokens: null };

const fakeHost = (api: string, reply: unknown = { choices: [{ text: "NO_DELTA", finish_reason: "stop" }] }, preset: string | undefined = "Default") => {
  const calls: Array<{ custom: Record<string, unknown>; override: Record<string, unknown> }> = [];
  const host: ModelRequestHost = {
    sendRequest: async (_profileId, _prompt, _maxTokens, custom, override) => { calls.push({ custom: { ...custom }, override }); return reply; },
    profileExists: (id) => id === "p1",
    profile: () => ({ api, instruct: undefined, preset }),
    apiSelected: (value) => (value === "openai" || value === "claude" ? "openai" : "textgenerationwebui"),
    extractMessage: (json, type) => (type === "openai" ? "cc text" : ((json as { choices: Array<{ text: string }> }).choices[0].text)),
    instructSequences: () => null,
  };
  return { host, calls };
};

describe("requestModelReply: the typed seam (v2.4 plan 03 D1)", () => {
  it("CC profile sends no temperature/top_p, so the preset and ST's per-model rules decide (03-H7/H8)", async () => {
    const { host, calls } = fakeHost("claude", { content: [{ type: "text", text: "x" }], stop_reason: "end_turn" });
    const reply = await requestModelReply(host, "p1", "prompt", 512, { samplers: { temperature: 0.1, top_p: 0.9 } });
    expect(reply).toEqual({ ok: true, text: "cc text", finish: "stop", meter: NO_METER });
    expect(calls[0].override).toEqual({ stream: false });
  });

  it("CC profile WITHOUT a preset carries our samplers, or the provider's default temperature decides (v2.6 plan 15 A5, DeepSeek)", async () => {
    const { host, calls } = fakeHost("openai", { choices: [{ message: { content: "x" } }] }, "");
    await requestModelReply(host, "p1", "prompt", 512, { samplers: { temperature: 0.1, top_p: 0.9 } });
    expect(calls[0].override).toEqual({ stream: false, temperature: 0.1, top_p: 0.9 });
  });

  it("control: a TC profile keeps today's sampler override", async () => {
    const { host, calls } = fakeHost("llamacpp");
    await requestModelReply(host, "p1", "prompt", 512, { samplers: { temperature: 0.1, top_p: 0.9 } });
    expect(calls[0].override).toMatchObject({ stream: false, temperature: 0.1, top_p: 0.9 });
  });

  describe("A37: a TC request carries our output budget in every key ST fills from the preset's genamt", () => {
    const presetPayload = {
      max_tokens: 1200,
      max_new_tokens: 1200,
      n_predict: 1200,
      num_predict: 1200,
      num_ctx: 98304,
      truncation_length: 98304,
      temperature: 1,
      top_p: 0.95,
      top_k: 64,
      min_p: 0.02,
      repeat_penalty: 1.05,
      dry_multiplier: 0.8,
      stop: ["<end_of_turn>"],
    };
    const sent = (override: Record<string, unknown>) => ({ ...presetPayload, ...override });

    it("every role's budget reaches n_predict and num_predict, samplers or not", async () => {
      for (const [maxTokens, samplers] of [[512, { temperature: 0.1, top_p: 0.9 }], [1024, { temperature: 0.1, top_p: 0.9 }], [16, undefined]] as const) {
        const { host, calls } = fakeHost("llamacpp");
        await requestModelReply(host, "p1", "prompt", maxTokens, samplers ? { samplers } : {});
        const body = sent(calls[0].override);
        expect({ max_tokens: body.max_tokens, max_new_tokens: body.max_new_tokens, n_predict: body.n_predict, num_predict: body.num_predict }).toEqual({ max_tokens: maxTokens, max_new_tokens: maxTokens, n_predict: maxTokens, num_predict: maxTokens });
      }
    });

    it("control: the preset's other samplers, context and stops are untouched", async () => {
      const { host, calls } = fakeHost("llamacpp");
      await requestModelReply(host, "p1", "prompt", 512, { samplers: { temperature: 0.1, top_p: 0.9 } });
      const body = sent(calls[0].override);
      const { max_tokens: _a, max_new_tokens: _b, n_predict: _c, num_predict: _d, temperature: _t, top_p: _p, ...rest } = presetPayload;
      expect(body).toMatchObject(rest);
      expect(Object.keys(calls[0].override).sort()).toEqual(["max_new_tokens", "max_tokens", "n_predict", "num_predict", "stream", "temperature", "top_p"]);
    });

    it("control: a CC profile gets no TC budget aliases (ST puts maxTokens in max_tokens itself)", async () => {
      const { host, calls } = fakeHost("claude", { content: [{ type: "text", text: "x" }], stop_reason: "end_turn" });
      await requestModelReply(host, "p1", "prompt", 512);
      expect(calls[0].override).toEqual({ stream: false });
    });
  });

  it("asks for the raw reply and hands the caller's signal to the host", async () => {
    const { host, calls } = fakeHost("llamacpp", { choices: [{ text: "partial", finish_reason: "length" }] });
    const controller = new AbortController();
    const reply = await requestModelReply(host, "p1", "prompt", 64, { signal: controller.signal });
    expect(reply).toEqual({ ok: true, text: "partial", finish: "length", meter: NO_METER });
    expect(calls[0].custom).toMatchObject({ extractData: false, stream: false, signal: controller.signal });
  });

  it("a TC reply is cleaned with the profile's instruct template before anyone parses it (03-H17)", async () => {
    const { host } = fakeHost("llamacpp", { choices: [{ text: "NO_DELTA\n<start_of_turn>user\nDELTA crossed value=true evidence=\"x\"", finish_reason: "stop" }] });
    host.instructSequences = () => ({ stop_sequence: "<end_of_turn>", input_sequence: "<start_of_turn>user" });
    expect(await requestModelReply(host, "p1", "prompt", 64)).toEqual({ ok: true, text: "NO_DELTA\n", finish: "stop", meter: NO_METER });
  });

  it("a deleted profile is config before any request goes out", async () => {
    const { host, calls } = fakeHost("llamacpp");
    const reply = await requestModelReply(host, "gone", "prompt", 64);
    expect(reply).toMatchObject({ ok: false, kind: "config" });
    expect(calls).toHaveLength(0);
  });

  it("an already-aborted signal is a lapse and sends nothing", async () => {
    const { host, calls } = fakeHost("llamacpp");
    const controller = new AbortController();
    controller.abort();
    expect(await requestModelReply(host, "p1", "prompt", 64, { signal: controller.signal })).toMatchObject({ ok: false, kind: "lapsed" });
    expect(calls).toHaveLength(0);
  });

  it("a host throw becomes a typed failure, never a rejection", async () => {
    const { host } = fakeHost("llamacpp");
    host.sendRequest = async () => { throw wrapped(new Error("Response not OK")); };
    expect(await requestModelReply(host, "p1", "prompt", 64)).toEqual({ ok: false, kind: "transport", message: "API request failed: Response not OK" });
  });
});

describe("requestModelReply: reasoning effort, budget and reasoning-exhausted (v2.6 plan 05 R1/R2)", () => {
  const openrouter = { api: "chat" as const, source: "openrouter", model: "m", includeBody: null };
  const ccHost = (reply: unknown, route: ReasoningRoute = openrouter) => {
    const made = fakeHost("openai", reply);
    made.host.extractMessage = (json) => ((json as { choices: Array<{ message: { content: string } }> }).choices[0].message.content);
    made.host.reasoningRoute = () => route;
    const budgets: number[] = [];
    const send = made.host.sendRequest;
    made.host.sendRequest = async (id, prompt, maxTokens, custom, override) => { budgets.push(maxTokens); return send(id, prompt, maxTokens, custom, override); };
    return { ...made, budgets };
  };
  const answered = { choices: [{ message: { content: "NO_DELTA", reasoning_content: "thinking" }, finish_reason: "stop" }] };

  it("an applied level adds that level's budget to the answer budget and sends the effort", async () => {
    const { host, calls, budgets } = ccHost(answered);
    const reply = await requestModelReply(host, "p1", "prompt", 512, { effort: "medium", reasoningBudget: 2048 });
    expect(budgets).toEqual([2560]);
    expect(calls[0].override).toEqual({ stream: false, reasoning_effort: "medium", include_reasoning: true });
    expect(reply).toEqual({ ok: true, text: "NO_DELTA", finish: "stop", meter: { effort: "medium", applied: true, collapsed: false, unsupported: null, budget: 2048, chars: 8, tokens: null } });
  });

  it("off and unsupported levels add no budget; unsupported sends nothing and says so", async () => {
    const off = ccHost(answered);
    await requestModelReply(off.host, "p1", "prompt", 512, { effort: "off", reasoningBudget: 2048 });
    expect(off.budgets).toEqual([512]);
    const tc = ccHost(answered, { api: "text", source: null, model: null, includeBody: null });
    const reply = await requestModelReply(tc.host, "p1", "prompt", 512, { effort: "high", reasoningBudget: 6144 });
    expect(tc.budgets).toEqual([512]);
    expect(tc.calls[0].override).toEqual({ stream: false });
    expect(reply).toMatchObject({ ok: true, meter: { applied: false, unsupported: expect.stringContaining("Text Completion") } });
  });

  it("control: default reads no route at all and changes nothing", async () => {
    const { host, calls, budgets } = ccHost(answered);
    host.reasoningRoute = () => { throw new Error("default must not read the route"); };
    await requestModelReply(host, "p1", "prompt", 512, { reasoningBudget: 2048 });
    expect(budgets).toEqual([512]);
    expect(calls[0].override).toEqual({ stream: false });
  });

  it("an empty answer with reasoning present is reasoning-exhausted (the 2026-09-25 llama-server shape)", async () => {
    const { host } = ccHost({ choices: [{ message: { content: "", reasoning_content: "x".repeat(900) }, finish_reason: "length" }], usage: { completion_tokens_details: { reasoning_tokens: 300 } } });
    expect(await requestModelReply(host, "p1", "prompt", 300)).toEqual({ ok: false, kind: "reasoning-exhausted", message: "the model spent its whole budget thinking (900 chars, 300 tokens, finish length)" });
  });

  it("an empty answer cut at the limit is reasoning-exhausted even without reasoning evidence", async () => {
    const { host } = fakeHost("llamacpp", { choices: [{ text: "", finish_reason: "length" }] });
    expect(await requestModelReply(host, "p1", "prompt", 64)).toMatchObject({ ok: false, kind: "reasoning-exhausted" });
  });

  it("control: an empty answer that stopped on its own with no reasoning stays an ordinary empty reply", async () => {
    const { host } = fakeHost("llamacpp", { choices: [{ text: "", finish_reason: "stop" }] });
    expect(await requestModelReply(host, "p1", "prompt", 64)).toMatchObject({ ok: true, text: "" });
  });
});
