import type { QuestStatus } from "@engine/index";

export const GAME_TEXT = {
  journalTitle: "Journal",
  statSheetTitle: "Stat sheet",
  mainLine: "Main line",
  mainLineDone: "Reached",
  mainLineNow: "Now",
  quests: "Quests",
  log: "Log",
  milestones: "Milestones",
  reward: "Reward",
  outcome: "Outcome",
  from: "From",
  journalEmpty: "Nothing to show yet. Quests appear here once you find them.",
  statSheetEmpty: "Nothing to show yet.",
  clockFull: "Full",
  authorHeading: "Author view",
  authorHidden: "Not found yet",
  authorOverflow: "Left out of this read",
  wandJournal: "Journal",
  wandStatSheet: "Stat sheet",
  noticed: "Noticed",
  noticedEmpty: "Nothing noticed yet.",
  noticeLead: "You notice:",
  noticeMore: "more in the Journal",
  noticedJump: "Show in chat",
};

export const QUEST_MOVE_TEXT = {
  offered: "Quest offered",
  active: "Quest started",
  done: "Quest completed",
  failed: "Quest failed",
  lapsed: "Offer lapsed",
  closed: "Quest resolved",
} as const;

const QUEST_WORDS: Readonly<Record<string, string>> = QUEST_MOVE_TEXT;

export const questStatusWord = (status: QuestStatus, label?: string): string => {
  if (status === "offered" || status === "active") return QUEST_WORDS[status];
  return label ?? QUEST_WORDS[status] ?? QUEST_MOVE_TEXT.closed;
};

export const questMoveText = (status: QuestStatus, title: string, label?: string): string => `${questStatusWord(status, label)}: ${title}`;
