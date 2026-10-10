import type { NormalizedStoryV2 } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { clampLateLoreDepth } from "./settingsModel";
import { storyLoreBooks } from "./storyLore";
import { isMemoryMirrorBook } from "./worldInfoGates";
import { bookKey } from "./worldInfoMatch";

export const WI_POSITION_BEFORE_CHAR = 0;
export const WI_POSITION_AFTER_CHAR = 1;
export const WI_POSITION_AT_DEPTH = 4;
export const WI_ROLE_SYSTEM = 0;

export type LorePlacementRefusal = "setting-off" | "story-off" | "not-owned" | "no-books";

export interface LorePlacementSources {
  enabled: () => boolean;
  depth: () => number;
  story: () => NormalizedStoryV2 | null;
  chatId: () => string | null;
  ownedChat: () => string | null;
}

export type LorePlacementPlan =
  | { refusal: LorePlacementRefusal }
  | { refusal: null; books: Set<string>; depth: number };

export interface LorePlacementStats {
  moved: number;
  before: number;
  after: number;
  constant: number;
}

export function lorePlacementBooks(story: NormalizedStoryV2): Set<string> {
  const books = [...storyLoreBooks(story), ...(story.lore_select?.lorebooks ?? [])].filter((book) => !isMemoryMirrorBook(book));
  return new Set(books.map(bookKey).filter(Boolean));
}

export function lorePlacementFor(sources: LorePlacementSources): LorePlacementPlan {
  if (!sources.enabled()) return { refusal: "setting-off" };
  const story = sources.story();
  const chatId = sources.chatId();
  if (!story || chatId === null || chatId !== sources.ownedChat()) return { refusal: "not-owned" };
  if (story.lore_select?.position === "authored") return { refusal: "story-off" };
  const books = lorePlacementBooks(story);
  if (!books.size) return { refusal: "no-books" };
  return { refusal: null, books, depth: clampLateLoreDepth(sources.depth()) };
}

const emptyStats = (): LorePlacementStats => ({ moved: 0, before: 0, after: 0, constant: 0 });

export function applyLorePlacement(arrays: HostScannableEntry[][], plan: LorePlacementPlan): LorePlacementStats {
  const stats = emptyStats();
  if (plan.refusal !== null) return stats;
  for (const entry of arrays.flat()) {
    if (typeof entry?.world !== "string" || entry.disable === true || !plan.books.has(bookKey(entry.world))) continue;
    const position = Number(entry.position);
    if (position !== WI_POSITION_BEFORE_CHAR && position !== WI_POSITION_AFTER_CHAR) continue;
    if (entry.constant === true) {
      stats.constant += 1;
      continue;
    }
    const before = position === WI_POSITION_BEFORE_CHAR;
    entry.position = WI_POSITION_AT_DEPTH;
    entry.depth = before ? plan.depth + 1 : plan.depth;
    entry.role = WI_ROLE_SYSTEM;
    stats.moved += 1;
    stats[before ? "before" : "after"] += 1;
  }
  return stats;
}
