import type { NormalizedStoryV2 } from "@engine/index";
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

export const tunnelVisionFor = (story: NormalizedStoryV2 | null, books: readonly TunnelVisionBook[]): TunnelVisionBook[] => {
  if (!story) return [];
  const owned = new Set([
    ...storyLoreBooks(story),
    ...story.stagecraft?.lorebooks ?? [],
    ...story.lore_select?.lorebooks ?? [],
  ]);
  return books.filter((book) => owned.has(book.name));
};

export const tunnelVision = (story: NormalizedStoryV2 | null): TunnelVisionBook[] => tunnelVisionFor(story, readBooks());
