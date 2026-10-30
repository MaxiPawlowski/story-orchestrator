export const PLAY_COPY = {
  now: "Now",
  memory: "Memory",
  tabsLabel: "Story pages",
  popOut: (label: string) => `Pop ${label} out beside the chat`,
  briefing: "Story briefing",
  restart: "Restart story",
  restartTitle: "Restart this story?",
  restartBody: "The chat keeps its messages. Where you are in the story, what it tracks and what it remembers are cleared, and it starts again from the first scene.",
  restartKeep: "Keep playing",
  restartConfirm: "Restart story",
  openLibrary: "Open library",
} as const;
