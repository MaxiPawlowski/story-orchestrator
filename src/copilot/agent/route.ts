import { askReply, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { parseAgentReply, type ParsedAgentReply } from "./parse";
import type { AgentTurn } from "./loop";
import type { AgentReply, AgentRouteId } from "./types";

const AGENT_MAX_TOKENS = 1536;

export interface AgentAudit {
  prompt: string;
  raw: string;
  repairPrompt?: string;
  repairRaw?: string;
}

export interface RouteAnswer {
  route: AgentRouteId;
  parsed: ParsedAgentReply;
  firstTryValid: boolean;
  repaired: boolean;
  tokens: number;
  audit: AgentAudit;
}

export type ReplyCheck = (reply: AgentReply) => string[];

export interface AgentRoute {
  id: AgentRouteId;
  native?: boolean;
  ask: (prompt: string, expect: "plan" | "step", check?: ReplyCheck) => Promise<RouteAnswer>;
  settle?: (turn: AgentTurn) => Promise<void>;
  close?: () => Promise<void>;
}

export const estimateTokens = (...texts: string[]): number => Math.ceil(texts.reduce((sum, text) => sum + text.length, 0) / 4);

export const problemsOf = (parsed: ParsedAgentReply, check?: ReplyCheck): string[] => (parsed.ok ? check?.(parsed.reply) ?? [] : parsed.issues);

export const localRoute = (model: ModelCall, ask: ModelAsk): AgentRoute => ({
  id: "local",
  ask: async (prompt, expect, check) => {
    const first = await askReply(model, prompt, { ...ask, maxTokens: AGENT_MAX_TOKENS });
    const parsed = parseAgentReply(first.text, expect);
    const problems = problemsOf(parsed, check);
    const audit: AgentAudit = { prompt, raw: first.text };
    if (!problems.length) return { route: "local", parsed, firstTryValid: true, repaired: false, tokens: estimateTokens(prompt, first.text), audit };
    const repairPrompt = `${prompt}\n\nYour reply was invalid:\n${problems.map((problem) => `- ${problem}`).join("\n")}\nReply with exactly one corrected JSON object.`;
    const second = await askReply(model, repairPrompt, { ...ask, maxTokens: AGENT_MAX_TOKENS });
    return {
      route: "local",
      parsed: parseAgentReply(second.text, expect),
      firstTryValid: false,
      repaired: true,
      tokens: estimateTokens(prompt, first.text, repairPrompt, second.text),
      audit: { ...audit, repairPrompt, repairRaw: second.text },
    };
  },
});

export class AgentRouteUnavailable extends Error {
  constructor(readonly route: AgentRouteId, reason: string) {
    super(reason);
  }
}

export type AgentBridgeEvent =
  | { kind: "call"; callId: string; tool: string; args: Record<string, unknown> }
  | { kind: "done"; text: string }
  | { kind: "ended"; errorKind: string; message: string };

export interface AgentToolBridge {
  open: (input: { harness: string; model: string; role: string; system: string; prompt: string; tools: Array<Record<string, unknown>>; timeoutMs: number; maxOutputChars: number }) =>
    Promise<{ ok: true; sessionId: string } | { ok: false; kind: string; message: string }>;
  nextCall: (sessionId: string, deadlineAt: number) => Promise<AgentBridgeEvent>;
  answer: (sessionId: string, callId: string, result: { ok: boolean; text: string }) => Promise<boolean>;
  close: (sessionId: string) => Promise<void>;
}

export interface HarnessTarget {
  harness: string;
  model: string;
  timeoutMs: number;
}

export interface HarnessTransport {
  call?: (input: { prompt: string; expect: "plan" | "step"; tools: Array<Record<string, unknown>> }) => Promise<string>;
  bridge?: AgentToolBridge;
  target?: HarnessTarget;
}
