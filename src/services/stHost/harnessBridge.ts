import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { HARNESS_PLUGIN_BASE } from "./harness";

export const BRIDGE_POLL_MS = 20_000;

export interface BridgeOpenInput {
  harness: string;
  model: string;
  role: string;
  system: string;
  prompt: string;
  tools: Array<Record<string, unknown>>;
  timeoutMs: number;
  maxOutputChars: number;
}

export type BridgeOpenResult = { ok: true; sessionId: string } | { ok: false; kind: string; message: string };

export type BridgeEvent =
  | { kind: "call"; callId: string; tool: string; args: Record<string, unknown> }
  | { kind: "done"; text: string }
  | { kind: "ended"; errorKind: string; message: string };

export interface HarnessBridgeClient {
  open: (input: BridgeOpenInput) => Promise<BridgeOpenResult>;
  nextCall: (sessionId: string, deadlineAt: number) => Promise<BridgeEvent>;
  answer: (sessionId: string, callId: string, result: { ok: boolean; text: string }) => Promise<boolean>;
  close: (sessionId: string) => Promise<void>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const pageHeaders = (): Record<string, string> => (getContext() as unknown as { getRequestHeaders: () => Record<string, string> }).getRequestHeaders();

const ended = (errorKind: string, message: string): BridgeEvent => ({ kind: "ended", errorKind, message });

export const readBridgeEvent = (data: unknown): BridgeEvent | null => {
  if (!isRecord(data)) return ended("malformed", "the bridge answered with no JSON object");
  if (data.kind === "pending") return null;
  if (data.kind === "call" && typeof data.callId === "string" && typeof data.tool === "string") {
    return { kind: "call", callId: data.callId, tool: data.tool, args: isRecord(data.args) ? data.args : {} };
  }
  if (data.kind === "done" && typeof data.text === "string") return { kind: "done", text: data.text };
  if (data.kind === "ended") return ended(typeof data.errorKind === "string" ? data.errorKind : "transport", typeof data.message === "string" ? data.message : "the bridge session ended");
  return ended("malformed", "the bridge answered with an unknown event");
};

const refusedFor = (status: number): { kind: string; message: string } => {
  if (status === 404) return { kind: "config", message: "the harness plugin on the SillyTavern server has no tool bridge (update and restart it)" };
  if (status === 403) return { kind: "config", message: "the harness plugin refused this user (harness routes are admin-only unless the host allows them)" };
  if (status === 429) return { kind: "busy", message: "the harness already runs as many agent sessions as it allows; retry shortly" };
  return { kind: "transport", message: `the harness plugin answered ${String(status)}` };
};

const textOf = (data: unknown, key: "kind" | "message"): string | null => (isRecord(data) && typeof data[key] === "string" ? data[key] as string : null);

export const createHarnessBridgeClient = (
  fetchImpl: Fetch = (url, init) => fetch(url, init),
  headers: () => Record<string, string> = pageHeaders,
  now: () => number = Date.now,
): HarnessBridgeClient => {
  const post = (route: string, body: Record<string, unknown>) => fetchImpl(`${HARNESS_PLUGIN_BASE}/agent/${route}`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "text/plain;charset=UTF-8", "X-SO-Plugin": "1" },
    body: JSON.stringify(body),
  });
  return {
    open: async (input) => {
      try {
        const response = await post("open", { ...input });
        if (!response.ok && response.status !== 429) return { ok: false, ...refusedFor(response.status) };
        const data = await response.json() as unknown;
        if (isRecord(data) && data.ok === true && typeof data.sessionId === "string") return { ok: true, sessionId: data.sessionId };
        if (response.status === 429) return { ok: false, ...refusedFor(429) };
        return { ok: false, kind: textOf(data, "kind") ?? "malformed", message: textOf(data, "message") ?? "the bridge did not open a session" };
      } catch (error) {
        return { ok: false, kind: "transport", message: error instanceof Error ? error.message : "the harness plugin could not be reached" };
      }
    },
    nextCall: async (sessionId, deadlineAt) => {
      while (now() < deadlineAt) {
        let response: Response;
        try {
          response = await post("next", { sessionId, waitMs: Math.max(0, Math.min(BRIDGE_POLL_MS, deadlineAt - now())) });
        } catch (error) {
          return ended("transport", error instanceof Error ? error.message : "the harness plugin could not be reached");
        }
        if (response.status === 404) return ended("lapsed", "the bridge session is gone (closed, timed out, or replaced by a newer one)");
        if (!response.ok) return ended(refusedFor(response.status).kind, refusedFor(response.status).message);
        const event = readBridgeEvent(await response.json() as unknown);
        if (event) return event;
      }
      return ended("timeout", "the agent did not call a tool or finish before the session deadline");
    },
    answer: async (sessionId, callId, result) => {
      try {
        return (await post("answer", { sessionId, callId, ok: result.ok, text: result.text })).ok;
      } catch {
        return false;
      }
    },
    close: async (sessionId) => {
      try {
        await post("close", { sessionId });
      } catch {
        return;
      }
    },
  };
};
