import type { Story } from "@engine/index";
import { createProfileToolBridge, type ToolMessage } from "@services/stHost/profileToolBridge";
import { createBridgeRoute } from "./bridge";
import { advanceAgent, approvePlan, newAgentSession } from "./loop";
import { agentContext } from "./testing";
import { agentToolSchemas } from "./turn";
import { checkAskCall } from "./ask";
import { checkToolCall } from "./tools";

const AT = "2026-10-14T00:00:00.000Z";
const TARGET = { harness: "profile", model: "ds", timeoutMs: 600_000 };

const story = (): Story => ({
  title: "Args", description: "", qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true }], transitions: [], roster: [],
});

const reply = (message: Record<string, unknown>) => ({ choices: [{ message }] });
const toolCall = (args: string) => ({ id: "c1", type: "function", function: { name: "readGuide", arguments: args } });

describe("v2.8 small fixes 7: malformed tool-call arguments are named as such", () => {
  it("the profile bridge keeps the parse failure beside the empty args", async () => {
    const bridge = createProfileToolBridge(async () => reply({ content: null, tool_calls: [toolCall("{\"topic\": gates")] }));
    const opened = await bridge.open({ harness: "profile", model: "ds", role: "authoring", system: "S", prompt: "P", tools: [], timeoutMs: 1000, maxOutputChars: 100 });
    if (!opened.ok) throw new Error("open failed");
    expect(await bridge.nextCall(opened.sessionId, Infinity)).toMatchObject({ kind: "call", tool: "readGuide", args: {}, argsError: expect.stringMatching(/^the arguments were not valid JSON/) });
  });

  it("the tool checks refuse it with a distinct message, not a missing argument", () => {
    const malformed = { tool: "readGuide", args: {}, argsError: "the arguments were not valid JSON (Unexpected token)" };
    const edit = checkToolCall(malformed);
    expect(edit).toMatchObject({ ok: false, message: expect.stringContaining("readGuide: the arguments were not valid JSON") });
    expect(edit.ok ? "" : edit.message).not.toMatch(/missing argument/);
    expect(checkToolCall({ tool: "readGuide", args: {} })).toMatchObject({ ok: false, message: expect.stringContaining("missing argument \"topic\"") });
    const ask = checkAskCall("author", malformed);
    expect(ask).toMatchObject({ ok: false, message: expect.stringContaining("not valid JSON") });
  });

  it("the model hears the refusal over the profile bridge", async () => {
    const sent: ToolMessage[][] = [];
    const replies = [reply({ content: "", tool_calls: [toolCall("{not json")] }), reply({ content: "{\"done\":\"stop\"}" })];
    const bridge = createProfileToolBridge(async (messages) => { sent.push(messages.map((message) => ({ ...message }))); return replies.shift(); });
    const route = createBridgeRoute({ ...bridge, close: async () => undefined } as Parameters<typeof createBridgeRoute>[0], TARGET, agentToolSchemas());
    const session = approvePlan({ ...newAgentSession("args", "review", {}, AT), plan: ["p"], status: "awaiting-plan" }, ["p"], AT);
    const turn = await advanceAgent(session, agentContext(story()), route, AT);
    await route.settle?.(turn);
    await route.ask("next", "step", () => []);
    const tool = sent[1]?.find((message) => message.role === "tool");
    expect(tool?.content).toMatch(/not valid JSON/);
    expect(tool?.content).not.toMatch(/missing argument/);
  });
});
