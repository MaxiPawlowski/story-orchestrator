import { MEMORY_TIERS } from "@memory/index";
import { getPlayerName, registerHostMacro, unregisterHostMacro } from "@services/STAPI";
import { renderBlackboardMemo } from "./blackboardMemo";
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

export function registerRuntimeMacros(manager: RuntimeManager) {
  registerHostMacro("story_title", () => manager.getSnapshot().storyTitle || "(no story)", "Story Orchestrator v2 story title");
  registerHostMacro("story_description", () => manager.getSnapshot().storyDescription || "(none)", "Story Orchestrator v2 story description");
  registerHostMacro("story_current_checkpoint", () => renderCurrentCheckpoint(manager), "Story Orchestrator v2 active checkpoint");
  registerHostMacro("story_past_checkpoints", () => renderPastCheckpoints(manager), "Story Orchestrator v2 visited anchors");
  registerHostMacro("story_possible_transitions", () => manager.getPossibleTransitions().join("\n") || "(none)", "Story Orchestrator v2 outgoing transitions with gate text");
  registerHostMacro("story_tension", () => manager.getSnapshot().tension.level ?? "(unknown)", "Story Orchestrator v2 current tension level");
  registerHostMacro("story_player_name", () => getPlayerName() || "(player)", "Story Orchestrator v2 player persona name");
  registerHostMacro("story_blackboard", () => renderBlackboardMemo(manager.getSnapshot()), "Story Orchestrator v2 blackboard");
  registerHostMacro("story_canon", () => manager.getCanon() || "(none)", "Story Orchestrator v2 derived canon");
  MEMORY_TIERS.forEach((tier) => {
    registerHostMacro(`story_memory_${tier}`, () => manager.getMemoryInjectionBlocks()[tier] || "(none)", `Story Orchestrator v2 memory tier: ${tier}`);
  });
  registerHostMacro("story_epistemic", () => manager.getEpistemicBlock() || "(none)", "Story Orchestrator v2 active-speaker epistemic block");
  registerHostMacro("story_ledger", () => manager.getLedgerBlock() || "(none)", "Story Orchestrator v2 state ledger");
  manager.subscribe(() => syncRoleMacros(manager));
  syncRoleMacros(manager);
}
