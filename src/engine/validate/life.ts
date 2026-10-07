import {
  AGENDA_EVERY_DEFAULT, AGENDA_PACES, CLOCK_DAY_KEY, CLOCK_SEEN_KEY, CLOCK_TIME_KEY, MOOD_DEFAULT_VALUES, RELATIONSHIP_RANGE_DEFAULT,
  RELATIONSHIP_TOWARD_PLAYER, TURN_OOC_KEY, agendaChapterKey, agendaRepeatsKey, agendaStepKey, agendaWaitKey, moodAgeKey, moodKey,
  moodSceneKey, moodWasKey, relationshipKey,
  type Agenda, type AgendaStep, type GateNode, type LifeMember, type MoodDecl, type MoodLasts, type Quality, type RelationshipDecl,
  type ScheduleEntry, type StoryClock, type StoryLife, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { readCheckpointEffects } from "./checkpoints";
import { GAME_ID_PATTERN } from "./checks";

const REL_KEYS = ["toward", "axes", "range", "step", "start", "label"] as const;
const MOOD_KEYS = ["values", "baseline", "lasts"] as const;
const AGENDA_KEYS = ["id", "goal", "steps", "pace", "every"] as const;
const STEP_KEYS = ["text", "when", "effect", "public", "repeat"] as const;
const STEP_EFFECT_KEYS = ["world_info", "npc_replies"] as const;
const SCHEDULE_KEYS = ["when", "at"] as const;
const CLOCK_KEYS = ["times", "start_day"] as const;
const AXIS_PATTERN = /^[a-z][a-z0-9]{0,23}$/;
export const LIFE_TEXT_MAX = 200;
export const LIFE_MEMBER_FIELDS = ["relationships", "mood", "agenda", "schedule"] as const;

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

const readText = (value: unknown, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  return text && text.length <= LIFE_TEXT_MAX ? text : refuse(errors, path, `text of at most ${LIFE_TEXT_MAX} characters is required`, null);
};

const readRange = (value: unknown, path: string, errors: ValidationError[]): [number, number] => {
  if (value === undefined) return RELATIONSHIP_RANGE_DEFAULT;
  if (Array.isArray(value) && value.length === 2 && isInt(value[0]) && isInt(value[1]) && value[1] - value[0] >= 2 && value[1] - value[0] <= 20) {
    return [value[0], value[1]];
  }
  return refuse(errors, path, "range is [low, high]: whole numbers 2 to 20 apart", RELATIONSHIP_RANGE_DEFAULT);
};

const readRelationship = (value: unknown, path: string, ids: Set<string>, holder: string, errors: ValidationError[]): RelationshipDecl | null => {
  if (!isRecord(value)) return refuse(errors, path, "a relationship is {toward, axes}", null);
  rejectUnknownKeys(value, REL_KEYS, path, errors);
  const toward = asString(value.toward)?.trim() ?? "";
  if (toward !== RELATIONSHIP_TOWARD_PLAYER && !ids.has(toward)) addError(errors, `${path}.toward`, `toward is a roster id or "player"`);
  if (toward === holder) addError(errors, `${path}.toward`, "a member holds no relationship toward itself");
  const axes = Array.isArray(value.axes) ? value.axes.filter((axis): axis is string => typeof axis === "string" && AXIS_PATTERN.test(axis)) : [];
  if (!Array.isArray(value.axes) || !axes.length || axes.length !== value.axes.length || new Set(axes).size !== axes.length) {
    addError(errors, `${path}.axes`, "axes are distinct lowercase words, such as [\"trust\", \"fear\"]");
  }
  const range = readRange(value.range, `${path}.range`, errors);
  const step = value.step === undefined ? 1 : isInt(value.step) && value.step >= 1 && value.step <= range[1] - range[0]
    ? value.step : refuse(errors, `${path}.step`, "step is a whole number of at least 1", 1);
  const start = value.start === undefined ? Math.max(range[0], Math.min(range[1], 0)) : isInt(value.start) && value.start >= range[0] && value.start <= range[1]
    ? value.start : refuse(errors, `${path}.start`, "start is a whole number inside range", range[0]);
  const label = value.label === undefined ? null : readText(value.label, `${path}.label`, errors);
  return axes.length && toward ? { toward, axes, range, step, start, ...(label ? { label } : {}) } : null;
};

const readLasts = (value: unknown, path: string, errors: ValidationError[]): MoodLasts => {
  if (value === undefined) return { until: "scene_break" };
  if (isRecord(value) && value.until === "scene_break" && Object.keys(value).length === 1) return { until: "scene_break" };
  if (isRecord(value) && isInt(value.boundaries) && value.boundaries >= 1 && Object.keys(value).length === 1) return { boundaries: value.boundaries };
  return refuse(errors, path, "lasts is {boundaries: n} or {until: \"scene_break\"}", { until: "scene_break" });
};

const readMood = (value: unknown, path: string, errors: ValidationError[]): MoodDecl | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "mood is {baseline, values?, lasts?}", undefined);
  rejectUnknownKeys(value, MOOD_KEYS, path, errors);
  const values = value.values === undefined ? [...MOOD_DEFAULT_VALUES]
    : Array.isArray(value.values) && value.values.length >= 2 && value.values.every((entry) => typeof entry === "string" && AXIS_PATTERN.test(entry))
      ? [...new Set(value.values as string[])] : refuse(errors, `${path}.values`, "values are at least two lowercase words", [...MOOD_DEFAULT_VALUES]);
  const baseline = asString(value.baseline)?.trim() ?? values[0];
  if (!values.includes(baseline)) addError(errors, `${path}.baseline`, "baseline is one of the mood values");
  return { values, baseline, lasts: readLasts(value.lasts, `${path}.lasts`, errors) };
};

const readStepEffect = (value: unknown, path: string, errors: ValidationError[]): AgendaStep["effect"] => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "effect is {world_info?, npc_replies?}", undefined);
  if (value.cast_changes !== undefined) addError(errors, `${path}.cast_changes`, "an agenda never changes the cast: that is a checkpoint effect");
  rejectUnknownKeys(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "cast_changes")), STEP_EFFECT_KEYS, path, errors);
  const effects = readCheckpointEffects(value, path, errors);
  (effects?.npc_replies ?? []).forEach((reply, index) => {
    if (reply.trigger !== "onEnter") addError(errors, `${path}.npc_replies.${index}.trigger`, "an agenda step's reply fires once, when the step lands: trigger onEnter");
  });
  const kept = {
    ...(value.world_info !== undefined ? { world_info: value.world_info } : {}),
    ...(effects?.npc_replies?.length ? { npc_replies: effects.npc_replies } : {}),
  };
  return Object.keys(kept).length ? kept : undefined;
};

const readStep = (value: unknown, path: string, errors: ValidationError[]): AgendaStep | null => {
  if (!isRecord(value)) return refuse(errors, path, "a step is {text, when?, effect?}", null);
  rejectUnknownKeys(value, STEP_KEYS, path, errors);
  const text = readText(value.text, `${path}.text`, errors);
  const when = value.when === undefined ? null : readGate(value.when, `${path}.when`, errors);
  if (value.public !== undefined && typeof value.public !== "boolean") addError(errors, `${path}.public`, "public is true or false");
  if (value.repeat !== undefined && typeof value.repeat !== "boolean") addError(errors, `${path}.repeat`, "repeat is true or false");
  const effect = readStepEffect(value.effect, `${path}.effect`, errors);
  if (!text) return null;
  return { text, ...(when ? { when } : {}), ...(effect ? { effect } : {}), ...(value.public === true ? { public: true } : {}), ...(value.repeat === true ? { repeat: true } : {}) };
};

const readAgenda = (value: unknown, path: string, errors: ValidationError[]): Agenda | null => {
  if (!isRecord(value)) return refuse(errors, path, "an agenda is {id, goal, steps, pace}", null);
  rejectUnknownKeys(value, AGENDA_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id) || id.includes("_")) addError(errors, `${path}.id`, "an agenda id is a lowercase slug without underscores");
  const goal = readText(value.goal, `${path}.goal`, errors);
  const steps = Array.isArray(value.steps) && value.steps.length
    ? value.steps.map((entry, index) => readStep(entry, `${path}.steps.${index}`, errors)).filter((step): step is AgendaStep => step !== null)
    : refuse(errors, `${path}.steps`, "an agenda needs at least one step", []);
  steps.slice(0, -1).forEach((step, index) => { if (step.repeat) addError(errors, `${path}.steps.${index}.repeat`, "only the last step repeats"); });
  const pace = isOneOf(value.pace, AGENDA_PACES) ? value.pace : refuse(errors, `${path}.pace`, "pace is per_chapter or per_n_boundaries", "per_n_boundaries" as const);
  const every = value.every === undefined ? undefined : isInt(value.every) && value.every >= 1 ? value.every : refuse(errors, `${path}.every`, "every is a whole number of at least 1", undefined);
  if (every !== undefined && pace !== "per_n_boundaries") addError(errors, `${path}.every`, "every applies to per_n_boundaries only");
  if (!goal || !GAME_ID_PATTERN.test(id) || id.includes("_") || !steps.length) return null;
  return { id, goal, steps, pace, ...(pace === "per_n_boundaries" ? { every: every ?? AGENDA_EVERY_DEFAULT } : {}) };
};

const readSchedule = (value: unknown, path: string, errors: ValidationError[]): ScheduleEntry | null => {
  if (!isRecord(value)) return refuse(errors, path, "a schedule entry is {when, at}", null);
  rejectUnknownKeys(value, SCHEDULE_KEYS, path, errors);
  const when = value.when === undefined ? refuse(errors, `${path}.when`, "a schedule entry needs when", null) : readGate(value.when, `${path}.when`, errors);
  const at = readText(value.at, `${path}.at`, errors);
  return when && at ? { when, at } : null;
};

const readArray = <T,>(value: unknown, path: string, read: (entry: unknown, at: string) => T | null, errors: ValidationError[]): T[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return refuse(errors, path, "a list is required", []);
  return value.map((entry, index) => read(entry, `${path}.${index}`)).filter((item): item is T => item !== null);
};

const readMember = (member: Record<string, unknown>, path: string, ids: Set<string>, errors: ValidationError[]): LifeMember | null => {
  const id = typeof member.id === "string" ? member.id : "";
  if (!LIFE_MEMBER_FIELDS.some((field) => member[field] !== undefined)) return null;
  if (!GAME_ID_PATTERN.test(id)) return refuse(errors, `${path}.id`, "a member with relationships, mood, agenda or schedule needs a lowercase slug id", null);
  const relationships = readArray(member.relationships, `${path}.relationships`, (entry, at) => readRelationship(entry, at, ids, id, errors), errors);
  const towards = relationships.map((entry) => entry.toward);
  towards.forEach((toward, index) => { if (towards.indexOf(toward) !== index) addError(errors, `${path}.relationships.${index}.toward`, `a second relationship toward '${toward}'`); });
  const agenda = readArray(member.agenda, `${path}.agenda`, (entry, at) => readAgenda(entry, at, errors), errors);
  agenda.forEach((entry, index) => { if (agenda.findIndex((other) => other.id === entry.id) !== index) addError(errors, `${path}.agenda.${index}.id`, `duplicate agenda '${entry.id}'`); });
  const mood = readMood(member.mood, `${path}.mood`, errors);
  return { id, relationships, agenda, schedule: readArray(member.schedule, `${path}.schedule`, (entry, at) => readSchedule(entry, at, errors), errors), ...(mood ? { mood } : {}) };
};

const readClock = (value: unknown, errors: ValidationError[]): StoryClock | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, "clock", "clock is {times, start_day?}", undefined);
  rejectUnknownKeys(value, CLOCK_KEYS, "clock", errors);
  const times = Array.isArray(value.times) && value.times.length >= 2 && value.times.every((entry) => typeof entry === "string" && entry.trim())
    ? [...new Set((value.times as string[]).map((entry) => entry.trim()))] : refuse(errors, "clock.times", "times are at least two names in order, such as [\"morning\", \"evening\", \"night\"]", []);
  const start = value.start_day === undefined ? undefined : isInt(value.start_day) && value.start_day >= 1
    ? value.start_day : refuse(errors, "clock.start_day", "start_day is a whole number of at least 1", undefined);
  return times.length >= 2 ? { times, ...(start !== undefined ? { start_day: start } : {}) } : undefined;
};

export const readLife = (json: Record<string, unknown>, errors: ValidationError[]): StoryLife | undefined => {
  const roster = Array.isArray(json.roster) ? json.roster.filter(isRecord) : [];
  const ids = new Set(roster.map((member) => (typeof member.id === "string" ? member.id : "")));
  const members = roster.flatMap((member, index) => readMember(member, `roster.${index}`, ids, errors) ?? []);
  const clock = readClock(json.clock, errors);
  return members.length || clock ? { members, ...(clock ? { clock } : {}) } : undefined;
};

const code = (key: string, type: Quality["type"], rubric: string, extra: Partial<Quality> = {}): Quality => ({ key, type, source: "code", rubric, ...extra });

const relationshipQualities = (member: LifeMember): Quality[] => member.relationships.flatMap((relationship) => relationship.axes.map((axis): Quality => {
  const [min, max] = relationship.range;
  const toward = relationship.toward === RELATIONSHIP_TOWARD_PLAYER ? "the player" : relationship.toward;
  return {
    key: relationshipKey(member.id, relationship.toward, axis), type: "int", source: "extractor", read_as: "rating",
    rubric: `How much ${member.id} feels ${axis} toward ${toward}, as the window shows it: from ${min} (the opposite) to ${max} (completely)`,
    criteria: { levels: Array.from({ length: max - min + 1 }, (_, index) => min + index).map((value) => ({ value, label: `${value}` })) },
    step_rule: { step: relationship.step, min, max, start: relationship.start },
  };
}));

const moodQualities = (member: LifeMember): Quality[] => (member.mood ? [
  { key: moodKey(member.id), type: "enum", values: member.mood.values, source: "extractor", rubric: `${member.id}'s mood in this scene, as the window shows it` },
  code(moodAgeKey(member.id), "int", "Boundaries since this mood was last read"),
  code(moodWasKey(member.id), "int", "The read of this mood last seen"),
  code(moodSceneKey(member.id), "string", "The scene this mood was read in"),
] : []);

const agendaQualities = (member: LifeMember): Quality[] => member.agenda.flatMap((agenda) => [
  code(agendaStepKey(member.id, agenda.id), "int", `Steps of ${member.id}'s agenda ${agenda.id} done off stage`, { monotonic: true }),
  code(agendaWaitKey(member.id, agenda.id), "int", "In-fiction boundaries since the agenda last moved"),
  code(agendaChapterKey(member.id, agenda.id), "string", "The chapter the agenda last moved in"),
  ...(agenda.steps.at(-1)?.repeat ? [code(agendaRepeatsKey(member.id, agenda.id), "int", "Times the agenda's last step happened", { monotonic: true })] : []),
]);

const clockQualities = (clock: StoryClock): Quality[] => [
  {
    key: CLOCK_TIME_KEY, type: "enum", values: clock.times, source: "extractor", read_as: "choice",
    rubric: "The time of day in the story, as the window shows it",
    step_rule: { step: 1, cycle: true },
  },
  code(CLOCK_DAY_KEY, "int", "The story's day count", { monotonic: true }),
  code(CLOCK_SEEN_KEY, "string", "The time of day last seen by the clock"),
];

export const addLifeQualities = (qualities: Quality[], life: StoryLife | undefined, errors: ValidationError[]): Quality[] => {
  if (!life) return qualities;
  const ticks = life.members.some((member) => member.agenda.length) ? [code(TURN_OOC_KEY, "bool", "Whether this boundary's player line was out of character")] : [];
  const members = life.members.flatMap((member) => [...relationshipQualities(member), ...moodQualities(member), ...agendaQualities(member)]);
  const added = [...members, ...(life.clock ? clockQualities(life.clock) : []), ...ticks];
  const existing = new Set(qualities.map((quality) => quality.key));
  added.filter((quality) => existing.has(quality.key)).forEach((quality) => addError(errors, `qualities.${quality.key}`, "this key is kept for character life or the story clock"));
  return [...qualities, ...added.filter((quality) => !existing.has(quality.key))];
};

const lifeGates = (member: LifeMember): Array<[string, GateNode]> => [
  ...member.agenda.flatMap((agenda, at) => agenda.steps.flatMap((step, index): Array<[string, GateNode]> => (step.when ? [[`agenda.${at}.steps.${index}.when`, step.when]] : []))),
  ...member.schedule.map((entry, index): [string, GateNode] => [`schedule.${index}.when`, entry.when]),
];

export const checkLife = (life: StoryLife | undefined, roster: Array<{ id: string }>, qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  for (const member of life?.members ?? []) {
    const path = `roster.${roster.findIndex((entry) => entry.id === member.id)}`;
    lifeGates(member).forEach(([field, gate]) => validateGate(gate, qualityByKey, `${path}.${field}`, errors));
  }
};
