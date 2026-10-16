import { knownEntities, unknownEntityNames, type CodexStory } from "@engine/codex";
import { namesAny } from "@pacing/focus";

type Disclosed<T> = { inputs: T; unknownNames: string[] };

export function directorDisclosure<T extends { openThreads: string[] }>(
  story: CodexStory, values: Readonly<Record<string, unknown>>, enabled: readonly string[], inputs: T,
): Disclosed<T> {
  const unknownNames = unknownEntityNames(story, knownEntities(story, values, enabled));
  return { inputs: { ...inputs, openThreads: inputs.openThreads.filter((thread) => !namesAny(thread, unknownNames)) }, unknownNames };
}
