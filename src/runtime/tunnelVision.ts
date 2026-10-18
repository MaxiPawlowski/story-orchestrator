import type { NormalizedStory } from "@engine/index";
import type { TunnelVisionBook } from "@services/stHost/tunnelVision";
import { storyLoreBooks } from "./storyLore";

export type { TunnelVisionBook };

let readBooks: () => TunnelVisionBook[] = () => [];

export const readTunnelVisionWith = (read: () => TunnelVisionBook[]): (() => void) => {
  readBooks = read;
  return () => {
    if (readBooks === read) readBooks = () => [];
  };
};

export const tunnelVisionFor = (story: NormalizedStory | null, books: readonly TunnelVisionBook[]): TunnelVisionBook[] => {
  if (!story) return [];
  const owned = new Set([
    ...storyLoreBooks(story),
    ...story.stagecraft?.lorebooks ?? [],
    ...story.lore_select?.lorebooks ?? [],
  ]);
  return books.filter((book) => owned.has(book.name));
};

export const tunnelVision = (story: NormalizedStory | null): TunnelVisionBook[] => tunnelVisionFor(story, readBooks());
