import type { Blackboard } from "./blackboard";
import { evaluateGate, gateKeys, type GateReader } from "./gates";
import {
  hasCodex, hasLabels, QUEST_LIFECYCLE, questClosedKey, questConsequenceKey,
  type GateNode, type Milestone, type NormalizedStory, type PrimitiveValue, type Quality, type Quest, type QuestConsequence, type QuestFrom, type QuestStep, type RecapText,
  type RewardWrite,
} from "./schema";

export type QuestLifecycle = (typeof QUEST_LIFECYCLE)[number];
export type QuestStatus = string;
export type StepStatus = "hidden" | "open" | "done" | "failed";

export interface QuestEnding {
  id: string;
  when: GateNode;
  from: readonly QuestFrom[];
  label?: string;
  recap?: RecapText;
  consequences: readonly QuestConsequence[];
  sugar: boolean;
}

export interface QuestDecision {
  ending: QuestEnding | null;
  matched: string[];
  held: boolean;
}

export interface AppliedConsequence {
  questId: string;
  resolutionId: string;
  consequence: QuestConsequence;
  key: string;
  boundary: number;
}

export interface QuestBoundary {
  closed: Array<{ questId: string; resolutionId: string }>;
  applied: AppliedConsequence[];
  conflicts: string[];
}

const ACTIVE: readonly QuestFrom[] = ["active"];
const LIFECYCLE: readonly string[] = QUEST_LIFECYCLE;

const holds = (gate: GateNode | undefined, reader: GateReader, absent: boolean): boolean => (gate ? evaluateGate(gate, reader) : absent);

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const byId = (left: { id: string }, right: { id: string }): number => compare(left.id, right.id);

const sugarEndings = (quest: Quest): QuestEnding[] => [
  ...(quest.failed_when ? [{
    id: "failed", when: quest.failed_when, from: ACTIVE, consequences: [], sugar: true,
    ...(quest.labels?.failed ? { label: quest.labels.failed } : {}), ...(quest.recap?.failed ? { recap: quest.recap.failed } : {}),
  }] : []),
  ...(quest.done_when ? [{
    id: "done", when: quest.done_when, from: ACTIVE, consequences: quest.reward ? [{ id: "reward", ...quest.reward }] : [], sugar: true,
    ...(quest.labels?.done ? { label: quest.labels.done } : {}), ...(quest.recap?.done ? { recap: quest.recap.done } : {}),
  }] : []),
];

const endingsOf = new WeakMap<Quest, readonly [QuestEnding[], QuestEnding[]]>();

export const questEndings = (quest: Quest, on = true): readonly QuestEnding[] => {
  const known = endingsOf.get(quest);
  if (known) return known[on ? 1 : 0];
  const sugar = sugarEndings(quest);
  const authored = (quest.resolutions ?? []).map((resolution): QuestEnding => ({
    ...resolution, from: resolution.from ?? ACTIVE, consequences: resolution.consequences ?? [], sugar: false,
  }));
  const pair: readonly [QuestEnding[], QuestEnding[]] = [sugar, [...sugar, ...authored]];
  endingsOf.set(quest, pair);
  return pair[on ? 1 : 0];
};

const SUGAR_RANK: Record<string, number> = { failed: 0, done: 1 };

export const questPrecedence = (quest: Quest, endings: readonly QuestEnding[]): string[] => {
  const ids = endings.map((ending) => ending.id);
  const authored = (quest.precedence ?? []).filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !authored.includes(id)).sort((left, right) => (SUGAR_RANK[left] ?? 2) - (SUGAR_RANK[right] ?? 2) || compare(left, right));
  return [...authored, ...rest];
};

export const questLifecycle = (quest: Quest, reader: GateReader): QuestLifecycle => {
  if (holds(quest.visible_when, reader, true)) return "active";
  return holds(quest.offered_when, reader, false) ? "offered" : "hidden";
};

export const questResolution = (quest: Pick<Quest, "id">, reader: GateReader): string | null => {
  const closed = reader.get(questClosedKey(quest.id));
  return typeof closed === "string" && closed ? closed : null;
};

export const questStatus = (quest: Quest, reader: GateReader): QuestStatus => questResolution(quest, reader) ?? questLifecycle(quest, reader);

export const isClosed = (status: QuestStatus): boolean => !LIFECYCLE.includes(status);

export const decideQuest = (quest: Quest, reader: GateReader, on = true): QuestDecision => {
  const lifecycle = questLifecycle(quest, reader);
  if (lifecycle === "hidden") return { ending: null, matched: [], held: false };
  const endings = questEndings(quest, on);
  const order = questPrecedence(quest, endings);
  const matched = endings.filter((ending) => ending.from.includes(lifecycle) && evaluateGate(ending.when, reader))
    .sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
  const ids = matched.map((ending) => ending.id);
  if (matched.length > 1 && on && quest.hold_when_ambiguous) return { ending: null, matched: ids, held: true };
  return { ending: matched[0] ?? null, matched: ids, held: false };
};

export const pendingStatus = (quest: Quest, reader: GateReader, on = true): QuestStatus =>
  questResolution(quest, reader) ?? decideQuest(quest, reader, on).ending?.id ?? questLifecycle(quest, reader);

export const questEnding = (quest: Quest, resolutionId: string | null): QuestEnding | null =>
  (resolutionId ? questEndings(quest, true).find((ending) => ending.id === resolutionId) ?? null : null);

export const stepStatus = (step: QuestStep, reader: GateReader): StepStatus => {
  if (!holds(step.visible_when, reader, true)) return "hidden";
  if (holds(step.failed_when, reader, false)) return "failed";
  return evaluateGate(step.done_when, reader) ? "done" : "open";
};

export const milestoneEarned = (milestone: Milestone, reader: GateReader): boolean => evaluateGate(milestone.when, reader);

export const valueReader = (values: Record<string, unknown>): GateReader => ({ get: (key) => values[key] as ReturnType<GateReader["get"]> });

export const hasGameLayer = (story: Pick<NormalizedStory, "quests" | "milestones" | "widgets" | "qualities" | "codex" | "observations" | "factions" | "life"> | null | undefined): boolean =>
  Boolean(story && (story.quests?.length || story.milestones?.length || story.widgets?.length || story.factions?.length || story.qualities.some((quality) => quality.display)
    || hasCodex(story.codex) || Boolean(story.observations?.length) || story.life?.members.some((member) => member.relationships.some(hasLabels) || member.commitments?.length)));

const gateList = (gates: Array<GateNode | undefined>): string[] => gates.flatMap((gate) => (gate ? gateKeys(gate) : []));

const openStepKeys = (quest: Quest, reader: GateReader): string[] => quest.steps.flatMap((step) => {
  const status = stepStatus(step, reader);
  if (status === "hidden") return gateList([step.visible_when]);
  return status === "open" ? gateList([step.done_when, step.failed_when]) : [];
});

const endingKeys = (quest: Quest, lifecycle: QuestFrom, on: boolean): string[] => questEndings(quest, on)
  .filter((ending) => ending.from.includes(lifecycle))
  .flatMap((ending) => gateList([ending.when, ...ending.consequences.map((consequence) => consequence.when)]));

const keysFor = (quest: Quest, status: QuestStatus, reader: GateReader, on: boolean): string[] => {
  if (status === "active") return [...endingKeys(quest, "active", on), ...openStepKeys(quest, reader)];
  if (status === "offered") return [...gateList([quest.visible_when]), ...endingKeys(quest, "offered", on)];
  if (status === "hidden") return gateList([quest.visible_when, quest.offered_when]);
  return [];
};

const SCOPE_ORDER: readonly QuestStatus[] = ["active", "offered", "hidden"];

const roundRobin = (lists: string[][]): string[] => {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, at) => lists.flatMap((list) => (at < list.length ? [list[at]] : []))).flat();
};

const scopeKeysOf = (quests: readonly Quest[] | undefined, reader: GateReader, wanted: readonly QuestStatus[], on: boolean): string[] => {
  const statuses = (quests ?? []).map((quest) => ({ quest, status: questStatus(quest, reader) }));
  return [...new Set(wanted.flatMap((status) => roundRobin(statuses.filter((entry) => entry.status === status)
    .map(({ quest }) => [...new Set(keysFor(quest, status, reader, on))]))))];
};

export const questScopeKeys = (quests: readonly Quest[] | undefined, reader: GateReader, on = true): string[] => scopeKeysOf(quests, reader, SCOPE_ORDER, on);

export const activeQuestScopeKeys = (quests: readonly Quest[] | undefined, reader: GateReader, on = true): string[] => scopeKeysOf(quests, reader, ["active"], on);

export const visibleQuestTitles = (quests: readonly Quest[] | undefined, reader: GateReader): string[] =>
  (quests ?? []).filter((quest) => questStatus(quest, reader) === "active").map((quest) => quest.title);

const withinStepRule = (quality: Quality | undefined, value: number): number => {
  const rule = quality?.type === "int" ? quality.step_rule : undefined;
  return rule ? Math.max(rule.min ?? value, Math.min(rule.max ?? value, value)) : value;
};

const isAdd = (write: RewardWrite): write is { add: number } => typeof write === "object";

const writeConsequences = (story: Pick<NormalizedStory, "qualityByKey">, blackboard: Blackboard, applied: readonly AppliedConsequence[]): string[] => {
  const writes = new Map<string, { literals: PrimitiveValue[]; add: number; adds: number }>();
  for (const item of applied) {
    for (const [key, write] of Object.entries(item.consequence.set ?? {})) {
      const slot = writes.get(key) ?? { literals: [], add: 0, adds: 0 };
      if (isAdd(write)) {
        slot.add += write.add;
        slot.adds += 1;
      } else slot.literals.push(write);
      writes.set(key, slot);
    }
  }
  const conflicts: string[] = [];
  for (const [key, slot] of [...writes].sort(([left], [right]) => compare(left, right))) {
    const quality = story.qualityByKey[key];
    if (slot.literals.length) {
      if (slot.adds || new Set(slot.literals).size > 1) conflicts.push(key);
      blackboard.applyDelta({ q: key, v: slot.literals[0], source: "code" });
      continue;
    }
    const current = blackboard.get(key);
    const value = withinStepRule(quality, (typeof current === "number" ? current : 0) + slot.add);
    blackboard.applyDelta({ q: key, v: quality?.type === "int" ? Math.round(value) : value, source: "code" });
  }
  return conflicts;
};

export const applyQuestResolutions = (story: Pick<NormalizedStory, "quests" | "qualityByKey">, blackboard: Blackboard, boundary: number, on = true): QuestBoundary => {
  const frozen = { ...blackboard.entries() };
  const reader = valueReader(frozen);
  const decided = [...(story.quests ?? [])].sort(byId).flatMap((quest) => {
    if (questResolution(quest, reader) !== null) return [];
    const ending = decideQuest(quest, reader, on).ending;
    return ending ? [{ quest, ending }] : [];
  });
  const closes: Record<string, PrimitiveValue> = {};
  for (const { quest, ending } of decided) {
    closes[questClosedKey(quest.id)] = ending.id;
    blackboard.applyDelta({ q: questClosedKey(quest.id), v: ending.id, source: "code" });
  }
  const closed = valueReader({ ...frozen, ...closes });
  const applied = decided.flatMap(({ quest, ending }) => [...ending.consequences].sort(byId)
    .filter((consequence) => holds(consequence.when, closed, true))
    .map((consequence): AppliedConsequence => ({ questId: quest.id, resolutionId: ending.id, consequence, key: questConsequenceKey(quest.id, ending.id, consequence.id), boundary })));
  const conflicts = writeConsequences(story, blackboard, applied);
  for (const item of applied) blackboard.applyDelta({ q: item.key, v: boundary, source: "code" });
  return { closed: decided.map(({ quest, ending }) => ({ questId: quest.id, resolutionId: ending.id })), applied, conflicts };
};

export const questLatchKeys = (story: Pick<NormalizedStory, "quests"> | null | undefined): string[] => (story?.quests ?? []).flatMap((quest) => [
  questClosedKey(quest.id),
  ...questEndings(quest, true).flatMap((ending) => ending.consequences.map((consequence) => questConsequenceKey(quest.id, ending.id, consequence.id))),
]);

export const questLatchesMoved = (story: Pick<NormalizedStory, "quests"> | null | undefined, before: Record<string, unknown>, after: Record<string, unknown>): boolean =>
  questLatchKeys(story).some((key) => before[key] !== after[key]);

export const appliedConsequences = (story: Pick<NormalizedStory, "quests"> | null | undefined, values: Readonly<Record<string, unknown>>): AppliedConsequence[] =>
  (story?.quests ?? []).flatMap((quest) => questEndings(quest, true).flatMap((ending) => ending.consequences.flatMap((consequence): AppliedConsequence[] => {
    const key = questConsequenceKey(quest.id, ending.id, consequence.id);
    const boundary = values[key];
    return typeof boundary === "number" ? [{ questId: quest.id, resolutionId: ending.id, consequence, key, boundary }] : [];
  }))).sort((left, right) => left.boundary - right.boundary || compare(left.questId, right.questId) || compare(left.resolutionId, right.resolutionId)
    || compare(left.consequence.id, right.consequence.id));

export const consequenceWorldInfo = (story: Pick<NormalizedStory, "quests"> | null | undefined, values: Readonly<Record<string, unknown>>): unknown[] =>
  appliedConsequences(story, values).flatMap((item) => (item.consequence.effects?.world_info === undefined ? [] : [item.consequence.effects.world_info]));

export const heldQuestIds = (story: Pick<NormalizedStory, "quests"> | null | undefined, values: Readonly<Record<string, unknown>>, on = true): string[] => {
  const reader = valueReader(values);
  return (story?.quests ?? []).filter((quest) => questResolution(quest, reader) === null && decideQuest(quest, reader, on).held).map((quest) => quest.id);
};

export const consequenceConflicts = (story: Pick<NormalizedStory, "quests"> | null | undefined, values: Readonly<Record<string, unknown>>): string[] => {
  const writers = new Map<string, Array<{ literal: boolean }>>();
  for (const item of appliedConsequences(story, values)) {
    for (const [key, write] of Object.entries(item.consequence.set ?? {})) {
      const slot = `${item.boundary}:${key}`;
      writers.set(slot, [...(writers.get(slot) ?? []), { literal: !isAdd(write) }]);
    }
  }
  return [...new Set([...writers].filter(([, list]) => list.some((entry) => entry.literal) && list.length > 1).map(([slot]) => slot.slice(slot.indexOf(":") + 1)))].sort();
};

export const shownConsequenceLabels = (quest: Quest, reader: GateReader): string[] => {
  const ending = questEnding(quest, questResolution(quest, reader));
  if (!ending) return [];
  return [...ending.consequences].sort(byId).flatMap((consequence) => (consequence.label && typeof reader.get(questConsequenceKey(quest.id, ending.id, consequence.id)) === "number"
    && holds(consequence.visible_when, reader, true) ? [consequence.label] : []));
};
