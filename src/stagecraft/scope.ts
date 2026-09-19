import type { NormalizedStoryV2 } from "@engine/index";
import type { CuratorEntryView } from "./types";

// The whole write scope of every background curator, in one function: the story's own
// `stagecraft.lorebooks`. Nothing is inferred from requirements or from world_info effects (user
// decision 2026-08-11), so a story that says nothing grants nothing.
export const curatorLorebooks = (story: NormalizedStoryV2 | null): string[] =>
  (story?.stagecraft?.lorebooks ?? []).map((name) => name.trim()).filter(Boolean);

export const curatorHasScope = (story: NormalizedStoryV2 | null): boolean => curatorLorebooks(story).length > 0;

// A write is legal only if the entry sits in an allowlisted book *and* was in the scope the curator
// was shown. The parser already enforces the second half; this is the check at the write edge.
export const isCuratorWritable = (story: NormalizedStoryV2 | null, lorebook: string): boolean => {
  const wanted = lorebook.trim().toLowerCase();
  return Boolean(wanted) && curatorLorebooks(story).some((name) => name.toLowerCase() === wanted);
};

export const entriesForScope = (lorebook: string, entries: Array<{ comment?: string; content?: unknown; key?: unknown; disable?: unknown }>): CuratorEntryView[] =>
  entries
    .filter((entry) => typeof entry.comment === "string" && entry.comment.trim().length > 0)
    .map((entry) => ({
      lorebook,
      comment: (entry.comment ?? "").trim(),
      keys: Array.isArray(entry.key) ? entry.key.filter((key): key is string => typeof key === "string") : [],
      content: typeof entry.content === "string" ? entry.content : "",
      disabled: entry.disable === true,
    }));
