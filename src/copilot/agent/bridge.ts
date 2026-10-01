import { parseAgentReply, type ParsedAgentReply } from "./parse";
import { AgentRouteUnavailable, estimateTokens, problemsOf, type AgentRoute, type AgentToolBridge, type HarnessTarget, type HarnessTransport, type RouteAnswer } from "./route";
import type { AgentTurn } from "./loop";
import type { AgentStep, AgentStepStatus } from "./types";

export const BRIDGE_ROLE = "authoring";
export const BRIDGE_MAX_OUTPUT_CHARS = 20_000;
export const BRIDGE_SYSTEM = [
  "You are the agent inside the Story Orchestrator wizard, working on one story draft for its author.",
  "Your only tools are the story tools you are given. Call them natively, one at a time, and wait for each result before the next call.",
  "A result tells you what happened: observed, applied, waiting for the author, or refused with the reason.",
  "When the request asks for a plan, or when the plan is finished, reply with the JSON object it asks for as plain text and make no tool call.",
].join("\n");

const NOT_OK: ReadonlySet<AgentStepStatus> = new Set(["refused", "failed", "rejected"]);

export const bridgeAnswerText = (step: AgentStep | undefined): { ok: boolean; text: string } => {
  if (!step) return { ok: false, text: "No step was recorded for this call." };
  const lines = [`${step.status}: ${step.observation}`, ...(step.check ? [`check:\n${step.check}`] : [])];
  return { ok: !NOT_OK.has(step.status), text: lines.join("\n") };
};

const PLAN_FIRST = "the first reply is the plan: {\"plan\": [\"step\", …]} as plain text, before any tool call.";

export const createBridgeRoute = (bridge: AgentToolBridge, target: HarnessTarget, tools: Array<Record<string, unknown>>): AgentRoute => {
  let sessionId: string | null = null;
  let callId: string | null = null;
  let deadlineAt = 0;

  const end = async (): Promise<void> => {
    const open = sessionId;
    sessionId = null;
    callId = null;
    if (open) await bridge.close(open);
  };

  const answerFor = (prompt: string, raw: string, parsed: ParsedAgentReply, tokens: number, check?: Parameters<AgentRoute["ask"]>[2]): RouteAnswer => ({
    route: "harness", parsed, firstTryValid: !problemsOf(parsed, check).length, repaired: false, tokens, audit: { prompt, raw },
  });

  return {
    id: "harness",
    native: true,
    ask: async (prompt, expect, check) => {
      if (sessionId && callId) await end();
      let tokens = 0;
      if (!sessionId) {
        const opened = await bridge.open({
          harness: target.harness, model: target.model, role: BRIDGE_ROLE, system: BRIDGE_SYSTEM, prompt, tools, timeoutMs: target.timeoutMs, maxOutputChars: BRIDGE_MAX_OUTPUT_CHARS,
        });
        if (!opened.ok) throw new AgentRouteUnavailable("harness", `${opened.kind}: ${opened.message}`);
        sessionId = opened.sessionId;
        deadlineAt = Date.now() + target.timeoutMs;
        tokens = estimateTokens(prompt);
      }
      const event = await bridge.nextCall(sessionId, deadlineAt);
      if (event.kind === "ended") {
        sessionId = null;
        throw new AgentRouteUnavailable("harness", `${event.errorKind}: ${event.message}`);
      }
      if (event.kind === "done") {
        sessionId = null;
        return answerFor(prompt, event.text, parseAgentReply(event.text, expect), tokens + estimateTokens(event.text), check);
      }
      callId = event.callId;
      const raw = JSON.stringify({ tool: event.tool, args: event.args });
      const parsed: ParsedAgentReply = expect === "plan"
        ? { ok: false, issues: [PLAN_FIRST] }
        : { ok: true, reply: { kind: "call", call: { tool: event.tool, args: event.args } } };
      return answerFor(prompt, raw, parsed, tokens + estimateTokens(raw), check);
    },
    settle: async (turn: AgentTurn) => {
      const open = sessionId;
      const pending = callId;
      if (!open || !pending) return;
      callId = null;
      const steps = turn.session.steps;
      const delivered = await bridge.answer(open, pending, bridgeAnswerText(steps[steps.length - 1]));
      if (!delivered || turn.session.status !== "running") await end();
    },
    close: end,
  };
};

export const HARNESS_ROUTE_REFUSAL = "The harness offers no agent tool bridge for this route. Route \"Wizard and road ahead\" to opencode under Models per task, " +
  "with the harness plugin offering it; otherwise the agent runs through its text route on that role's model. The wizard does not fall back to the local profile.";

export const harnessRoute = (transport: HarnessTransport | null, tools: Array<Record<string, unknown>>): AgentRoute => {
  if (!transport?.refusal && transport?.bridge && transport.target) return createBridgeRoute(transport.bridge, transport.target, tools);
  return {
    id: "harness",
    ask: async (prompt, expect, check) => {
      if (transport?.refusal) throw new AgentRouteUnavailable("harness", transport.refusal);
      const call = transport?.call;
      if (!call) throw new AgentRouteUnavailable("harness", HARNESS_ROUTE_REFUSAL);
      const raw = await call({ prompt, expect, tools });
      const parsed = parseAgentReply(raw, expect);
      return { route: "harness", parsed, firstTryValid: !problemsOf(parsed, check).length, repaired: false, tokens: estimateTokens(prompt, raw), audit: { prompt, raw } };
    },
  };
};
