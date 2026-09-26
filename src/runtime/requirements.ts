import type { NormalizedStoryV2 } from "@engine/index";
import { getContext, listGroupMembers, readLoreBindings } from "@services/STAPI";
import { readRequirements, type RequirementsOptions } from "./requirementsRead";
import type { MemoryMirrorBook, RequirementsState } from "./types";
import { scanGatingActive } from "./worldInfoMode";

export function evaluateRequirements(story: NormalizedStoryV2 | null, options: RequirementsOptions): RequirementsState {
  if (!story) return { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };
  const context = getContext();
  const persona = typeof context.name1 === "string" ? context.name1 : "";
  return readRequirements(story.requirements, { persona, members: story.requirements?.members?.length ? listGroupMembers() : [], lore: readLoreBindings() }, options);
}

// Which chat-slot reading applies: scan mode frees the slot, and in file mode only this chat's own
// mirror book may hold it without a conflict.
export const requirementsOptions = (book: MemoryMirrorBook | null, scan = scanGatingActive()): RequirementsOptions => {
  const chatId = getContext().chatId ?? null;
  return { scan, mirrorBook: book && chatId !== null && book.chatId === chatId ? book.name : null };
};
