import { MEMORY_TIERS } from "@memory/index";
import { MacrosParser } from "@services/STAPI";
import { renderBlackboardMemo } from "./blackboardMemo";
import type { RuntimeManager } from "./runtimeManager";

export function registerRuntimeMacros(manager: RuntimeManager) {
  MacrosParser.registerMacro("story_blackboard", () => renderBlackboardMemo(manager.getSnapshot()), "Story Orchestrator v2 blackboard");
  MacrosParser.registerMacro("story_canon", () => manager.getCanon() || "(none)", "Story Orchestrator v2 derived canon");
  MEMORY_TIERS.forEach((tier) => {
    MacrosParser.registerMacro(`story_memory_${tier}`, () => manager.getMemoryInjectionBlocks()[tier] || "(none)", `Story Orchestrator v2 memory tier: ${tier}`);
  });
}
