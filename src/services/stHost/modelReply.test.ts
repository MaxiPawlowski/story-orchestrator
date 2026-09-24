import { timeoutAbortReason } from "@utils/signals";
import { classifyHostFailure, cleanTextCompletionReply, readFinish, requestModelReply, type ModelRequestHost } from "./modelReply";

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

const fakeHost = (api: string, reply: unknown = { choices: [{ text: "NO_DELTA", finish_reason: "stop" }] }) => {
  const calls: Array<{ custom: Record<string, unknown>; override: Record<string, unknown> }> = [];
  const host: ModelRequestHost = {
    sendRequest: async (_profileId, _prompt, _maxTokens, custom, override) => { calls.push({ custom: { ...custom }, override }); return reply; },
    profileExists: (id) => id === "p1",
    profile: () => ({ api, instruct: undefined }),
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
    expect(reply).toEqual({ ok: true, text: "cc text", finish: "stop" });
    expect(calls[0].override).toEqual({ stream: false });
  });

  it("control: a TC profile keeps today's sampler override", async () => {
    const { host, calls } = fakeHost("llamacpp");
    await requestModelReply(host, "p1", "prompt", 512, { samplers: { temperature: 0.1, top_p: 0.9 } });
    expect(calls[0].override).toEqual({ stream: false, temperature: 0.1, top_p: 0.9 });
  });

  it("asks for the raw reply and hands the caller's signal to the host", async () => {
    const { host, calls } = fakeHost("llamacpp", { choices: [{ text: "partial", finish_reason: "length" }] });
    const controller = new AbortController();
    const reply = await requestModelReply(host, "p1", "prompt", 64, { signal: controller.signal });
    expect(reply).toEqual({ ok: true, text: "partial", finish: "length" });
    expect(calls[0].custom).toMatchObject({ extractData: false, stream: false, signal: controller.signal });
  });

  it("a TC reply is cleaned with the profile's instruct template before anyone parses it (03-H17)", async () => {
    const { host } = fakeHost("llamacpp", { choices: [{ text: "NO_DELTA\n<start_of_turn>user\nDELTA crossed value=true evidence=\"x\"", finish_reason: "stop" }] });
    host.instructSequences = () => ({ stop_sequence: "<end_of_turn>", input_sequence: "<start_of_turn>user" });
    expect(await requestModelReply(host, "p1", "prompt", 64)).toEqual({ ok: true, text: "NO_DELTA\n", finish: "stop" });
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
