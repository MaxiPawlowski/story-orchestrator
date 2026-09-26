import { MEMORY_TIERS, sceneFieldsInConflict } from "@memory/index";
import { confirmedSceneFacts } from "@judge/index";
import { getPlayerName, registerHostMacro, unregisterHostMacro } from "@services/STAPI";
import { renderBlackboardMemo } from "./blackboardMemo";
import { createQualityMacroSync, QUALITY_ARG_MACRO, QUALITY_MACRO_PREFIX, renderQualityArg } from "./qualityMacros";
import type { RuntimeManager } from "./runtimeManager";

const renderCurrentCheckpoint = (manager: RuntimeManager): string => {
  const snapshot = manager.getSnapshot();
  if (!snapshot.activeCheckpointName) return "(none)";
  return snapshot.activeObjective ? `${snapshot.activeCheckpointName} — ${snapshot.activeObjective}` : snapshot.activeCheckpointName;
};

const renderPastCheckpoints = (manager: RuntimeManager): string => {
  const names = manager.getSnapshot().checkpoints.filter((checkpoint) => checkpoint.visited && !checkpoint.active).map((checkpoint) => checkpoint.name);
  return names.length ? names.join("\n") : "(none)";
};

let registeredRoleKeys: string[] = [];
let lastRosterSignature = "";

const syncRoleMacros = (manager: RuntimeManager) => {
  const roster = manager.getStory()?.roster ?? [];
  const signature = roster.map((member) => `${member.id}:${member.name ?? ""}`).join("|");
  if (signature === lastRosterSignature) return;
  lastRosterSignature = signature;
  for (const key of registeredRoleKeys) unregisterHostMacro(key);
  registeredRoleKeys = roster.map((member) => {
    const key = `story_role_${member.id}`;
    registerHostMacro(key, () => manager.getStory()?.roster.find((entry) => entry.id === member.id)?.name ?? member.name ?? member.id, `Story Orchestrator v2 roster role: ${member.id}`);
    return key;
  });
};

/**
 * Returns the disposer for the snapshot subscription it makes. v2.3 plan 03: startRuntime used to
 * call this and drop it on the floor, so every stop/start cycle left another role-macro sync
 * listener attached to the manager for the life of the page.
 */
export function registerRuntimeMacros(manager: RuntimeManager): () => void {
  registerHostMacro("story_title", () => manager.getSnapshot().storyTitle || "(no story)", "Story Orchestrator v2 story title");
  registerHostMacro("story_description", () => manager.getSnapshot().storyDescription || "(none)", "Story Orchestrator v2 story description");
  registerHostMacro("story_current_checkpoint", () => renderCurrentCheckpoint(manager), "Story Orchestrator v2 active checkpoint");
  registerHostMacro("story_past_checkpoints", () => renderPastCheckpoints(manager), "Story Orchestrator v2 visited anchors");
  registerHostMacro("story_possible_transitions", () => manager.getPossibleTransitions().join("\n") || "(none)", "Story Orchestrator v2 outgoing transitions with gate text");
  registerHostMacro("story_tension", () => manager.getSnapshot().tension.level ?? "(unknown)", "Story Orchestrator v2 current tension level");
  registerHostMacro(
    "story_scene_location",
    () => confirmedSceneFacts(manager.getSceneRead(), sceneFieldsInConflict(manager.getSnapshot().memory.conflicts))?.location ?? "(unknown)",
    "Story Orchestrator v2 scene location (judge scene tracker)",
  );
  registerHostMacro(
    "story_scene_time",
    () => confirmedSceneFacts(manager.getSceneRead(), sceneFieldsInConflict(manager.getSnapshot().memory.conflicts))?.time ?? "(unknown)",
    "Story Orchestrator v2 scene time of day (judge scene tracker)",
  );
  registerHostMacro("story_scene_present", () => confirmedSceneFacts(manager.getSceneRead())?.present.join(", ") || "(unknown)", "Story Orchestrator v2 characters present (judge scene tracker)");
  registerHostMacro("story_player_name", () => getPlayerName() || "(player)", "Story Orchestrator v2 player persona name");
  registerHostMacro("story_blackboard", () => renderBlackboardMemo(manager.getSnapshot()), "Story Orchestrator v2 blackboard");
  registerHostMacro("story_canon", () => manager.getCanon() || "(none)", "Story Orchestrator v2 derived canon");
  MEMORY_TIERS.forEach((tier) => {
    registerHostMacro(`story_memory_${tier}`, () => manager.getMemoryInjectionBlocks()[tier] || "(none)", `Story Orchestrator v2 memory tier: ${tier}`);
  });
  registerHostMacro("story_epistemic", () => manager.getEpistemicBlock() || "(none)", "Story Orchestrator v2 active-speaker epistemic block");
  registerHostMacro("story_ledger", () => manager.getLedgerBlock() || "(none)", "Story Orchestrator v2 state ledger");
  const syncQualityMacros = createQualityMacroSync({
    register: (name, read) => registerHostMacro(name, read, `Story Orchestrator v2 quality: ${name.slice(QUALITY_MACRO_PREFIX.length)}`),
    unregister: unregisterHostMacro,
    journal: (summary, detail) => manager.noteRecap(summary, detail),
    values: () => manager.getEngineState()?.blackboard.values ?? {},
  });
  registerHostMacro(QUALITY_ARG_MACRO, {
    unnamedArgs: [{ name: "key", description: "the quality key, as authored" }],
    handler: ([key]) => renderQualityArg(manager.getStory(), manager.getEngineState()?.blackboard.values ?? {}, key),
  }, "Story Orchestrator v2 quality by key (new macro engine only; {{story_quality_<key>}} works everywhere)");
  const sync = () => {
    syncRoleMacros(manager);
    syncQualityMacros(manager.getStory());
  };
  const unsubscribe = manager.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    syncQualityMacros(null);
    unregisterHostMacro(QUALITY_ARG_MACRO);
  };
}
