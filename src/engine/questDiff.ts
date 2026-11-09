import { questClosedKey, questConsequenceKey, type NormalizedStory, type PrimitiveValue, type Quest } from "./schema";
import { questEndings } from "./quests";

type QuestDiffCode = "quest-removed" | "quest-removed-closed" | "quest-resolution-removed-reached" | "quest-consequence-changed-applied" | "quest-consequence-effects-changed-applied";

export interface QuestDiffContext {
  previous: NormalizedStory;
  next: NormalizedStory;
  values: Record<string, PrimitiveValue>;
  push: (kind: "compatible" | "invalidating", code: QuestDiffCode, path: string, message: string) => void;
}

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify([left]) === JSON.stringify([right]);

export const diffQuests = ({ previous, next, values, push }: QuestDiffContext) => {
  const after = new Map((next.quests ?? []).map((quest) => [quest.id, quest]));
  for (const quest of previous.quests ?? []) {
    const kept = after.get(quest.id);
    const closed = values[questClosedKey(quest.id)];
    if (!kept) {
      if (typeof closed === "string") push("invalidating", "quest-removed-closed", `quests.${quest.id}`, `“${quest.title}” is gone from the story, and this chat already closed it (${closed}).`);
      else push("compatible", "quest-removed", `quests.${quest.id}`, `“${quest.title}” left the story; this chat stops tracking it.`);
      continue;
    }
    if (typeof closed === "string" && !questEndings(kept, true).some((ending) => ending.id === closed)) {
      push("invalidating", "quest-resolution-removed-reached", `quests.${quest.id}.resolutions.${closed}`,
        `“${quest.title}” no longer has the ending ${closed}, and this chat already reached it.`);
    }
    diffConsequences(quest, kept, values, push);
  }
};

const consequenceRows = (quest: Quest) => questEndings(quest, true).flatMap((ending) => ending.consequences.map((consequence) => ({
  ending: ending.id, consequence, key: questConsequenceKey(quest.id, ending.id, consequence.id),
})));

const diffConsequences = (quest: Quest, kept: Quest, values: QuestDiffContext["values"], push: QuestDiffContext["push"]) => {
  const next = new Map(consequenceRows(kept).map((row) => [row.key, row.consequence]));
  for (const row of consequenceRows(quest)) {
    if (typeof values[row.key] !== "number") continue;
    const after = next.get(row.key);
    if (sameValue(row.consequence, after)) continue;
    const at = `quests.${quest.id}.resolutions.${row.ending}.consequences.${row.consequence.id}`;
    if (row.consequence.effects && !sameValue(row.consequence.effects, after?.effects)) {
      push("invalidating", "quest-consequence-effects-changed-applied", at,
        `A consequence of “${quest.title}” this chat already received changed what it switches on; keep the old one or restart.`);
    } else push("compatible", "quest-consequence-changed-applied", at, `A consequence of “${quest.title}” changed; this chat already received the old one and is not given the new one.`);
  }
};
