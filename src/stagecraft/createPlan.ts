import { STAGECRAFT_CREATE_CAP_DEFAULT, type NormalizedStory } from "@engine/index";
import { isCheckpointGated, isCuratorExcluded } from "./scope";
import type { CreatedEntry } from "./types";

export const createCapFor = (story: NormalizedStory | null): number => story?.stagecraft?.createCap ?? STAGECRAFT_CREATE_CAP_DEFAULT;

export const hiddenTitleRefusal = (story: NormalizedStory | null, lorebook: string, comment: string): string | null => {
  if (isCheckpointGated(story, lorebook, comment)) return `"${comment}" is switched by checkpoint effects, which alone decide it`;
  if (isCuratorExcluded(story, lorebook, comment)) return `"${comment}" is excluded from the curator by this story`;
  return null;
};

export const newEntriesText = (count: number): string => `${String(count)} new entr${count === 1 ? "y" : "ies"}`;

export const capRefusal = (cap: number) => `this story's limit of ${String(cap)} new entr${cap === 1 ? "y" : "ies"} is reached`;

export const sanitizeCreated = (value: unknown): CreatedEntry[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is CreatedEntry => Boolean(entry) && typeof entry === "object" && typeof entry.lorebook === "string"
        && typeof entry.lorebookFileId === "string" && typeof entry.comment === "string" && Number.isInteger(entry.uid) && typeof entry.messageId === "number")
    : [];
