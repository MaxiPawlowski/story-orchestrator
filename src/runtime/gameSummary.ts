import { GAME_TEXT } from "@features/gameCopy";
import type { GameView, QuestView } from "./gameTypes";

export const NO_QUESTS = "This story keeps no quests.";

const questLine = (quest: QuestView): string => {
  const progress = quest.progress ? ` (${quest.progress.value}/${quest.progress.of})` : "";
  const steps = quest.steps.map((step) => `    ${step.status === "done" ? "✔" : step.status === "failed" ? "✘" : "○"} ${step.text}`);
  return [`• ${quest.title}: ${quest.statusLabel}${progress}`, ...steps].join("\n");
};

export function gameSummaryText(game: GameView | null | undefined): string {
  if (!game) return NO_QUESTS;
  const sections = [
    game.mainLine.current ? [`${GAME_TEXT.mainLine}`, `  ${GAME_TEXT.mainLineNow}: ${game.mainLine.current}${game.mainLine.objective ? ` — ${game.mainLine.objective}` : ""}`] : [],
    game.quests.length ? [GAME_TEXT.quests, ...game.quests.map(questLine)] : [],
    ...game.sheet.map((group) => [group.label, ...group.items.map((item) => `  ${item.label}${item.text ? `: ${item.text}` : ""}`)]),
    game.milestones.length ? [GAME_TEXT.milestones, ...game.milestones.map((milestone) => `  ${milestone.earned ? "★" : "☆"} ${milestone.title}`)] : [],
  ].filter((section) => section.length);
  return sections.length ? sections.map((section) => section.join("\n")).join("\n\n") : GAME_TEXT.journalEmpty;
}
