import { MacrosParser } from "@services/STAPI";
import { renderBlackboardMemo } from "./blackboardMemo";
import type { RuntimeManager } from "./runtimeManager";

export function registerRuntimeMacros(manager: RuntimeManager) {
  MacrosParser.registerMacro("story_blackboard", () => renderBlackboardMemo(manager.getSnapshot()), "Story Orchestrator v2 blackboard");
}
