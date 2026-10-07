import type { QuestStatus } from "@engine/index";

export const GAME_TEXT = {
  journalTitle: "Journal",
  journalOpen: "Journal",
  statSheetTitle: "Stat sheet",
  statSheetOpen: "Stat sheet",
  widgetsOpen: "Story panels",
  mainLine: "Main line",
  mainLineDone: "Reached",
  mainLineNow: "Now",
  quests: "Quests",
  log: "Log",
  milestones: "Milestones",
  reward: "Reward",
  from: "From",
  journalEmpty: "Nothing to show yet. Quests appear here once you find them.",
  statSheetEmpty: "Nothing to show yet.",
  clockFull: "Full",
  authorHeading: "Author view",
  authorHidden: "Not found yet",
  authorOverflow: "Left out of this read",
  wandJournal: "Journal",
  wandStatSheet: "Stat sheet",
};

export const QUEST_MOVE_TEXT: Record<Exclude<QuestStatus, "hidden">, string> = {
  offered: "Quest offered",
  active: "Quest started",
  done: "Quest completed",
  failed: "Quest failed",
};

export const questMoveText = (status: Exclude<QuestStatus, "hidden">, title: string, labels?: { done?: string; failed?: string }): string => {
  const verb = status === "done" ? labels?.done ?? QUEST_MOVE_TEXT.done : status === "failed" ? labels?.failed ?? QUEST_MOVE_TEXT.failed : QUEST_MOVE_TEXT[status];
  return `${verb}: ${title}`;
};
