import { MEMORY_TIERS } from "@memory/index";
import { getPlayerName, MacrosParser } from "@services/STAPI";
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
  for (const key of registeredRoleKeys) MacrosParser.unregisterMacro(key);
  registeredRoleKeys = roster.map((member) => {
    const key = `story_role_${member.id}`;
    MacrosParser.registerMacro(key, () => manager.getStory()?.roster.find((entry) => entry.id === member.id)?.name ?? member.name ?? member.id, `Story Orchestrator v2 roster role: ${member.id}`);
    return key;
  });
};

export function registerRuntimeMacros(manager: RuntimeManager) {
  MacrosParser.registerMacro("story_title", () => manager.getSnapshot().storyTitle || "(no story)", "Story Orchestrator v2 story title");
  MacrosParser.registerMacro("story_description", () => manager.getSnapshot().storyDescription || "(none)", "Story Orchestrator v2 story description");
  MacrosParser.registerMacro("story_current_checkpoint", () => renderCurrentCheckpoint(manager), "Story Orchestrator v2 active checkpoint");
  MacrosParser.registerMacro("story_past_checkpoints", () => renderPastCheckpoints(manager), "Story Orchestrator v2 visited anchors");
  MacrosParser.registerMacro("story_possible_transitions", () => manager.getPossibleTransitions().join("\n") || "(none)", "Story Orchestrator v2 outgoing transitions with gate text");
  MacrosParser.registerMacro("story_tension", () => manager.getSnapshot().tension.level ?? "(unknown)", "Story Orchestrator v2 current tension level");
  MacrosParser.registerMacro("story_player_name", () => getPlayerName() || "(player)", "Story Orchestrator v2 player persona name");
  MacrosParser.registerMacro("story_blackboard", () => renderBlackboardMemo(manager.getSnapshot()), "Story Orchestrator v2 blackboard");
  MacrosParser.registerMacro("story_canon", () => manager.getCanon() || "(none)", "Story Orchestrator v2 derived canon");
  MEMORY_TIERS.forEach((tier) => {
    MacrosParser.registerMacro(`story_memory_${tier}`, () => manager.getMemoryInjectionBlocks()[tier] || "(none)", `Story Orchestrator v2 memory tier: ${tier}`);
  });
  MacrosParser.registerMacro("story_epistemic", () => manager.getEpistemicBlock() || "(none)", "Story Orchestrator v2 active-speaker epistemic block");
  MacrosParser.registerMacro("story_ledger", () => manager.getLedgerBlock() || "(none)", "Story Orchestrator v2 state ledger");
  manager.subscribe(() => syncRoleMacros(manager));
  syncRoleMacros(manager);
}
