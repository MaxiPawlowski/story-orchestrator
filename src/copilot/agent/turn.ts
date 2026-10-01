import type { StoryV2 } from "@engine/index";
import type { ModelCall } from "@extraction/modelRoute";
import type { ProvisioningEnvironment } from "@wizard/index";
import type { AgentRunner } from "./drive";
import { advanceAgent, type AgentContext, type AgentTurn } from "./loop";
import { harnessRoute } from "./bridge";
import { localRoute, type AgentRoute, type HarnessTransport } from "./route";
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

export const createAgentRunner = (input: AgentRunnerInput): AgentRunner => {
  let chosen: Promise<AgentRoute> | null = null;
  const route = (): Promise<AgentRoute> => {
    chosen ??= (async () => {
      const transport = input.harness ? await input.harness() : null;
      return transport ? harnessRoute(transport, agentToolSchemas()) : localRoute(input.model, { role: "authoring", pass: "copilot", debugResponse: input.debugResponse ?? null });
    })();
    return chosen;
  };
  const runner: AgentRunner = async (session, draft) => advanceAgent(session, contextFor(draft, input.environment(draft), input.backgrounds), await route());
  runner.settle = async (turn) => {
    const current = chosen ? await chosen : null;
    if (current?.settle) await current.settle(turn);
  };
  runner.close = async () => {
    const current = chosen ? await chosen : null;
    if (current?.close) await current.close();
  };
  return runner;
};
