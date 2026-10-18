import type { NormalizedStory } from "@engine/index";
import type { ExtensionConflict } from "@services/stHost/extensionConflicts";

export type { ExtensionConflict };

let readConflicts: () => ExtensionConflict[] = () => [];

export const readExtensionConflictsWith = (read: () => ExtensionConflict[]): (() => void) => {
  readConflicts = read;
  return () => {
    if (readConflicts === read) readConflicts = () => [];
  };
};

const exclusiveLore = (story: NormalizedStory | null): boolean => Boolean(story?.lore_select?.exclusive && story.lore_select.lorebooks.length);

const hasNpcReplies = (story: NormalizedStory): boolean =>
  (story.checkpoints ?? []).some((checkpoint) => Array.isArray(checkpoint.effects?.npc_replies) && checkpoint.effects.npc_replies.length > 0);

const hasLorebooks = (story: NormalizedStory): boolean => (story.requirements?.lorebooks ?? []).length > 0;

const applies = (story: NormalizedStory, id: ExtensionConflict): boolean =>
  id === "vectors-world-info" ? exclusiveLore(story) : id === "cc-send-if-empty" ? hasNpcReplies(story) : id === "nemo-lorebook-spacing" ? hasLorebooks(story) : true;

export const extensionConflictsFor = (story: NormalizedStory | null, found: readonly ExtensionConflict[]): ExtensionConflict[] =>
  story ? found.filter((id) => applies(story, id)) : [];

export const extensionConflicts = (story: NormalizedStory | null): ExtensionConflict[] => extensionConflictsFor(story, readConflicts());
