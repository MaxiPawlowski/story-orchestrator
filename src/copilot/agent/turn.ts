import type { StoryV2 } from "@engine/index";
import { fellBackText, type FellBack, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import type { ProvisioningEnvironment } from "@wizard/index";
import type { AgentRunner } from "./drive";
import { advanceAgent, type AgentContext, type AgentTurn } from "./loop";
import { harnessRoute } from "./bridge";
import { AgentRouteUnavailable, HARNESS_FALLBACK_KINDS, localRoute, type AgentRoute, type HarnessTransport } from "./route";
import { AGENT_TOOLS, toolJsonSchema } from "./tools";
import type { AgentRouteId, AgentSession } from "./types";

export interface AgentTurnInput {
  session: AgentSession;
  draft: StoryV2;
  model: ModelCall;
  environment: ProvisioningEnvironment;
  backgrounds?: () => string[];
  route?: AgentRouteId;
  harness?: HarnessTransport | null;
  debugResponse?: string;
}

export const agentToolSchemas = (): Array<Record<string, unknown>> => Object.values(AGENT_TOOLS).map(toolJsonSchema);

const contextFor = (draft: StoryV2, environment: ProvisioningEnvironment, backgrounds?: () => string[]): AgentContext => ({
  draft,
  environment,
  lookup: {
    characters: () => environment.characterNames,
    lorebooks: () => environment.lorebookNames,
    groups: () => environment.groupNames,
    backgrounds: backgrounds ?? (() => []),
  },
});

export const runAgentTurn = (input: AgentTurnInput): Promise<AgentTurn> => {
  const route = input.route === "harness"
    ? harnessRoute(input.harness ?? null, agentToolSchemas())
    : localRoute(input.model, { role: "authoring", pass: "copilot", debugResponse: input.debugResponse ?? null });
  return advanceAgent(input.session, contextFor(input.draft, input.environment, input.backgrounds), route);
};

export interface AgentRunnerInput {
  model: ModelCall;
  environment: (draft: StoryV2) => ProvisioningEnvironment;
  backgrounds?: () => string[];
  harness?: () => Promise<HarnessTransport | null>;
  debugResponse?: string;
}

type OnFailure = NonNullable<ModelAsk["onFailure"]>;

const fallsBack = (transport: HarnessTransport | null, error: unknown): error is AgentRouteUnavailable & { kind: string } =>
  Boolean(transport?.fallback) && error instanceof AgentRouteUnavailable && error.route === "harness" && error.kind !== null && HARNESS_FALLBACK_KINDS.has(error.kind);

const withFallback = (turn: AgentTurn, fellBack: FellBack | null): AgentTurn =>
  (fellBack ? { ...turn, session: { ...turn.session, fallback: fellBackText(fellBack) } } : turn);

const withoutFallback = (turn: AgentTurn): AgentTurn => {
  if (turn.session.fallback === undefined) return turn;
  const { fallback: _cleared, ...session } = turn.session;
  return { ...turn, session };
};

export const createAgentRunner = (input: AgentRunnerInput): AgentRunner => {
  let chosen: AgentRoute | null = null;
  let fellBackRoute: AgentRoute | null = null;
  let transport: HarnessTransport | null = null;
  const seen: { fellBack: FellBack | null } = { fellBack: null };
  const local = (onFailure?: OnFailure): AgentRoute => {
    const model: ModelCall = (prompt, ask) => input.model(prompt, ask).then((reply) => {
      if (reply.fellBack) seen.fellBack = reply.fellBack;
      return reply;
    });
    model.planted = input.model.planted;
    return localRoute(model, { role: "authoring", pass: "copilot", debugResponse: input.debugResponse ?? null, ...(onFailure ? { onFailure } : {}) });
  };
  const route = async (): Promise<AgentRoute> => {
    if (chosen) return chosen;
    transport = input.harness ? await input.harness() : null;
    const next = transport ? harnessRoute(transport, agentToolSchemas()) : local();
    if (!transport?.refusal) chosen = next;
    return next;
  };
  const runner: AgentRunner = async (session, draft) => {
    const context = contextFor(draft, input.environment(draft), input.backgrounds);
    const current = await route();
    try {
      const turn = await advanceAgent(session, context, current);
      return current === fellBackRoute ? turn : withoutFallback(turn);
    } catch (error) {
      if (!fallsBack(transport, error)) throw error;
      if (current.close) await current.close();
      const fallback = local({ kind: error.kind as OnFailure["kind"], reason: error.message });
      chosen = fallback;
      fellBackRoute = fallback;
      return withFallback(await advanceAgent(session, context, fallback), seen.fellBack);
    }
  };
  runner.settle = async (turn) => {
    if (chosen?.settle) await chosen.settle(turn);
  };
  runner.close = async () => {
    if (chosen?.close) await chosen.close();
  };
  return runner;
};
