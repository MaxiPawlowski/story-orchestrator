import { castMemberNames, type NormalizedStoryV2 } from "@engine/index";
import { getAllCharacterNames, getContext, listGroupMembers, listMutedGroupMembers, readLoreBindings } from "@services/STAPI";
import { readRequirements, type RequirementsOptions } from "./requirementsRead";
import type { MemoryMirrorBook, RequirementsState } from "./types";
import { scanGatingActive } from "./worldInfoMode";
import { storyLoreActive } from "./storyLore";

export const storyRequirements = (story: Pick<NormalizedStoryV2, "requirements" | "roster">): NormalizedStoryV2["requirements"] => {
  const members = story.requirements?.members;
  return members?.length ? { ...story.requirements, members: castMemberNames(story.roster ?? [], members) } : story.requirements;
};

export function evaluateRequirements(story: NormalizedStoryV2 | null, options: RequirementsOptions, storyMuted: string[] = []): RequirementsState {
  if (!story) return { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };
  const context = getContext();
  const persona = typeof context.name1 === "string" ? context.name1 : "";
  const requirements = storyRequirements(story);
  const members = Boolean(requirements?.members?.length);
  return readRequirements(requirements, {
    persona,
    members: members ? listGroupMembers() : [],
    muted: members ? listMutedGroupMembers() : [],
    storyMuted,
    cards: members ? getAllCharacterNames() : [],
    lore: readLoreBindings(),
  }, options);
}

export const requirementsOptions = (book: MemoryMirrorBook | null, scan = scanGatingActive()): RequirementsOptions => {
  const chatId = getContext().chatId ?? null;
  return { scan, mirrorBook: book && chatId !== null && book.chatId === chatId ? book.name : null, storyLore: storyLoreActive() };
};
