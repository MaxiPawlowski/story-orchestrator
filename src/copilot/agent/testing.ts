import type { ModelCall } from "@extraction/modelRoute";
import { emptyEnvironment, type ProvisioningEnvironment } from "@wizard/index";
import type { StoryV2 } from "@engine/index";
import type { AgentContext } from "./loop";
import { localRoute, type AgentRoute } from "./route";
import { emptyLookup } from "./types";

export interface ScriptedModel {
  call: ModelCall;
  prompts: string[];
}

export const scriptedModel = (replies: Array<string | Record<string, unknown>>): ScriptedModel => {
  const queue = replies.map((reply) => (typeof reply === "string" ? reply : JSON.stringify(reply)));
  const prompts: string[] = [];
  const call: ModelCall = async (prompt) => {
    prompts.push(prompt);
    return { text: queue.shift() ?? "", finish: "stop" };
  };
  return { call, prompts };
};

export const scriptedRoute = (replies: Array<string | Record<string, unknown>>): { route: AgentRoute; prompts: string[] } => {
  const model = scriptedModel(replies);
  return { route: localRoute(model.call, { role: "authoring", pass: "copilot" }), prompts: model.prompts };
};

export const agentContext = (draft: StoryV2, environment: ProvisioningEnvironment = emptyEnvironment()): AgentContext => ({ draft, environment, lookup: emptyLookup() });
