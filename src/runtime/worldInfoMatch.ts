import { lorebookFileId } from "@utils/string";

// The one matcher the file path, the evidence flags and the scan-time spike share, so a
// scan view and a file write can never disagree about which entry a checkpoint names. Same semantics
// as `stHost/worldInfo.ts` `findLorebook` + `findMatchedLoreEntries`: the book by its file id,
// case-insensitive; the entry by its trimmed comment, exact; and only the FIRST entry that carries it.
export const bookKey = (name: string): string => lorebookFileId(name).toLowerCase();

export const sameLorebook = (name: string, world: string): boolean => {
  const wanted = bookKey(name);
  return wanted.length > 0 && wanted === world.trim().toLowerCase();
};

export interface CommentedEntry {
  world: string;
  uid: number;
  comment?: unknown;
}

export const entryComment = (entry: { comment?: unknown }): string => (typeof entry.comment === "string" ? entry.comment.trim() : "");

export function firstMatch<T extends CommentedEntry>(entries: readonly T[], lorebook: string, comment: string): T | null {
  return entries.find((entry) => sameLorebook(lorebook, entry.world) && entryComment(entry) === comment) ?? null;
}
