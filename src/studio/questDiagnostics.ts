import type { Story } from "@engine/index";
import { consequenceWriteConflicts } from "./questMatrix";

type QuestCode = "consequence-write-conflict";

export const QUEST_CONSEQUENCES: Record<QuestCode, string> = {
  "consequence-write-conflict": "When both quests close in the same reply, only one value is written: the quest whose id sorts first wins, whatever order they were written in.",
};

export interface QuestRun {
  draft: Story;
  push: (code: QuestCode, severity: "warning", path: string, message: string) => void;
}

export const checkQuestDiagnostics = ({ draft, push }: QuestRun) => {
  consequenceWriteConflicts(draft).forEach(({ key, quests }) =>
    push("consequence-write-conflict", "warning", "quests", `${quests.map((id) => `'${id}'`).join(" and ")} can each write a value to ${key}`));
};
