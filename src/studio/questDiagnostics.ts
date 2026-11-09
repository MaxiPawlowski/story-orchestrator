import type { Story } from "@engine/index";
import { consequenceWriteConflicts } from "./questMatrix";

type QuestCode = "consequence-write-conflict" | "quest-label-long";

export const QUEST_LABEL_SOFT_MAX = 40;

export const QUEST_CONSEQUENCES: Record<QuestCode, string> = {
  "consequence-write-conflict": "When both quests close in the same reply, only one value is written: the quest whose id sorts first wins, whatever order they were written in.",
  "quest-label-long": "A long ending or consequence label wraps in the Journal and the recap; players read it at a glance.",
};

export interface QuestRun {
  draft: Story;
  push: (code: QuestCode, severity: "warning", path: string, message: string) => void;
}

export const checkQuestDiagnostics = ({ draft, push }: QuestRun) => {
  (draft.quests ?? []).forEach((quest, index) => (quest.resolutions ?? []).forEach((resolution, at) => {
    const path = `quests.${index}.resolutions.${at}`;
    const labels: Array<[string, string | undefined]> = [[`${path}.label`, resolution.label],
      ...(resolution.consequences ?? []).map((consequence, slot): [string, string | undefined] => [`${path}.consequences.${slot}.label`, consequence.label])];
    labels.forEach(([where, label]) => {
      if (label && label.length > QUEST_LABEL_SOFT_MAX) push("quest-label-long", "warning", where, `“${label}” is ${label.length} characters; keep labels to ${QUEST_LABEL_SOFT_MAX}`);
    });
  }));
  consequenceWriteConflicts(draft).forEach(({ key, quests }) =>
    push("consequence-write-conflict", "warning", "quests", `${quests.map((id) => `'${id}'`).join(" and ")} can each write a value to ${key}`));
};
