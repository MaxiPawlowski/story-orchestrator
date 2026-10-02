import { isRecord } from "@utils/guards";
import type { HostScannableEntry } from "@services/STAPI";
import { isMemoryMirrorBook } from "./worldInfoGates";
import { bookKey } from "./worldInfoMatch";

const GLOBAL_LORE = 0;

export interface StoryLoreOwner {
  chatId: string | null;
  ownedChat: string | null;
  story: unknown | null;
}

export interface StoryLoreBook {
  name: string;
  entries: HostScannableEntry[];
}

export interface StoryLoreSources {
  owner: () => StoryLoreOwner;
  load: (name: string) => Promise<StoryLoreBook | null>;
}

export interface StoryLoreScan {
  owner: "story" | "no-story";
  appended: number;
  books: string[];
  skipped: string[];
  missing: string[];
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value : [])
  .filter((entry): entry is string => typeof entry === "string")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

export function storyLoreBooks(story: unknown): string[] {
  const requirements = isRecord(story) && isRecord(story.requirements) ? story.requirements : null;
  const seen = new Set<string>();
  return strings(requirements?.lorebooks).filter((book) => {
    const key = bookKey(book);
    if (!key || seen.has(key) || isMemoryMirrorBook(book)) return false;
    seen.add(key);
    return true;
  });
}

const ownedChatOf = (owner: StoryLoreOwner): string | null =>
  owner.story !== null && owner.chatId !== null && owner.chatId === owner.ownedChat ? owner.chatId : null;

export const storyLoreFor = (owner: StoryLoreOwner): string[] => (ownedChatOf(owner) === null ? [] : storyLoreBooks(owner.story));

export const scannedBooks = (arrays: HostScannableEntry[][]): Set<string> =>
  new Set(arrays.flatMap((list) => list.map((entry) => (typeof entry?.world === "string" ? bookKey(entry.world) : ""))).filter(Boolean));

export function appendStoryLore(arrays: HostScannableEntry[][], books: StoryLoreBook[]): number {
  const target = arrays[GLOBAL_LORE];
  if (!target) return 0;
  const scanned = scannedBooks(arrays);
  let appended = 0;
  for (const book of books) {
    const key = bookKey(book.name);
    if (!key || scanned.has(key)) continue;
    scanned.add(key);
    for (const entry of book.entries) target.push({ ...entry, world: book.name });
    appended += book.entries.length;
  }
  return appended;
}

export function createStoryLore(sources: StoryLoreSources) {
  let last: StoryLoreScan | null = null;
  return {
    async append(arrays: HostScannableEntry[][]): Promise<StoryLoreScan> {
      const owner = sources.owner();
      const chat = ownedChatOf(owner);
      const wanted = storyLoreFor(owner);
      if (chat === null || !wanted.length) {
        last = { owner: chat === null ? "no-story" : "story", appended: 0, books: [], skipped: [], missing: [] };
        return last;
      }
      const scanned = scannedBooks(arrays);
      const skipped = wanted.filter((book) => scanned.has(bookKey(book)));
      const loaded = await Promise.all(wanted.filter((book) => !scanned.has(bookKey(book))).map(async (book) => ({ book, found: await sources.load(book) })));
      if (ownedChatOf(sources.owner()) !== chat) {
        last = { owner: "no-story", appended: 0, books: [], skipped: [], missing: [] };
        return last;
      }
      const found = loaded.flatMap((row) => (row.found ? [row.found] : []));
      last = {
        owner: "story",
        appended: appendStoryLore(arrays, found),
        books: found.map((book) => book.name),
        skipped,
        missing: loaded.filter((row) => !row.found).map((row) => row.book),
      };
      return last;
    },
    last: (): StoryLoreScan | null => last,
  };
}

export function globalStoryBooks(selected: string[], library: unknown[], kept: string[]): string[] {
  const required = new Set(library.flatMap((story) => storyLoreBooks(story).map(bookKey)));
  const keep = new Set(kept.map(bookKey));
  return selected.filter((book) => required.has(bookKey(book)) && !keep.has(bookKey(book)));
}

let readGlobalStoryBooks: () => string[] = () => [];

export const readGlobalStoryBooksWith = (read: () => string[]): (() => void) => {
  readGlobalStoryBooks = read;
  return () => {
    if (readGlobalStoryBooks === read) readGlobalStoryBooks = () => [];
  };
};

export const globalStoryLore = (): string[] => readGlobalStoryBooks();

let storyLoreScanned = false;

export const setStoryLoreScanned = (on: boolean): void => {
  storyLoreScanned = on;
};

export const storyLoreActive = (): boolean => storyLoreScanned;
