import { gatedWorldInfo, type NormalizedStoryV2 } from "@engine/index";
import type { CuratorEntryView } from "./types";

// The whole write scope of every background curator, in one function: the story's own
// `stagecraft.lorebooks`. Nothing is inferred from requirements or from world_info effects (user
// decision), so a story that says nothing grants nothing.
export const curatorLorebooks = (story: NormalizedStoryV2 | null): string[] =>
  (story?.stagecraft?.lorebooks ?? []).map((name) => name.trim()).filter(Boolean);

export const curatorHasScope = (story: NormalizedStoryV2 | null): boolean => curatorLorebooks(story).length > 0;

// An entry some checkpoint switches belongs to the story's world_info effects, which rebuild its
// flag from the chat's path at every checkpoint: a curator write there would be undone, or undo it.
export const isCheckpointGated = (story: NormalizedStoryV2 | null, lorebook: string, comment: string): boolean => {
  const book = lorebook.trim().toLowerCase();
  const wanted = comment.trim().toLowerCase();
  return [...gatedWorldInfo(story ? [story] : [])].some(([name, comments]) =>
    name.toLowerCase() === book && [...comments].some((gated) => gated.toLowerCase() === wanted));
};

// A write is legal only if the entry sits in an allowlisted book, is not checkpoint-gated, *and* was
// in the scope the curator was shown. The parser already enforces the last part; this is the check
// at the write edge.
export const isCuratorWritable = (story: NormalizedStoryV2 | null, lorebook: string, comment: string): boolean => {
  const wanted = lorebook.trim().toLowerCase();
  return Boolean(wanted) && curatorLorebooks(story).some((name) => name.toLowerCase() === wanted) && !isCheckpointGated(story, lorebook, comment);
};

export const entriesForScope = (lorebook: string, entries: Array<{ uid?: unknown; comment?: string; content?: unknown; key?: unknown; disable?: unknown }>): CuratorEntryView[] =>
  entries
    .filter((entry) => typeof entry.comment === "string" && entry.comment.trim().length > 0)
    .map((entry) => ({
      lorebook,
      comment: (entry.comment ?? "").trim(),
      keys: Array.isArray(entry.key) ? entry.key.filter((key): key is string => typeof key === "string") : [],
      content: typeof entry.content === "string" ? entry.content : "",
      disabled: entry.disable === true,
      ...(typeof entry.uid === "number" && Number.isInteger(entry.uid) ? { uid: entry.uid } : {}),
    }));

export const entryRef = (entry: CuratorEntryView, entries: CuratorEntryView[]): string | null => {
  if (entry.uid === undefined) return null;
  const clash = entries.some((other) => other !== entry && other.uid === entry.uid && other.lorebook.toLowerCase() !== entry.lorebook.toLowerCase());
  if (!clash) return `#${entry.uid}`;
  const books = [...new Set(entries.map((other) => other.lorebook.toLowerCase()))];
  return `#${books.indexOf(entry.lorebook.toLowerCase()) + 1}.${entry.uid}`;
};

export const viewForOp = (entries: CuratorEntryView[], op: { lorebook: string; comment: string; uid?: number }): CuratorEntryView | undefined => {
  const book = op.lorebook.toLowerCase();
  if (op.uid !== undefined) return entries.find((entry) => entry.lorebook.toLowerCase() === book && entry.uid === op.uid);
  return entries.find((entry) => entry.lorebook.toLowerCase() === book && entry.comment.toLowerCase() === op.comment.toLowerCase());
};
