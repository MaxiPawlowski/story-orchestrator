import { couldNot, type WriteResult } from "@utils/writeResult";
import { worldInfoModule } from "./modules";
import { disableWIEntry, enableWIEntry, findLorebook, readServerLorebook } from "./worldInfo";

// v2.5 plan 01 B. What a listed book's FILE holds per gated comment: the first entry carrying it (the entry the
// file path flips, 05-H4), `true`/`false` for its `disable` flag and `null` when it has none. Read from the
// server, not `loadWorldInfo`: the cache (world-info.js:2041-2042) keeps a copy older than a write made through
// the API. An unlisted name is never asked for, because `/api/worldinfo/get` answers it with a dummy
// (src/endpoints/worldinfo.js:17-31, 71-79).
export async function readLorebookEntries(name: string): Promise<Map<string, boolean | null> | null> {
  const listed = findLorebook(name);
  if (!listed) return null;
  const book = await readServerLorebook(listed);
  if (!book) return null;
  const entries = new Map<string, boolean | null>();
  for (const entry of Object.values(book.entries)) {
    const comment = typeof entry.comment === "string" ? entry.comment.trim() : "";
    if (!comment || entries.has(comment)) continue;
    entries.set(comment, Object.prototype.hasOwnProperty.call(entry, "disable") ? entry.disable === true : null);
  }
  return entries;
}

// v2.5 plan 01 A. The normaliser, its re-normalise and the removal restore read the SERVER's file first, so the
// write must start from it too: `setWIEntryDisabledState` edits the cached copy, and a copy older than an API
// write would answer "already off" and write nothing. Evicting one book makes the next `loadWorldInfo` fetch it
// (world-info.js:2041-2055); the write is then the usual typed, read-back one.
export async function setLorebookEntriesDisabled(name: string, comments: string[], disabled: boolean): Promise<WriteResult<{ changed: boolean; confirmed?: boolean }>> {
  const listed = findLorebook(name);
  if (!listed) return couldNot(`there is no lorebook "${name}"`);
  worldInfoModule.worldInfoCache.delete(listed);
  return disabled ? disableWIEntry(listed, comments) : enableWIEntry(listed, comments);
}
