import type { NormalizedStoryV2 } from "@engine/index";
import type { ExtensionConflict } from "@services/stHost/extensionConflicts";

export type { ExtensionConflict };

let readConflicts: () => ExtensionConflict[] = () => [];

export const readExtensionConflictsWith = (read: () => ExtensionConflict[]): (() => void) => {
  readConflicts = read;
  return () => {
    if (readConflicts === read) readConflicts = () => [];
  };
};

const exclusiveLore = (story: NormalizedStoryV2 | null): boolean => Boolean(story?.lore_select?.exclusive && story.lore_select.lorebooks.length);

export const extensionConflictsFor = (story: NormalizedStoryV2 | null, found: readonly ExtensionConflict[]): ExtensionConflict[] =>
  story ? found.filter((id) => id !== "vectors-world-info" || exclusiveLore(story)) : [];

export const extensionConflicts = (story: NormalizedStoryV2 | null): ExtensionConflict[] => extensionConflictsFor(story, readConflicts());
