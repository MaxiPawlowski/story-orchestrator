import type { Blackboard } from "./blackboard";
import { evaluateGate, gateKeys, type GateReader } from "./gates";
import { questClosedKey, questRewardKey, type GateNode, type Milestone, type NormalizedStoryV2, type Quest, type QuestStep } from "./schema";

export type QuestStatus = "hidden" | "offered" | "active" | "done" | "failed";
export type StepStatus = "hidden" | "open" | "done" | "failed";

const holds = (gate: GateNode | undefined, reader: GateReader, absent: boolean): boolean => (gate ? evaluateGate(gate, reader) : absent);

const liveStatus = (quest: Quest, reader: GateReader): QuestStatus => {
  if (!holds(quest.visible_when, reader, true)) return holds(quest.offered_when, reader, false) ? "offered" : "hidden";
  if (holds(quest.failed_when, reader, false)) return "failed";
  return evaluateGate(quest.done_when, reader) ? "done" : "active";
};

export const questStatus = (quest: Quest, reader: GateReader): QuestStatus => {
  const closed = reader.get(questClosedKey(quest.id));
  return closed === "done" || closed === "failed" ? closed : liveStatus(quest, reader);
};

export const stepStatus = (step: QuestStep, reader: GateReader): StepStatus => {
  if (!holds(step.visible_when, reader, true)) return "hidden";
  if (holds(step.failed_when, reader, false)) return "failed";
  return evaluateGate(step.done_when, reader) ? "done" : "open";
};

export const milestoneEarned = (milestone: Milestone, reader: GateReader): boolean => evaluateGate(milestone.when, reader);

export const isClosed = (status: QuestStatus): boolean => status === "done" || status === "failed";

export const valueReader = (values: Record<string, unknown>): GateReader => ({ get: (key) => values[key] as ReturnType<GateReader["get"]> });

export const hasGameLayer = (story: Pick<NormalizedStoryV2, "quests" | "milestones" | "widgets" | "qualities"> | null | undefined): boolean =>
  Boolean(story && (story.quests?.length || story.milestones?.length || story.widgets?.length || story.qualities.some((quality) => quality.display)));

const openStepKeys = (quest: Quest, reader: GateReader): string[] => quest.steps.flatMap((step) => {
  const status = stepStatus(step, reader);
  if (status === "hidden") return step.visible_when ? gateKeys(step.visible_when) : [];
  return status === "open" ? [step.done_when, step.failed_when].flatMap((gate) => (gate ? gateKeys(gate) : [])) : [];
});

const keysFor = (quest: Quest, status: QuestStatus, reader: GateReader): string[] => {
  if (status === "active") return [...gateKeys(quest.done_when), ...(quest.failed_when ? gateKeys(quest.failed_when) : []), ...openStepKeys(quest, reader)];
  if (status === "offered") return quest.visible_when ? gateKeys(quest.visible_when) : [];
  if (status === "hidden") return [quest.visible_when, quest.offered_when].flatMap((gate) => (gate ? gateKeys(gate) : []));
  return [];
};

const SCOPE_ORDER: readonly QuestStatus[] = ["active", "offered", "hidden"];

const roundRobin = (lists: string[][]): string[] => {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, at) => lists.flatMap((list) => (at < list.length ? [list[at]] : []))).flat();
};

export const questScopeKeys = (quests: readonly Quest[] | undefined, reader: GateReader): string[] => {
  const statuses = (quests ?? []).map((quest) => ({ quest, status: questStatus(quest, reader) }));
  const keys = SCOPE_ORDER.flatMap((wanted) => roundRobin(statuses.filter(({ status }) => status === wanted).map(({ quest, status }) => [...new Set(keysFor(quest, status, reader))])));
  return [...new Set(keys)];
};

export const visibleQuestTitles = (quests: readonly Quest[] | undefined, reader: GateReader): string[] =>
  (quests ?? []).filter((quest) => questStatus(quest, reader) === "active").map((quest) => quest.title);

export const applyQuestRewards = (story: Pick<NormalizedStoryV2, "quests" | "qualityByKey">, blackboard: Blackboard): string[] => {
  const landed: string[] = [];
  for (const quest of story.quests ?? []) {
    const live = blackboard.get(questClosedKey(quest.id)) === undefined ? liveStatus(quest, blackboard) : null;
    if (live === "done" || live === "failed") blackboard.applyDelta({ q: questClosedKey(quest.id), v: live, source: "code" });
  }
  for (const quest of story.quests ?? []) {
    const key = questRewardKey(quest.id);
    if (!quest.reward || blackboard.get(key) === true || questStatus(quest, blackboard) !== "done") continue;
    for (const [target, write] of Object.entries(quest.reward.set ?? {})) {
      const current = blackboard.get(target);
      const value = typeof write === "object" ? (typeof current === "number" ? current : 0) + write.add : write;
      blackboard.applyDelta({ q: target, v: story.qualityByKey[target]?.type === "int" && typeof value === "number" ? Math.round(value) : value, source: "code" });
    }
    blackboard.applyDelta({ q: key, v: true, source: "code" });
    landed.push(quest.id);
  }
  return landed;
};

export const questLatchesMoved = (story: Pick<NormalizedStoryV2, "quests"> | null | undefined, before: Record<string, unknown>, after: Record<string, unknown>): boolean =>
  (story?.quests ?? []).some((quest) => [questClosedKey(quest.id), questRewardKey(quest.id)].some((key) => before[key] !== after[key]));

export const rewardedQuestIds = (story: Pick<NormalizedStoryV2, "quests"> | null | undefined, values: Record<string, unknown>): string[] =>
  (story?.quests ?? []).filter((quest) => quest.reward && values[questRewardKey(quest.id)] === true).map((quest) => quest.id);
