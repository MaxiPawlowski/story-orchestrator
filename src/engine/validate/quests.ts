import {
  QUEST_CLOSED_VALUES, questClosedKey, questRewardKey,
  type GateNode, type Milestone, type Quality, type Quest, type QuestProgress, type QuestReward, type QuestStep, type ValidationError,
} from "../schema";
import { evaluateGate, gateKeys } from "../gates";
import { isRecord } from "@utils/guards";
import { addError, asString, isPrimitive, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate, validateLiteral } from "./gates";
import { GAME_ID_PATTERN, readLabel } from "./checks";
import { readCheckpointEffects } from "./checkpoints";

const QUEST_KEYS = ["id", "title", "kind", "visible_when", "offered_when", "done_when", "failed_when", "steps", "requires", "progress", "labels", "giver", "author_note", "reward"] as const;
const STEP_KEYS = ["text", "done_when", "failed_when", "visible_when", "progress"] as const;
const REWARD_KEYS = ["set", "effects", "label", "visible_when"] as const;
const REWARD_EFFECT_KEYS = ["world_info", "cast_changes", "npc_replies"] as const;
const MILESTONE_KEYS = ["id", "title", "when", "secret"] as const;
export const QUEST_TEXT_MAX = 160;
export const AUTHOR_NOTE_MAX = 600;
export const TIME_KEYS: readonly string[] = ["message_count", "messages_in_checkpoint", "elapsed", "player_turns_in_checkpoint"];

const EMPTY = { get: () => undefined };

const readText = (value: unknown, max: number, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  if (text && text.length <= max) return text;
  return refuse(errors, path, `text of at most ${max} characters is required`, null);
};

const optionalGate = (value: unknown, path: string, errors: ValidationError[]): GateNode | undefined =>
  (value === undefined ? undefined : readGate(value, path, errors) ?? undefined);

const readProgress = (value: unknown, path: string, errors: ValidationError[]): QuestProgress | undefined => {
  if (value === undefined) return undefined;
  const quality = isRecord(value) ? asString(value.quality) : null;
  const of = isRecord(value) && typeof value.of === "number" && Number.isFinite(value.of) && value.of > 0 ? value.of : null;
  if (quality && of !== null) return { quality, of };
  return refuse(errors, path, "progress is {quality, of}: a number counting toward of", undefined);
};

const progressGate = (progress: QuestProgress): GateNode => ({ q: progress.quality, op: ">=", v: progress.of });

const readStep = (value: unknown, path: string, errors: ValidationError[]): QuestStep | null => {
  if (!isRecord(value)) return refuse(errors, path, "a step is {text, done_when}", null);
  rejectUnknownKeys(value, STEP_KEYS, path, errors);
  const text = readText(value.text, QUEST_TEXT_MAX, `${path}.text`, errors);
  const progress = readProgress(value.progress, `${path}.progress`, errors);
  const done = optionalGate(value.done_when, `${path}.done_when`, errors) ?? (progress ? progressGate(progress) : undefined);
  if (!done) addError(errors, `${path}.done_when`, "a step needs done_when or progress");
  const failed = optionalGate(value.failed_when, `${path}.failed_when`, errors);
  const visible = optionalGate(value.visible_when, `${path}.visible_when`, errors);
  if (!text || !done) return null;
  return { text, done_when: done, ...(failed ? { failed_when: failed } : {}), ...(visible ? { visible_when: visible } : {}), ...(progress ? { progress } : {}) };
};

const readSteps = (value: unknown, path: string, errors: ValidationError[]): QuestStep[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return refuse(errors, path, "steps are a list", []);
  return value.map((entry, index) => readStep(entry, `${path}.${index}`, errors)).filter((step): step is QuestStep => step !== null);
};

const readRewardSet = (value: unknown, path: string, errors: ValidationError[]): QuestReward["set"] => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "set is {qualityKey: value or {add}}", undefined);
  const set: NonNullable<QuestReward["set"]> = {};
  Object.entries(value).forEach(([key, write]) => {
    if (isPrimitive(write)) set[key] = write;
    else if (isRecord(write) && typeof write.add === "number" && Number.isFinite(write.add)) set[key] = { add: write.add };
    else addError(errors, `${path}.${key}`, "a reward writes a literal or {add: number}");
  });
  return Object.keys(set).length ? set : undefined;
};

const readReward = (value: unknown, path: string, errors: ValidationError[]): QuestReward | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "reward is {set?, effects?, label?, visible_when?}", undefined);
  rejectUnknownKeys(value, REWARD_KEYS, path, errors);
  if (value.effects !== undefined && isRecord(value.effects)) rejectUnknownKeys(value.effects, REWARD_EFFECT_KEYS, `${path}.effects`, errors);
  else if (value.effects !== undefined) addError(errors, `${path}.effects`, "effects is {world_info?, cast_changes?, npc_replies?}");
  const effects = isRecord(value.effects) ? readCheckpointEffects(value.effects, `${path}.effects`, errors) : null;
  (effects?.npc_replies ?? []).forEach((reply, index) => {
    if (reply.trigger !== "onEnter") addError(errors, `${path}.effects.npc_replies.${index}.trigger`, "a reward's reply fires once, when the reward lands: trigger onEnter");
  });
  const set = readRewardSet(value.set, `${path}.set`, errors);
  const label = readLabel(value.label, `${path}.label`, errors);
  const visible = optionalGate(value.visible_when, `${path}.visible_when`, errors);
  const kept = effects ? Object.fromEntries(Object.entries(effects).filter(([key]) => (REWARD_EFFECT_KEYS as readonly string[]).includes(key))) : {};
  return { ...(set ? { set } : {}), ...(Object.keys(kept).length ? { effects: kept } : {}), ...(label ? { label } : {}), ...(visible ? { visible_when: visible } : {}) };
};

const readLabels = (value: unknown, path: string, errors: ValidationError[]): Quest["labels"] => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "labels is {done?, failed?}", undefined);
  rejectUnknownKeys(value, ["done", "failed"], path, errors);
  const done = readLabel(value.done, `${path}.done`, errors);
  const failed = readLabel(value.failed, `${path}.failed`, errors);
  return done || failed ? { ...(done ? { done } : {}), ...(failed ? { failed } : {}) } : undefined;
};

const readRequires = (value: unknown, path: string, errors: ValidationError[]): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) return refuse(errors, path, "requires is a list of quest ids", undefined);
  return value.length ? value.map((entry: string) => entry.trim()) : undefined;
};

const defaultDone = (steps: QuestStep[], progress: QuestProgress | undefined): GateNode | undefined => {
  if (steps.length) return { all: steps.map((step) => step.done_when) };
  return progress ? progressGate(progress) : undefined;
};

const questOptions = (value: Record<string, unknown>, path: string, errors: ValidationError[]): Partial<Quest> => {
  const visible = optionalGate(value.visible_when, `${path}.visible_when`, errors);
  const offered = optionalGate(value.offered_when, `${path}.offered_when`, errors);
  const failed = optionalGate(value.failed_when, `${path}.failed_when`, errors);
  const requires = readRequires(value.requires, `${path}.requires`, errors);
  const labels = readLabels(value.labels, `${path}.labels`, errors);
  const giver = value.giver === undefined ? null : asString(value.giver)?.trim() ?? refuse(errors, `${path}.giver`, "giver is a roster id", null);
  const note = value.author_note === undefined ? null : readText(value.author_note, AUTHOR_NOTE_MAX, `${path}.author_note`, errors);
  const reward = readReward(value.reward, `${path}.reward`, errors);
  return {
    ...(visible ? { visible_when: visible } : {}), ...(offered ? { offered_when: offered } : {}), ...(failed ? { failed_when: failed } : {}),
    ...(requires ? { requires } : {}), ...(labels ? { labels } : {}), ...(giver ? { giver } : {}), ...(note ? { author_note: note } : {}), ...(reward ? { reward } : {}),
  };
};

const readQuest = (value: unknown, path: string, errors: ValidationError[]): Quest | null => {
  if (!isRecord(value)) return refuse(errors, path, "a quest is an object", null);
  rejectUnknownKeys(value, QUEST_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a quest id is a lowercase slug");
  if (value.kind !== undefined && value.kind !== "side") addError(errors, `${path}.kind`, "kind is side: the main line is the checkpoint graph");
  const title = readText(value.title, QUEST_TEXT_MAX, `${path}.title`, errors);
  const steps = readSteps(value.steps, `${path}.steps`, errors);
  const progress = readProgress(value.progress, `${path}.progress`, errors);
  const done = optionalGate(value.done_when, `${path}.done_when`, errors) ?? defaultDone(steps, progress);
  if (!done) addError(errors, `${path}.done_when`, "a quest needs done_when, steps or progress");
  const options = questOptions(value, path, errors);
  if (!GAME_ID_PATTERN.test(id) || !title || !done) return null;
  return { id, title, kind: "side", done_when: done, steps, ...(progress ? { progress } : {}), ...options };
};

const readList = <T,>(value: unknown, path: string, read: (entry: unknown, at: string, errors: ValidationError[]) => T | null, errors: ValidationError[]): T[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return refuse(errors, path, `${path} is a list`, undefined);
  const items = value.map((entry, index) => read(entry, `${path}.${index}`, errors)).filter((item): item is T => item !== null);
  return items.length ? items : undefined;
};

export const readQuests = (value: unknown, errors: ValidationError[]): Quest[] | undefined => readList(value, "quests", readQuest, errors);

const readMilestone = (value: unknown, path: string, errors: ValidationError[]): Milestone | null => {
  if (!isRecord(value)) return refuse(errors, path, "a milestone is {id, title, when}", null);
  rejectUnknownKeys(value, MILESTONE_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a milestone id is a lowercase slug");
  const title = readText(value.title, QUEST_TEXT_MAX, `${path}.title`, errors);
  const when = value.when === undefined ? refuse(errors, `${path}.when`, "a milestone needs when", null) : readGate(value.when, `${path}.when`, errors);
  if (value.secret !== undefined && typeof value.secret !== "boolean") addError(errors, `${path}.secret`, "secret is true or false");
  if (!GAME_ID_PATTERN.test(id) || !title || !when) return null;
  return { id, title, when, ...(value.secret === true ? { secret: true } : {}) };
};

export const readMilestones = (value: unknown, errors: ValidationError[]): Milestone[] | undefined => readList(value, "milestones", readMilestone, errors);

const unique = (ids: string[], label: string, prefix: string, errors: ValidationError[]) => {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) addError(errors, `${prefix}.${index}.id`, `duplicate ${label} '${id}'`);
    seen.add(id);
  });
};

const cycleThrough = (quests: Quest[]): string | null => {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  const state = new Map<string, "open" | "done">();
  const visit = (id: string): string | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "open") return id;
    state.set(id, "open");
    for (const next of byId.get(id)?.requires ?? []) {
      const found = byId.has(next) ? visit(next) : null;
      if (found) return found;
    }
    state.set(id, "done");
    return null;
  };
  for (const quest of quests) {
    const found = visit(quest.id);
    if (found) return found;
  }
  return null;
};

const withRequirements = (gate: GateNode | undefined, required: GateNode[]): GateNode | undefined =>
  (required.length ? { all: [...(gate ? [gate] : []), ...required] } : gate);

export const expandRequires = (quests: Quest[], errors: ValidationError[]): Quest[] => {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  quests.forEach((quest, index) => (quest.requires ?? []).forEach((id) => {
    if (!byId.has(id)) addError(errors, `quests.${index}.requires`, `unknown quest '${id}'`);
  }));
  const cycle = cycleThrough(quests);
  if (cycle) return refuse(errors, "quests", `quest '${cycle}' requires itself through its chain`, quests);
  return quests.map((quest) => {
    const required = (quest.requires ?? []).flatMap((id) => {
      const target = byId.get(id);
      return target ? [target.done_when] : [];
    });
    if (!required.length) return quest;
    const visible = withRequirements(quest.visible_when, required);
    const offered = quest.offered_when ? withRequirements(quest.offered_when, required) : undefined;
    return { ...quest, ...(visible ? { visible_when: visible } : {}), ...(offered ? { offered_when: offered } : {}) };
  });
};

const questGates = (quest: Quest): Array<[string, GateNode | undefined]> => [
  ["visible_when", quest.visible_when], ["offered_when", quest.offered_when], ["done_when", quest.done_when], ["failed_when", quest.failed_when],
  ["reward.visible_when", quest.reward?.visible_when],
  ...quest.steps.flatMap((step, index): Array<[string, GateNode | undefined]> => [
    [`steps.${index}.done_when`, step.done_when], [`steps.${index}.failed_when`, step.failed_when], [`steps.${index}.visible_when`, step.visible_when],
  ]),
];

const checkProgress = (progress: QuestProgress | undefined, path: string, qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  const type = progress ? qualityByKey[progress.quality]?.type : null;
  if (progress && type !== "int" && type !== "float") addError(errors, `${path}.progress.quality`, "progress counts a declared int or float");
};

const checkRewardSet = (quest: Quest, path: string, qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  Object.entries(quest.reward?.set ?? {}).forEach(([key, write]) => {
    const quality = qualityByKey[key];
    const at = `${path}.reward.set.${key}`;
    if (!quality || quality.source !== "code") return addError(errors, at, "a reward writes only a declared code quality");
    if (typeof write !== "object") validateLiteral(quality, write, at, errors);
    else if (quality.type !== "int" && quality.type !== "float") addError(errors, at, "add needs an int or float");
  });
};

const checkQuest = (quest: Quest, index: number, qualityByKey: Record<string, Quality>, rosterIds: Set<string>, errors: ValidationError[]) => {
  const path = `quests.${index}`;
  questGates(quest).forEach(([field, gate]) => { if (gate) validateGate(gate, qualityByKey, `${path}.${field}`, errors); });
  checkProgress(quest.progress, path, qualityByKey, errors);
  quest.steps.forEach((step, at) => checkProgress(step.progress, `${path}.steps.${at}`, qualityByKey, errors));
  if (quest.failed_when && evaluateGate(quest.done_when, EMPTY) && evaluateGate(quest.failed_when, EMPTY)) {
    addError(errors, `${path}.failed_when`, "done_when and failed_when both hold before anything has happened");
  }
  if (quest.reward && evaluateGate(quest.done_when, EMPTY)) addError(errors, `${path}.reward`, "this quest is done before anything happens, so its reward would land at once");
  if (quest.offered_when && !quest.visible_when) addError(errors, `${path}.visible_when`, "an offered quest needs visible_when: the moment the player takes it on");
  if (quest.offered_when && quest.failed_when && gateKeys(quest.failed_when).every((key) => TIME_KEYS.includes(key))) {
    addError(errors, `${path}.failed_when`, "an offered quest never fails on time alone");
  }
  if (quest.giver && !rosterIds.has(quest.giver)) addError(errors, `${path}.giver`, `'${quest.giver}' is not a roster id`);
  checkRewardSet(quest, path, qualityByKey, errors);
};

export const checkQuests = (quests: Quest[] | undefined, milestones: Milestone[] | undefined, qualityByKey: Record<string, Quality>, rosterIds: Set<string>, errors: ValidationError[]) => {
  unique((quests ?? []).map((quest) => quest.id), "quest", "quests", errors);
  unique((milestones ?? []).map((milestone) => milestone.id), "milestone", "milestones", errors);
  (quests ?? []).forEach((quest, index) => checkQuest(quest, index, qualityByKey, rosterIds, errors));
  (milestones ?? []).forEach((milestone, index) => validateGate(milestone.when, qualityByKey, `milestones.${index}.when`, errors));
};

export const addRewardQualities = (qualities: Quality[], quests: Quest[] | undefined, errors: ValidationError[]): Quality[] => {
  const rewarded = (quests ?? []).filter((quest) => quest.reward).map((quest): Quality => ({
    key: questRewardKey(quest.id), type: "bool", source: "code", latching: true, rubric: "Set once by the story when this quest's reward lands",
  }));
  const closed = (quests ?? []).map((quest): Quality => ({
    key: questClosedKey(quest.id), type: "enum", values: [...QUEST_CLOSED_VALUES], source: "code", latching: true, rubric: "Set once by the story when this quest is done or failed",
  }));
  const kept = [...rewarded, ...closed];
  const existing = new Set(qualities.map((quality) => quality.key));
  kept.filter((quality) => existing.has(quality.key)).forEach((quality) => addError(errors, `qualities.${quality.key}`, "this key is kept for a quest's state"));
  return [...qualities, ...kept.filter((quality) => !existing.has(quality.key))];
};
