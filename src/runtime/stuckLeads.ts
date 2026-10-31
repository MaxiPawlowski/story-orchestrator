import { knownEntities, unknownEntityNames } from "@engine/codex";
import type { EngineState, NormalizedStory } from "@engine/index";
import { focusSafe } from "@pacing/focus";

export const stuckLeadSafe = (story: NormalizedStory | null, state: EngineState | null, enabled: readonly string[], resting: (text: string) => string) =>
  (text: string): boolean => (story && state ? focusSafe(text, unknownEntityNames(story, knownEntities(story, state.blackboard.values, enabled)), resting) : false);
