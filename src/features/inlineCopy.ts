import type { InlineCategory, InlineLevel } from "@runtime/settingsModel";
import type { InlineItem } from "@runtime/inlineTimeline";

export const INLINE_LEVEL_LABELS: Record<InlineLevel, string> = {
  0: "Off",
  1: "Story",
  2: "Behind the scenes",
  3: "Author",
  4: "Raw",
};

export const INLINE_LEVEL_SHORT: Record<InlineLevel, string> = {
  0: "Off",
  1: "Story",
  2: "Behind",
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
  heading: "Notes under messages",
  levels: "Levels",
} as const;

const counted = (one: string, many: (count: number) => string) => (count: number): string => (count === 1 ? one : many(count));

export const INLINE_LINE_WORDS: Record<InlineCategory, (count: number) => string> = {
  progress: counted("The story moved on", (count) => `The story moved on (${count})`),
  memory: counted("Remembered 1 thing", (count) => `Remembered ${count} things`),
  threads: counted("A thread changed", (count) => `${count} threads changed`),
  lore: counted("Lore used", (count) => `Lore used (${count})`),
  cast: counted("The cast changed", (count) => `The cast changed (${count})`),
  pacing: counted("The mood shifted", (count) => `The mood shifted (${count})`),
  calls: counted("1 background call", (count) => `${count} background calls`),
  health: counted("Something did not work", (count) => `${count} things did not work`),
};

export const INLINE_LINE_COPY = {
  expand: "Show what happened",
  inspect: "Inspect",
  inspectTitle: "Open this message in the inspector",
  raw: (count: number) => `${count} raw`,
} as const;
