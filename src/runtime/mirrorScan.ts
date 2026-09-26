import type { HostScannableEntry, Lorebook } from "@services/STAPI";
import { MIRROR_BOOK_PREFIX } from "./mirrorReaper";
import type { MemoryMirrorBook } from "./types";
import { bookKey } from "./worldInfoMatch";
import { log } from "@utils/log";

const MIRROR_PREFIX = "so_";
const CHAT_LORE = 2;

export interface MirrorOwnerSources {
  chatId: string | null;
  ownedChat: string | null;
  hasStory: boolean;
  book: MemoryMirrorBook | null;
}

export const mirrorBookFor = (sources: MirrorOwnerSources): string | null =>
  sources.hasStory && sources.chatId !== null && sources.chatId === sources.ownedChat && sources.book?.chatId === sources.chatId
    ? sources.book.name
    : null;

export const mirrorScanEntries = (name: string, book: Lorebook | null): HostScannableEntry[] =>
  Object.values(book?.entries ?? {})
    .filter((entry) => entry.disable !== true && typeof entry.comment === "string" && entry.comment.trim().startsWith(MIRROR_PREFIX))
    .map(({ uid, ...rest }) => ({ ...structuredClone(rest), uid, world: name, content: typeof rest.content === "string" ? rest.content : "" }));

export function appendMirrorEntries(arrays: HostScannableEntry[][], name: string, entries: HostScannableEntry[]): number {
  const key = bookKey(name);
  if (!key || !entries.length || !arrays[CHAT_LORE]) return 0;
  if (arrays.some((list) => list.some((entry) => typeof entry.world === "string" && entry.world.trim().toLowerCase() === key))) return 0;
  for (const entry of entries) arrays[CHAT_LORE].push(structuredClone(entry));
  return entries.length;
}

export class MirrorScanCache {
  private held: { name: string; entries: HostScannableEntry[] } | null = null;
  private latest = 0;

  constructor(private readonly load: (name: string) => Promise<Lorebook | null>) {}

  async refresh(name: string | null): Promise<void> {
    const ticket = ++this.latest;
    if (!name) {
      this.held = null;
      return;
    }
    const book = await this.load(name);
    if (ticket !== this.latest) return;
    this.held = book ? { name, entries: mirrorScanEntries(name, book) } : null;
  }

  take(name: string, book: Lorebook): void {
    this.latest += 1;
    this.held = { name, entries: mirrorScanEntries(name, book) };
  }

  holds(name: string): boolean {
    return this.entriesFor(name) !== null;
  }

  entriesFor(name: string): HostScannableEntry[] | null {
    return this.held && bookKey(this.held.name) === bookKey(name) ? this.held.entries : null;
  }
}

export interface MirrorScanSources {
  owner: () => MirrorOwnerSources;
  load: (name: string) => Promise<Lorebook | null>;
}

const isLorebook = (value: unknown): value is Lorebook =>
  Boolean(value) && typeof value === "object" && Boolean((value as { entries?: unknown }).entries) && typeof (value as { entries?: unknown }).entries === "object";

const adoptsFor = (sources: MirrorOwnerSources, name: string): boolean =>
  sources.hasStory && sources.chatId !== null && sources.chatId === sources.ownedChat && sources.book === null
  && name.startsWith(MIRROR_BOOK_PREFIX) && name.endsWith(` - ${sources.chatId}`);

export function createMirrorScan(sources: MirrorScanSources) {
  const cache = new MirrorScanCache(sources.load);
  let loading: { name: string; done: Promise<void> } | null = null;
  const fetch = (name: string) => {
    if (loading?.name === name) return;
    const done = cache.refresh(name).catch((error: unknown) => log.warn("the memory mirror copy for scans could not be loaded", error)).finally(() => { if (loading?.done === done) loading = null; });
    loading = { name, done };
  };
  return {
    append(arrays: HostScannableEntry[][]): number {
      const name = mirrorBookFor(sources.owner());
      if (!name) return 0;
      const entries = cache.entriesFor(name);
      if (!entries) {
        fetch(name);
        return 0;
      }
      return appendMirrorEntries(arrays, name, entries);
    },
    updated(name: string, data: unknown): void {
      if (!isLorebook(data)) return;
      const owner = sources.owner();
      const wanted = mirrorBookFor(owner);
      if ((wanted !== null && bookKey(wanted) === bookKey(name)) || adoptsFor(owner, name)) cache.take(name, data);
    },
    settled: async (): Promise<void> => { await loading?.done; },
  };
}
