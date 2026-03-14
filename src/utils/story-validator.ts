import { z } from "zod";
import { type Story, StorySchema } from "./story-schema";
import { normalizeStory } from "./story-validator-normalization";
import type { NormalizedStory } from "./story-validator-types";
export type {
  CheckpointResult,
  NormalizedAuthorNote,
  NormalizedAuthorNoteSettings,
  NormalizedCheckpoint,
  NormalizedStory,
  NormalizedTalkControl,
  NormalizedTalkControlCheckpoint,

  NormalizedTalkControlReply,
  NormalizedTalkControlReplyContent,
  NormalizedTransition,
  NormalizedTransitionTrigger,
  NormalizedTriggerType,
  NormalizedWorldInfo,
} from "./story-validator-types";
export {
  getNormalizedStubCheckpointName,
  isNormalizedStubCheckpoint,
} from "./story-validator-types";

export function validateStoryShape(input: unknown): Story {
  return StorySchema.parse(input);
}

export function parseAndNormalizeStory(input: unknown): NormalizedStory {
  return normalizeStory(validateStoryShape(input));
}

export function formatZodError(e: unknown): string[] {
  if (!(e instanceof z.ZodError)) return [String(e)];
  return e.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`);
}
