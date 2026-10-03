import type { InlineCategory, InlineLevel } from "@runtime/settingsModel";
import type { InlineItem } from "@runtime/inlineTimeline";

export const INLINE_LEVEL_LABELS: Record<InlineLevel, string> = {
  0: "Off",
  1: "Story",
  2: "Behind the scenes",
  3: "Author",
  4: "Raw",
};

export const INLINE_LEVEL_HELP: Record<InlineLevel, string> = {
  0: "No notes under messages.",
  1: "Where the story moved and what it remembered.",
  2: "Also what the story is keeping track of in the background. Still no spoilers.",
  3: "Everything, with details and actions. Only while Author view is on.",
  4: "Everything, unfiltered. Only while Author view is on.",
};

export const INLINE_CATEGORY_HELP: Record<InlineCategory, string> = {
  progress: "The story moved on, or what it is waiting for.",
  memory: "Something the story will remember.",
  threads: "A story thread opened or was resolved.",
  lore: "Lorebook entries used for this reply.",
  cast: "Who joined, left, or was chosen to speak.",
  pacing: "How tense the scene is.",
  calls: "Background model calls made for this reply.",
  health: "Something did not work as it should.",
};

export const INLINE_STATE_LABELS: Record<InlineItem["state"], string> = {
  live: "In progress",
  pending: "Waiting for the next reply",
  applied: "Done",
  refused: "Not applied",
};

export const INLINE_LEGEND_COPY = {
  toggle: "What do these icons mean?",
  heading: "Notes under messages",
  levels: "Levels",
} as const;
