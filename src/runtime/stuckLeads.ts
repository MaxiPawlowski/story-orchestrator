import { knownEntities, unknownEntityNames } from "@engine/codex";
import type { EngineState, NormalizedStory } from "@engine/index";
import { focusSafe } from "@pacing/focus";
import { enabledCharacterIds } from "./roster";
import type { RosterHost } from "./hostPorts";
import { getGlobalSettings } from "./settingsStore";

export const stuckLeadSafe = (story: NormalizedStory | null, state: EngineState | null, enabled: readonly string[], resting: (text: string) => string) =>
  (text: string): boolean => (story && state ? focusSafe(text, unknownEntityNames(story, knownEntities(story, state.blackboard.values, enabled)), resting) : false);

interface TrialView { getStory: () => NormalizedStory | null; getState: () => EngineState | null; hosts: { roster: RosterHost } }
interface TrialMemory { injector: { restingFilter: () => (text: string) => string } }

export const pacingTrials = (view: TrialView, memory: TrialMemory) => ({
  pathArc: () => getGlobalSettings().pacing.pathArc,
  stuckLadder: () => getGlobalSettings().pacing.stuckLadder,
  leadSafe: (text: string) => stuckLeadSafe(view.getStory(), view.getState(), enabledCharacterIds(view.getStory(), view.hosts.roster), memory.injector.restingFilter())(text),
});
