import type { NormalizedStoryV2 } from "@engine/index";
import { getContext, listGroupMembers, listMutedGroupMembers, readLoreBindings } from "@services/STAPI";
import { readRequirements, type RequirementsOptions } from "./requirementsRead";
import type { MemoryMirrorBook, RequirementsState } from "./types";
import { scanGatingActive } from "./worldInfoMode";

export function evaluateRequirements(story: NormalizedStoryV2 | null, options: RequirementsOptions, storyMuted: string[] = []): RequirementsState {
  if (!story) return { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };
  const context = getContext();
  const persona = typeof context.name1 === "string" ? context.name1 : "";
  const members = Boolean(story.requirements?.members?.length);
  return readRequirements(story.requirements, {
    persona, members: members ? listGroupMembers() : [], muted: members ? listMutedGroupMembers() : [], storyMuted, lore: readLoreBindings(),
  }, options);
}

export const requirementsOptions = (book: MemoryMirrorBook | null, scan = scanGatingActive()): RequirementsOptions => {
  const chatId = getContext().chatId ?? null;
  return { scan, mirrorBook: book && chatId !== null && book.chatId === chatId ? book.name : null };
};
