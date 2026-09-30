import type { StoryV2 } from "@engine/index";
import type { ModelCall } from "@extraction/modelRoute";
import type { ProvisioningEnvironment } from "@wizard/index";
import { advanceAgent, type AgentTurn } from "./loop";
import { harnessRoute, localRoute, type HarnessTransport } from "./route";
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

export const runAgentTurn = (input: AgentTurnInput): Promise<AgentTurn> => {
  const route = input.route === "harness"
    ? harnessRoute(input.harness ?? null, Object.values(AGENT_TOOLS).map(toolJsonSchema))
    : localRoute(input.model, { role: "authoring", pass: "copilot", debugResponse: input.debugResponse ?? null });
  const { environment } = input;
  return advanceAgent(input.session, {
    draft: input.draft,
    environment,
    lookup: {
      characters: () => environment.characterNames,
      lorebooks: () => environment.lorebookNames,
      groups: () => environment.groupNames,
      backgrounds: input.backgrounds ?? (() => []),
    },
  }, route);
};
