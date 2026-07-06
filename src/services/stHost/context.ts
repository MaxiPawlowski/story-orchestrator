import { extensionsModule, macrosModule } from "./modules";

export type StoryOrchestratorHostContext = SillyTavernContext;
export type StoryOrchestratorMacrosParser = typeof macrosModule.MacrosParser;

export const getContext = (): StoryOrchestratorHostContext => extensionsModule.getContext() as unknown as StoryOrchestratorHostContext;
export const MacrosParser: StoryOrchestratorMacrosParser = macrosModule.MacrosParser;

export const getPlayerName = (): string => {
  const context = getContext() as unknown as { name1?: string };
  return typeof context.name1 === "string" && context.name1.trim() ? context.name1.trim() : "";
};
