import { createProfileToolBridge, type ToolMessage } from "./profileToolBridge";

const schema = { name: "readDraft", description: "Read the draft.", inputSchema: { type: "object", properties: {} } };
const open = { harness: "profile", model: "ds", role: "authoring", system: "SYSTEM", prompt: "PROMPT", tools: [schema], timeoutMs: 1000, maxOutputChars: 100 };
const reply = (message: Record<string, unknown>) => ({ choices: [{ message }] });
const call = (id: string, name: string, args: string) => ({ id, type: "function", function: { name, arguments: args } });

describe("v2.8 09: native tool calls over a Chat Completion profile (the wizard's DeepSeek route)", () => {
  it("sends the tools as functions, hands back each call in turn, and threads the answers into the conversation", async () => {
    const sent: Array<{ messages: ToolMessage[]; tools: Array<Record<string, unknown>> }> = [];
    const replies = [reply({ content: "", tool_calls: [call("c1", "readDraft", "{}"), call("c2", "readGuide", "{\"topic\":\"gates\"}")] }), reply({ content: "{\"done\":true}" })];
    const bridge = createProfileToolBridge(async (messages, tools) => {
      sent.push({ messages: messages.map((message) => ({ ...message })), tools });
      return replies.shift();
    });
    const opened = await bridge.open(open);
    if (!opened.ok) throw new Error("open failed");
    expect(await bridge.nextCall(opened.sessionId, Infinity)).toEqual({ kind: "call", callId: "c1", tool: "readDraft", args: {} });
    expect(sent[0].tools).toEqual([{ type: "function", function: { name: "readDraft", description: "Read the draft.", parameters: schema.inputSchema } }]);
    expect(sent[0].messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(await bridge.answer(opened.sessionId, "c1", { ok: true, text: "observed: draft" })).toBe(true);
    expect(await bridge.nextCall(opened.sessionId, Infinity)).toEqual({ kind: "call", callId: "c2", tool: "readGuide", args: { topic: "gates" } });
    expect(sent).toHaveLength(1);
    await bridge.answer(opened.sessionId, "c2", { ok: false, text: "refused: no such topic" });
    expect(await bridge.nextCall(opened.sessionId, Infinity)).toEqual({ kind: "done", text: "{\"done\":true}" });
    expect(sent[1].messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "tool", "tool"]);
    expect(sent[1].messages[3]).toMatchObject({ tool_call_id: "c1", content: "observed: draft" });
  });

  it("a malformed argument string reaches the tool check as an empty object, never a throw", async () => {
    const bridge = createProfileToolBridge(async () => reply({ content: null, tool_calls: [call("c1", "readDraft", "{not json")] }));
    const opened = await bridge.open(open);
    if (!opened.ok) throw new Error("open failed");
    expect(await bridge.nextCall(opened.sessionId, Infinity)).toEqual({ kind: "call", callId: "c1", tool: "readDraft", args: {} });
  });

  it("names the failure so the runner can fall back: auth, quota, transport, timeout", async () => {
    const failing = (message: string) => createProfileToolBridge(async () => { throw new Error(message); });
    for (const [message, kind] of [["401 Unauthorized", "auth"], ["402 Insufficient Balance", "quota"], ["fetch failed", "transport"]] as const) {
      const bridge = failing(message);
      const opened = await bridge.open(open);
      if (!opened.ok) throw new Error("open failed");
      expect(await bridge.nextCall(opened.sessionId, Infinity)).toEqual({ kind: "ended", errorKind: kind, message });
    }
    const late = createProfileToolBridge(async () => reply({ content: "x" }), () => 10);
    const opened = await late.open(open);
    if (!opened.ok) throw new Error("open failed");
    expect(await late.nextCall(opened.sessionId, 5)).toMatchObject({ kind: "ended", errorKind: "timeout" });
    expect(await late.nextCall("missing", Infinity)).toMatchObject({ kind: "ended", errorKind: "transport" });
  });

  it("a reply with no message ends the session instead of reading as done", async () => {
    const bridge = createProfileToolBridge(async () => ({ choices: [] }));
    const opened = await bridge.open(open);
    if (!opened.ok) throw new Error("open failed");
    expect(await bridge.nextCall(opened.sessionId, Infinity)).toEqual({ kind: "ended", errorKind: "transport", message: "the profile returned no message" });
  });
});
