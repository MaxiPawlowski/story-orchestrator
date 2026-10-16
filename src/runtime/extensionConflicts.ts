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

const hasNpcReplies = (story: NormalizedStoryV2): boolean =>
  (story.checkpoints ?? []).some((checkpoint) => Array.isArray(checkpoint.effects?.npc_replies) && checkpoint.effects.npc_replies.length > 0);

const applies = (story: NormalizedStoryV2, id: ExtensionConflict): boolean =>
  id === "vectors-world-info" ? exclusiveLore(story) : id === "cc-send-if-empty" ? hasNpcReplies(story) : true;

export const extensionConflictsFor = (story: NormalizedStoryV2 | null, found: readonly ExtensionConflict[]): ExtensionConflict[] =>
  story ? found.filter((id) => applies(story, id)) : [];

export const extensionConflicts = (story: NormalizedStoryV2 | null): ExtensionConflict[] => extensionConflictsFor(story, readConflicts());
