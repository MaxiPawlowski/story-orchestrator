import {
  QUEST_FROM, QUEST_LIFECYCLE, isFactionKey, isStoryTimeKey, questClosedKey, questConsequenceKey,
  type GateLeaf, type GateNode, type Milestone, type PrimitiveValue, type Quality, type Quest, type QuestConsequence, type QuestFrom, type QuestProgress,
  type QuestRequirement, type QuestResolution, type QuestReward, type QuestStep, type ValidationError,
} from "../schema";
import { evaluateGate, gateKeys } from "../gates";
import { questEndings, type QuestEnding } from "../quests";
import { isRecord } from "@utils/guards";
import { addError, asString, isPrimitive, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate, validateLiteral } from "./gates";
import { GAME_ID_PATTERN, readLabel } from "./checks";
import { readCheckpointEffects } from "./checkpoints";
import { readQuestRecapFields, readRecapFields, readRecapText } from "./recap";

const QUEST_KEYS = [
  "id", "title", "kind", "visible_when", "offered_when", "done_when", "failed_when", "steps", "requires", "progress", "labels", "giver", "author_note", "reward",
  "recap", "recap_when", "promise", "resolutions", "precedence", "hold_when_ambiguous",
] as const;
const STEP_KEYS = ["text", "done_when", "failed_when", "visible_when", "progress", "optional", "alternative_of"] as const;
const REWARD_KEYS = ["set", "effects", "label", "visible_when"] as const;
const CONSEQUENCE_KEYS = ["id", "when", ...REWARD_KEYS] as const;
const RESOLUTION_KEYS = ["id", "when", "label", "recap", "from", "consequences"] as const;
const REWARD_EFFECT_KEYS = ["world_info", "cast_changes", "npc_replies"] as const;
const MILESTONE_KEYS = ["id", "title", "when", "secret", "recap", "recap_when"] as const;
export const QUEST_TEXT_MAX = 160;
export const AUTHOR_NOTE_MAX = 600;
export const QUEST_RESOLUTIONS_MAX = 8;
export const QUEST_CONSEQUENCES_MAX = 8;
export const LAPSED_RESOLUTION = "lapsed";
export const TIME_KEYS: readonly string[] = ["message_count", "messages_in_checkpoint", "elapsed", "player_turns_in_checkpoint"];
const RESERVED_RESOLUTION_IDS: readonly string[] = [...QUEST_LIFECYCLE, "closed"];

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

const readStepShape = (value: Record<string, unknown>, path: string, errors: ValidationError[]): Pick<QuestStep, "optional" | "alternative_of"> => {
  if (value.optional !== undefined && typeof value.optional !== "boolean") addError(errors, `${path}.optional`, "optional is true or false");
  const alternative = value.alternative_of;
  if (alternative !== undefined && !(Number.isInteger(alternative) && (alternative as number) >= 0)) addError(errors, `${path}.alternative_of`, "alternative_of is the index of another step");
  return { ...(value.optional === true ? { optional: true } : {}), ...(Number.isInteger(alternative) && (alternative as number) >= 0 ? { alternative_of: alternative as number } : {}) };
};

const readStep = (value: unknown, path: string, errors: ValidationError[]): QuestStep | null => {
  if (!isRecord(value)) return refuse(errors, path, "a step is {text, done_when}", null);
  rejectUnknownKeys(value, STEP_KEYS, path, errors);
  const text = readText(value.text, QUEST_TEXT_MAX, `${path}.text`, errors);
  const progress = readProgress(value.progress, `${path}.progress`, errors);
  const done = optionalGate(value.done_when, `${path}.done_when`, errors) ?? (progress ? progressGate(progress) : undefined);
  if (!done) addError(errors, `${path}.done_when`, "a step needs done_when or progress");
  const failed = optionalGate(value.failed_when, `${path}.failed_when`, errors);
  const visible = optionalGate(value.visible_when, `${path}.visible_when`, errors);
  const shape = readStepShape(value, path, errors);
  if (!text || !done) return null;
  return { text, done_when: done, ...(failed ? { failed_when: failed } : {}), ...(visible ? { visible_when: visible } : {}), ...(progress ? { progress } : {}), ...shape };
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

const readPayout = (value: Record<string, unknown>, path: string, errors: ValidationError[]): QuestReward => {
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

const readReward = (value: unknown, path: string, errors: ValidationError[]): QuestReward | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "reward is {set?, effects?, label?, visible_when?}", undefined);
  rejectUnknownKeys(value, REWARD_KEYS, path, errors);
  return readPayout(value, path, errors);
};

const readSlug = (value: unknown, path: string, what: string, errors: ValidationError[]): string | null => {
  const id = asString(value)?.trim() ?? "";
  return GAME_ID_PATTERN.test(id) ? id : refuse(errors, path, `a ${what} id is a lowercase slug`, null);
};

const readConsequence = (value: unknown, path: string, errors: ValidationError[]): QuestConsequence | null => {
  if (!isRecord(value)) return refuse(errors, path, "a consequence is {id, when?, set?, effects?, label?, visible_when?}", null);
  rejectUnknownKeys(value, CONSEQUENCE_KEYS, path, errors);
  const id = readSlug(value.id, `${path}.id`, "consequence", errors);
  const when = optionalGate(value.when, `${path}.when`, errors);
  const payout = readPayout(value, path, errors);
  if (!payout.set && !payout.effects && !payout.label) addError(errors, path, "a consequence changes something: set, effects or a label");
  return id ? { id, ...(when ? { when } : {}), ...payout } : null;
};

const readFrom = (value: unknown, path: string, errors: ValidationError[]): QuestFrom[] | undefined => {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  if (!list.length || list.some((entry) => !(QUEST_FROM as readonly unknown[]).includes(entry)) || new Set(list).size !== list.length) {
    return refuse(errors, path, `from lists the states a quest closes from: ${QUEST_FROM.join(", ")}`, undefined);
  }
  return list as QuestFrom[];
};

const readList = <T,>(value: unknown, path: string, read: (entry: unknown, at: string, errors: ValidationError[]) => T | null, errors: ValidationError[], max = Infinity): T[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max) return refuse(errors, path, Number.isFinite(max) ? `${path} is a list of at most ${max}` : `${path} is a list`, undefined);
  const items = value.map((entry, index) => read(entry, `${path}.${index}`, errors)).filter((item): item is T => item !== null);
  return items.length ? items : undefined;
};

const readResolution = (value: unknown, path: string, errors: ValidationError[]): QuestResolution | null => {
  if (!isRecord(value)) return refuse(errors, path, "a resolution is {id, when, label?, recap?, from?, consequences?}", null);
  rejectUnknownKeys(value, RESOLUTION_KEYS, path, errors);
  const id = readSlug(value.id, `${path}.id`, "resolution", errors);
  if (id && RESERVED_RESOLUTION_IDS.includes(id)) addError(errors, `${path}.id`, `'${id}' names a quest state, not an ending`);
  const when = value.when === undefined ? refuse(errors, `${path}.when`, "a resolution needs when", null) : readGate(value.when, `${path}.when`, errors);
  const label = readLabel(value.label, `${path}.label`, errors);
  const recap = readRecapText(value.recap, `${path}.recap`, errors);
  const from = readFrom(value.from, `${path}.from`, errors);
  const consequences = readList(value.consequences, `${path}.consequences`, readConsequence, errors, QUEST_CONSEQUENCES_MAX);
  if (!id || !when) return null;
  return { id, when, ...(label ? { label } : {}), ...(recap ? { recap } : {}), ...(from ? { from } : {}), ...(consequences ? { consequences } : {}) };
};

const readLabels = (value: unknown, path: string, errors: ValidationError[]): Quest["labels"] => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "labels is {done?, failed?}", undefined);
  rejectUnknownKeys(value, ["done", "failed"], path, errors);
  const done = readLabel(value.done, `${path}.done`, errors);
  const failed = readLabel(value.failed, `${path}.failed`, errors);
  return done || failed ? { ...(done ? { done } : {}), ...(failed ? { failed } : {}) } : undefined;
};

const REQUIRES_SHAPE = "requires lists quest ids, or {quest, resolution: [ids]}";

const readRequirement = (entry: unknown): QuestRequirement | null => {
  if (typeof entry === "string") return entry.trim() || null;
  if (!isRecord(entry) || Object.keys(entry).some((key) => key !== "quest" && key !== "resolution")) return null;
  const quest = asString(entry.quest)?.trim();
  const resolution = Array.isArray(entry.resolution) ? entry.resolution : typeof entry.resolution === "string" ? [entry.resolution] : null;
  if (!quest || !resolution?.length || resolution.some((id) => typeof id !== "string" || !id.trim())) return null;
  return { quest, resolution: [...new Set(resolution.map((id: string) => id.trim()))] };
};

const readRequires = (value: unknown, path: string, errors: ValidationError[]): QuestRequirement[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return refuse(errors, path, REQUIRES_SHAPE, undefined);
  const read = value.map(readRequirement);
  if (read.some((entry) => entry === null)) return refuse(errors, path, REQUIRES_SHAPE, undefined);
  return read.length ? read as QuestRequirement[] : undefined;
};

const readPrecedence = (value: unknown, path: string, errors: ValidationError[]): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.some((id) => typeof id !== "string" || !id.trim())) return refuse(errors, path, "precedence lists resolution ids, first wins", undefined);
  return value.map((id: string) => id.trim());
};

const stepGroups = (steps: QuestStep[]): QuestStep[][] => steps.flatMap((step, index) => {
  if (step.optional || step.alternative_of !== undefined) return [];
  return [[step, ...steps.filter((other) => other.alternative_of === index)]];
});

const defaultDone = (steps: QuestStep[], progress: QuestProgress | undefined): GateNode | undefined => {
  const groups = stepGroups(steps);
  if (groups.length) return { all: groups.map((group) => (group.length === 1 ? group[0].done_when : { any: group.map((step) => step.done_when) })) };
  return progress && !steps.length ? progressGate(progress) : undefined;
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
  const promise = value.promise === undefined ? false : value.promise === true || (value.promise !== false && refuse(errors, `${path}.promise`, "promise is true or false", false));
  const resolutions = readList(value.resolutions, `${path}.resolutions`, readResolution, errors, QUEST_RESOLUTIONS_MAX);
  const precedence = readPrecedence(value.precedence, `${path}.precedence`, errors);
  if (value.hold_when_ambiguous !== undefined && typeof value.hold_when_ambiguous !== "boolean") addError(errors, `${path}.hold_when_ambiguous`, "hold_when_ambiguous is true or false");
  return {
    ...(visible ? { visible_when: visible } : {}), ...(offered ? { offered_when: offered } : {}), ...(failed ? { failed_when: failed } : {}),
    ...(requires ? { requires } : {}), ...(labels ? { labels } : {}), ...(giver ? { giver } : {}), ...(note ? { author_note: note } : {}), ...(reward ? { reward } : {}),
    ...(promise ? { promise: true } : {}), ...(resolutions ? { resolutions } : {}), ...(precedence ? { precedence } : {}),
    ...(value.hold_when_ambiguous === true ? { hold_when_ambiguous: true } : {}),
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
  const options = questOptions(value, path, errors);
  const authored = optionalGate(value.done_when, `${path}.done_when`, errors);
  const done = authored ?? (options.resolutions ? undefined : defaultDone(steps, progress));
  if (!done && !options.resolutions && value.done_when === undefined) {
    addError(errors, `${path}.done_when`, steps.length ? "every step is optional or an alternative: give done_when" : "a quest needs done_when, steps, progress or resolutions");
  }
  if (!GAME_ID_PATTERN.test(id) || !title || (!done && !options.resolutions)) return null;
  return { id, title, kind: "side", ...(done ? { done_when: done } : {}), steps, ...(progress ? { progress } : {}), ...options, ...readQuestRecapFields(value, path, errors, readGate) };
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
  return { id, title, when, ...(value.secret === true ? { secret: true } : {}), ...readRecapFields(value, path, errors, readGate) };
};

export const readMilestones = (value: unknown, errors: ValidationError[]): Milestone[] | undefined => readList(value, "milestones", readMilestone, errors);

const unique = (ids: string[], label: string, prefix: string, errors: ValidationError[], suffix = ".id") => {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) addError(errors, `${prefix}.${index}${suffix}`, `duplicate ${label} '${id}'`);
    seen.add(id);
  });
};

const requiredQuestIds = (quest: Quest): string[] => (quest.requires ?? []).map((entry) => (typeof entry === "string" ? entry : entry.quest));

const cycleThrough = (quests: Quest[]): string | null => {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  const state = new Map<string, "open" | "done">();
  const visit = (id: string): string | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "open") return id;
    state.set(id, "open");
    for (const next of requiredQuestIds(byId.get(id) ?? { requires: [] } as unknown as Quest)) {
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

const requirementGate = (entry: QuestRequirement, byId: Map<string, Quest>, path: string, errors: ValidationError[]): GateNode[] => {
  const id = typeof entry === "string" ? entry : entry.quest;
  const target = byId.get(id);
  if (!target) return refuse(errors, path, `unknown quest '${id}'`, []);
  const ids = questEndings(target, true).map((ending) => ending.id);
  if (typeof entry === "string") {
    if (!ids.includes("done")) return refuse(errors, path, `quest '${id}' has no resolution done: name the ones that open this quest with {quest, resolution}`, []);
    return [{ q: questClosedKey(id), op: "==", v: "done" }];
  }
  const unknown = entry.resolution.filter((resolution) => !ids.includes(resolution));
  if (unknown.length) return refuse(errors, path, `quest '${id}' has no resolution ${unknown.map((name) => `'${name}'`).join(", ")}`, []);
  return [entry.resolution.length === 1 ? { q: questClosedKey(id), op: "==", v: entry.resolution[0] } : { q: questClosedKey(id), op: "in", v: entry.resolution }];
};

export const expandRequires = (quests: Quest[], errors: ValidationError[]): Quest[] => {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  const cycle = cycleThrough(quests);
  if (cycle) return refuse(errors, "quests", `quest '${cycle}' requires itself through its chain`, quests);
  return quests.map((quest, index) => {
    const required = (quest.requires ?? []).flatMap((entry) => requirementGate(entry, byId, `quests.${index}.requires`, errors));
    if (!required.length) return quest;
    const visible = withRequirements(quest.visible_when, required);
    const offered = quest.offered_when ? withRequirements(quest.offered_when, required) : undefined;
    return { ...quest, ...(visible ? { visible_when: visible } : {}), ...(offered ? { offered_when: offered } : {}) };
  });
};

const payoutGates = (prefix: string, payout: Pick<QuestConsequence, "when" | "visible_when">): Array<[string, GateNode | undefined]> => [
  [`${prefix}.when`, payout.when], [`${prefix}.visible_when`, payout.visible_when],
];

const questGates = (quest: Quest): Array<[string, GateNode | undefined]> => [
  ["visible_when", quest.visible_when], ["offered_when", quest.offered_when], ["done_when", quest.done_when], ["failed_when", quest.failed_when],
  ["reward.visible_when", quest.reward?.visible_when],
  ...quest.steps.flatMap((step, index): Array<[string, GateNode | undefined]> => [
    [`steps.${index}.done_when`, step.done_when], [`steps.${index}.failed_when`, step.failed_when], [`steps.${index}.visible_when`, step.visible_when],
  ]),
  ...(quest.resolutions ?? []).flatMap((resolution, index): Array<[string, GateNode | undefined]> => [
    [`resolutions.${index}.when`, resolution.when],
    ...(resolution.consequences ?? []).flatMap((consequence, at) => payoutGates(`resolutions.${index}.consequences.${at}`, consequence)),
  ]),
];

const checkProgress = (progress: QuestProgress | undefined, path: string, qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  const type = progress ? qualityByKey[progress.quality]?.type : null;
  if (progress && type !== "int" && type !== "float") addError(errors, `${path}.progress.quality`, "progress counts a declared int or float");
};

const checkSet = (set: QuestReward["set"], at: string, qualityByKey: Record<string, Quality>, reserved: ReadonlySet<string>, strict: boolean, errors: ValidationError[]) => {
  Object.entries(set ?? {}).forEach(([key, write]) => {
    const quality = qualityByKey[key];
    const path = `${at}.set.${key}`;
    if (!quality || quality.source !== "code") return addError(errors, path, "a reward writes only a declared code quality");
    if (isStoryTimeKey(key)) return addError(errors, path, "a reward never moves the story clock: give a checkpoint effects.time");
    if (reserved.has(key)) return addError(errors, path, "this key is kept for a quest's state");
    if (strict && isFactionKey(key)) return addError(errors, path, "a consequence never writes faction standing: gate a faction move on this resolution");
    if (typeof write !== "object") validateLiteral(quality, write, path, errors);
    else if (quality.type !== "int" && quality.type !== "float") addError(errors, path, "add needs an int or float");
  });
};

const conjuncts = (gate: GateNode): GateLeaf[] => ("q" in gate ? [gate] : "all" in gate ? gate.all.flatMap(conjuncts) : []);

const allowedValues = (leaf: GateLeaf): PrimitiveValue[] | null => {
  if (leaf.op === "==" && !Array.isArray(leaf.v)) return [leaf.v];
  if (leaf.op === "in" && Array.isArray(leaf.v)) return leaf.v;
  return null;
};

export const gatesExclusive = (left: GateNode, right: GateNode): boolean => {
  const others = conjuncts(right);
  return conjuncts(left).some((leaf) => {
    const mine = allowedValues(leaf);
    return Boolean(mine) && others.some((other) => {
      const theirs = other.q === leaf.q ? allowedValues(other) : null;
      return Boolean(theirs) && !theirs!.some((value) => mine!.includes(value));
    });
  });
};

export const endingsExclusive = (left: QuestEnding, right: QuestEnding): boolean =>
  !left.from.some((state) => right.from.includes(state)) || gatesExclusive(left.when, right.when);

const unprovenPair = (endings: readonly QuestEnding[]): [string, string] | null => {
  for (let at = 0; at < endings.length; at += 1) {
    for (const other of endings.slice(at + 1)) if (!endingsExclusive(endings[at], other)) return [endings[at].id, other.id];
  }
  return null;
};

const timeOnly = (gate: GateNode): boolean => gateKeys(gate).every((key) => TIME_KEYS.includes(key) || isStoryTimeKey(key));

const checkPrecedence = (quest: Quest, endings: readonly QuestEnding[], path: string, errors: ValidationError[]) => {
  const ids = endings.map((ending) => ending.id);
  if (quest.precedence) {
    quest.precedence.filter((id) => !ids.includes(id)).forEach((id) => addError(errors, `${path}.precedence`, `'${id}' is not a resolution of this quest`));
    unique(quest.precedence, "resolution", `${path}.precedence`, errors, "");
    const missing = ids.filter((id) => !quest.precedence!.includes(id));
    if (missing.length) addError(errors, `${path}.precedence`, `precedence names every resolution: add ${missing.join(", ")}`);
    return;
  }
  if (!quest.resolutions?.length) return;
  const pair = unprovenPair(endings);
  if (pair) addError(errors, `${path}.precedence`, `quest-resolutions-overlap: '${pair[0]}' and '${pair[1]}' can both hold; add precedence (first wins) or make them exclusive`);
};

const checkResolutions = (quest: Quest, path: string, qualityByKey: Record<string, Quality>, reserved: ReadonlySet<string>, errors: ValidationError[]) => {
  const endings = questEndings(quest, true);
  unique(endings.map((ending) => ending.id), "resolution", `${path}.resolutions`, errors);
  (quest.resolutions ?? []).forEach((resolution, index) => {
    const at = `${path}.resolutions.${index}`;
    const from = resolution.from ?? ["active"];
    unique((resolution.consequences ?? []).map((consequence) => consequence.id), "consequence", `${at}.consequences`, errors);
    if (from.includes("offered") && !quest.offered_when) addError(errors, `${at}.from`, "closing from offered needs offered_when on the quest");
    if (from.includes("offered") && timeOnly(resolution.when) && resolution.id !== LAPSED_RESOLUTION) {
      addError(errors, `${at}.id`, `an offered quest never fails on time alone: a resolution on time only, from offered, is the neutral '${LAPSED_RESOLUTION}'`);
    }
    if (resolution.consequences?.length && evaluateGate(resolution.when, EMPTY) && from.includes("active") && !quest.visible_when) {
      addError(errors, `${at}.when`, "this resolution holds before anything happens, so its consequences would land at once");
    }
    (resolution.consequences ?? []).forEach((consequence, slot) => checkSet(consequence.set, `${at}.consequences.${slot}`, qualityByKey, reserved, true, errors));
  });
  checkPrecedence(quest, endings, path, errors);
};

const checkSteps = (quest: Quest, path: string, errors: ValidationError[]) => quest.steps.forEach((step, index) => {
  const target = step.alternative_of;
  if (target === undefined) return;
  const head = quest.steps[target];
  if (!head || target === index) addError(errors, `${path}.steps.${index}.alternative_of`, "alternative_of names another step of this quest");
  else if (head.alternative_of !== undefined || head.optional) addError(errors, `${path}.steps.${index}.alternative_of`, "alternative_of names a required step, not another alternative or an optional step");
  if (step.optional) addError(errors, `${path}.steps.${index}.optional`, "a step is optional or an alternative, not both");
});

const checkQuest = (quest: Quest, index: number, qualityByKey: Record<string, Quality>, rosterIds: Set<string>, reserved: ReadonlySet<string>, errors: ValidationError[]) => {
  const path = `quests.${index}`;
  questGates(quest).forEach(([field, gate]) => { if (gate) validateGate(gate, qualityByKey, `${path}.${field}`, errors); });
  checkProgress(quest.progress, path, qualityByKey, errors);
  quest.steps.forEach((step, at) => checkProgress(step.progress, `${path}.steps.${at}`, qualityByKey, errors));
  checkSteps(quest, path, errors);
  if (quest.failed_when && quest.done_when && evaluateGate(quest.done_when, EMPTY) && evaluateGate(quest.failed_when, EMPTY)) {
    addError(errors, `${path}.failed_when`, "done_when and failed_when both hold before anything has happened");
  }
  if (quest.reward && !quest.done_when) addError(errors, `${path}.reward`, "a reward is the consequence of done: add done_when, or give a resolution consequences");
  if (quest.reward && quest.done_when && evaluateGate(quest.done_when, EMPTY)) addError(errors, `${path}.reward`, "this quest is done before anything happens, so its reward would land at once");
  if (quest.offered_when && !quest.visible_when) addError(errors, `${path}.visible_when`, "an offered quest needs visible_when: the moment the player takes it on");
  if (quest.offered_when && quest.failed_when && timeOnly(quest.failed_when)) {
    addError(errors, `${path}.failed_when`, "an offered quest never fails on time alone");
  }
  if (quest.giver && !rosterIds.has(quest.giver)) addError(errors, `${path}.giver`, `'${quest.giver}' is not a roster id`);
  if (quest.promise && !quest.giver) addError(errors, `${path}.promise`, "a promise quest needs a giver: the cast member the player promised");
  checkSet(quest.reward?.set, `${path}.reward`, qualityByKey, reserved, false, errors);
  checkResolutions(quest, path, qualityByKey, reserved, errors);
};

export const questReservedKeys = (quests: readonly Quest[] | undefined): Set<string> => new Set((quests ?? []).flatMap((quest) => [
  questClosedKey(quest.id), ...questEndings(quest, true).flatMap((ending) => ending.consequences.map((consequence) => questConsequenceKey(quest.id, ending.id, consequence.id))),
]));

export const checkQuests = (quests: Quest[] | undefined, milestones: Milestone[] | undefined, qualityByKey: Record<string, Quality>, rosterIds: Set<string>, errors: ValidationError[]) => {
  unique((quests ?? []).map((quest) => quest.id), "quest", "quests", errors);
  unique((milestones ?? []).map((milestone) => milestone.id), "milestone", "milestones", errors);
  const reserved = questReservedKeys(quests);
  (quests ?? []).forEach((quest, index) => checkQuest(quest, index, qualityByKey, rosterIds, reserved, errors));
  (milestones ?? []).forEach((milestone, index) => validateGate(milestone.when, qualityByKey, `milestones.${index}.when`, errors));
};

export const addRewardQualities = (qualities: Quality[], quests: Quest[] | undefined, errors: ValidationError[]): Quality[] => {
  const kept = (quests ?? []).flatMap((quest): Quality[] => {
    const endings = questEndings(quest, true);
    const consequences = endings.flatMap((ending) => ending.consequences.map((consequence): Quality => ({
      key: questConsequenceKey(quest.id, ending.id, consequence.id), type: "int", source: "code", latching: true,
      rubric: `Set once by the story: the boundary this quest's ${ending.id} consequence ${consequence.id} applied`,
    })));
    const ids = [...new Set(endings.map((ending) => ending.id))];
    return [...(ids.length ? [{
      key: questClosedKey(quest.id), type: "enum", values: ids, source: "code", latching: true, rubric: "Set once by the story: how this quest was resolved",
    } satisfies Quality] : []), ...consequences];
  });
  const existing = new Set(qualities.map((quality) => quality.key));
  const seen = new Set<string>();
  kept.forEach((quality) => {
    if (existing.has(quality.key) || seen.has(quality.key)) addError(errors, `qualities.${quality.key}`, "this key is kept for a quest's state");
    seen.add(quality.key);
  });
  return [...qualities, ...kept.filter((quality, index) => !existing.has(quality.key) && kept.findIndex((other) => other.key === quality.key) === index)];
};
