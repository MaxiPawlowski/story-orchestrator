import { Blackboard } from "./blackboard";
import { applyQuestResolutions, decideQuest, questEnding, questLifecycle, shownConsequenceLabels, valueReader } from "./quests";
import { questConsequenceKey, type NormalizedStory, type PrimitiveValue, type Quest } from "./schema";

export interface SimulatedConsequence {
  id: string;
  applied: boolean;
  label: string | null;
  shown: boolean;
}

export interface QuestSimulation {
  questId: string;
  lifecycle: string;
  matched: string[];
  held: boolean;
  resolution: string | null;
  consequences: SimulatedConsequence[];
  writes: Array<{ key: string; before: PrimitiveValue | null; after: PrimitiveValue | null }>;
  player: { status: string | null; outcomes: string[] };
}

const forced = (quest: Quest, resolutionId: string): Quest | null => {
  const ending = questEnding(quest, resolutionId);
  if (!ending) return null;
  return {
    id: quest.id, title: quest.title, kind: "side", steps: [],
    resolutions: [{ id: ending.id, when: { all: [] }, from: ["offered", "active"], consequences: [...ending.consequences], ...(ending.label ? { label: ending.label } : {}) }],
  };
};

export const simulateQuest = (story: NormalizedStory, questId: string, values: Readonly<Record<string, PrimitiveValue>>, on = true, force?: string): QuestSimulation | null => {
  const authored = (story.quests ?? []).find((candidate) => candidate.id === questId);
  const quest = authored && force ? forced(authored, force) : authored;
  if (!quest) return null;
  const start = Object.fromEntries(Object.entries(values).filter(([key]) => story.qualityByKey[key]));
  const board = new Blackboard(story, { values: { ...start }, versions: {}, latched: {} });
  const reader = valueReader(start);
  const decision = decideQuest(quest, reader, on);
  applyQuestResolutions({ quests: [quest], qualityByKey: story.qualityByKey }, board, 1, on);
  const after = board.entries();
  const shown = new Set(shownConsequenceLabels(quest, valueReader(after)));
  const ending = decision.ending ? questEnding(quest, decision.ending.id) : null;
  const consequences = (ending?.consequences ?? []).map((consequence) => {
    const applied = typeof after[questConsequenceKey(quest.id, ending?.id ?? "", consequence.id)] === "number";
    return { id: consequence.id, applied, label: consequence.label ?? null, shown: applied && Boolean(consequence.label && shown.has(consequence.label)) };
  });
  const keys = [...new Set([...Object.keys(start), ...Object.keys(after)])].filter((key) => start[key] !== after[key]).sort();
  return {
    questId, lifecycle: questLifecycle(quest, reader), matched: decision.matched, held: decision.held, resolution: decision.ending?.id ?? null, consequences,
    writes: keys.map((key) => ({ key, before: start[key] ?? null, after: after[key] ?? null })),
    player: { status: ending ? ending.label ?? ending.id : null, outcomes: [...shown] },
  };
};
