import { extensionsModule, macrosModule } from "./modules";

export type StoryOrchestratorHostContext = SillyTavernContext;
export type StoryOrchestratorMacrosParser = typeof macrosModule.MacrosParser;

export const getContext = (): StoryOrchestratorHostContext => extensionsModule.getContext() as unknown as StoryOrchestratorHostContext;
export const MacrosParser: StoryOrchestratorMacrosParser = macrosModule.MacrosParser;
