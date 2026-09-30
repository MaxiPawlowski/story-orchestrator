import { askReply, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { parseAgentReply, type ParsedAgentReply } from "./parse";
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
  ask: (prompt: string, expect: "plan" | "step", check?: ReplyCheck) => Promise<RouteAnswer>;
}

export const estimateTokens = (...texts: string[]): number => Math.ceil(texts.reduce((sum, text) => sum + text.length, 0) / 4);

const problemsOf = (parsed: ParsedAgentReply, check?: ReplyCheck): string[] => (parsed.ok ? check?.(parsed.reply) ?? [] : parsed.issues);

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

const AGENT_BRIDGE_PATH = "/api/plugins/story-orchestrator-harness/agent";

interface AgentToolBridge {
  open: (input: { tools: Array<Record<string, unknown>>; harness: string; model: string }) => Promise<{ sessionId: string }>;
  nextCall: (sessionId: string) => Promise<{ tool: string; args: Record<string, unknown> } | { done: string }>;
  answer: (sessionId: string, result: { ok: boolean; text: string }) => Promise<void>;
  close: (sessionId: string) => Promise<void>;
}

export interface HarnessTransport {
  call: (input: { prompt: string; expect: "plan" | "step"; tools: Array<Record<string, unknown>> }) => Promise<string>;
  bridge?: AgentToolBridge;
}

export const HARNESS_ROUTE_REFUSAL = "The harness tool bridge is designed but not built (v2.6 plan 04 H, Agent tool bridge). Route \"Wizard and road ahead\" to a harness " +
  "under Models per task: the agent then runs there through its text route. The wizard does not fall back to the local profile. " +
  `Bridge endpoint (501 until built): ${AGENT_BRIDGE_PATH}.`;

export const harnessRoute = (transport: HarnessTransport | null, tools: Array<Record<string, unknown>>): AgentRoute => ({
  id: "harness",
  ask: async (prompt, expect, check) => {
    if (!transport) throw new AgentRouteUnavailable("harness", HARNESS_ROUTE_REFUSAL);
    const raw = await transport.call({ prompt, expect, tools });
    const parsed = parseAgentReply(raw, expect);
    return { route: "harness", parsed, firstTryValid: !problemsOf(parsed, check).length, repaired: false, tokens: estimateTokens(prompt, raw), audit: { prompt, raw } };
  },
});
