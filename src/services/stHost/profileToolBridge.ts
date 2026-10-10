import { isRecord } from "@utils/guards";
import type { BridgeEvent, BridgeOpenInput, BridgeOpenResult, HarnessBridgeClient } from "./harnessBridge";

export type ToolMessage = { role: string; content: string } & Record<string, unknown>;

export type ToolSend = (messages: ToolMessage[], tools: Array<Record<string, unknown>>) => Promise<unknown>;

interface Session {
  messages: ToolMessage[];
  tools: Array<Record<string, unknown>>;
  queue: BridgeEvent[];
}

const functionTools = (schemas: Array<Record<string, unknown>>): Array<Record<string, unknown>> => schemas.map((schema) => ({
  type: "function",
  function: { name: schema.name, description: schema.description, parameters: schema.inputSchema },
}));

const parseArgs = (text: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(text || "{}");
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const ended = (errorKind: string, message: string): BridgeEvent => ({ kind: "ended", errorKind, message });

const errorKind = (message: string): string => {
  if (/\b(401|403)\b|unauthori[sz]ed|invalid api key|authentication/i.test(message)) return "auth";
  if (/\b(402|429)\b|quota|insufficient balance|rate limit/i.test(message)) return "quota";
  return "transport";
};

const replyMessage = (reply: unknown): Record<string, unknown> | null => {
  const choices = isRecord(reply) && Array.isArray(reply.choices) ? reply.choices : [];
  const first: unknown = choices[0];
  return isRecord(first) && isRecord(first.message) ? first.message : null;
};

const callEvents = (calls: unknown[]): BridgeEvent[] => calls.filter(isRecord).map((call) => {
  const fn = isRecord(call.function) ? call.function : {};
  return { kind: "call", callId: String(call.id ?? ""), tool: String(fn.name ?? ""), args: parseArgs(String(fn.arguments ?? "{}")) };
});

export const createProfileToolBridge = (send: ToolSend, now: () => number = Date.now): HarnessBridgeClient => {
  const sessions = new Map<string, Session>();
  let seq = 0;
  return {
    open: async (input: BridgeOpenInput): Promise<BridgeOpenResult> => {
      const sessionId = `profile-${++seq}`;
      sessions.set(sessionId, { messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }], tools: functionTools(input.tools), queue: [] });
      return { ok: true, sessionId };
    },
    nextCall: async (sessionId, deadlineAt) => {
      const state = sessions.get(sessionId);
      if (!state) return ended("transport", "no such session");
      const queued = state.queue.shift();
      if (queued) return queued;
      if (now() > deadlineAt) return ended("timeout", "the session passed its deadline");
      let reply: unknown;
      try {
        reply = await send(state.messages, state.tools);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return ended(errorKind(message), message);
      }
      const message = replyMessage(reply);
      if (!message) return ended("transport", "the profile returned no message");
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      const content = typeof message.content === "string" ? message.content : "";
      state.messages.push({ role: "assistant", content, ...(calls.length ? { tool_calls: calls } : {}) });
      const events = callEvents(calls);
      if (!events.length) return { kind: "done", text: content };
      state.queue.push(...events.slice(1));
      return events[0];
    },
    answer: async (sessionId, callId, result) => {
      const state = sessions.get(sessionId);
      if (!state) return false;
      state.messages.push({ role: "tool", tool_call_id: callId, content: result.text });
      return true;
    },
    close: async (sessionId) => {
      sessions.delete(sessionId);
    },
  };
};
