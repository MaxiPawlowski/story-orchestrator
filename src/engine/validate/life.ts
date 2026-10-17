import {
  AGENDA_EVERY_DEFAULT, AGENDA_PACES, CALENDAR_KEY_PREFIX, CLOCK_DAY_KEY, CLOCK_MOVED_KEY, CLOCK_NIGHT_KEY, CLOCK_PART_KEY, CLOCK_READ_KEY, CLOCK_SKIP_DAYS_DEFAULT,
  CLOCK_STORY_TIME_KEY, CLOCK_TIME_KEY, MOOD_DEFAULT_VALUES, RELATIONSHIP_RANGE_DEFAULT,
  RELATIONSHIP_TOWARD_PLAYER, TURN_OOC_KEY, agendaChapterKey, agendaRepeatsKey, agendaStepKey, agendaWaitKey, isStoryTimeKey, moodAgeKey, moodKey,
  moodSceneKey, moodWasKey, relationshipKey, timeReachedKey,
  hasLabels, labelNextKey, labelShownKey, labelSinceKey, revealKey,
  type Agenda, type AgendaStep, type CalendarMonth, type CalendarSeason, type Checkpoint, type GateNode, type LifeMember, type MoodDecl, type MoodLasts,
  type PrimitiveValue, type PublicLabel, type Quality,
  type RelationshipDecl, type ScheduleEntry, type SecretLabel, type StoryCalendar, type StoryClock, type StoryLife, type TimedEffects, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { Blackboard } from "../blackboard";
import { evaluateGate, gateKeys } from "../gates";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { readCheckpointEffects } from "./checkpoints";
import { GAME_ID_PATTERN } from "./checks";
import { checkCommitments, commitmentQualities, readCommitments } from "./commitments";

const REL_KEYS = ["toward", "axes", "range", "step", "start", "label", "public", "secret"] as const;
const PUBLIC_KEYS = ["label", "when", "follows_feeling", "hold"] as const;
const SECRET_KEYS = ["id", "label", "revealed_when"] as const;
const SECRET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;
export const LABEL_TEXT_MAX = 40;
export const PUBLIC_LABELS_MAX = 6;
export const SECRET_LABELS_MAX = 4;
export const LABEL_HOLD_MAX = 5;
export const LABEL_READS_AXIS = "this label follows the hidden feeling, so the player could read the number's movement from it: "
  + "set follows_feeling: true to make that a stated choice, or gate it on an event";
const MOOD_KEYS = ["values", "baseline", "lasts"] as const;
const AGENDA_KEYS = ["id", "goal", "steps", "pace", "every"] as const;
const STEP_KEYS = ["text", "when", "effect", "public", "repeat"] as const;
const STEP_EFFECT_KEYS = ["world_info", "npc_replies"] as const;
const SCHEDULE_KEYS = ["when", "at"] as const;
const CLOCK_KEYS = ["times", "start_day", "start_part", "night", "max_skip_days"] as const;
const CALENDAR_KEYS = ["start", "months", "weekdays", "seasons", "label"] as const;
const CALENDAR_START_KEYS = ["year", "month", "day", "weekday"] as const;
const CALENDAR_NAME_MAX = 40;
const CALENDAR_MONTHS_MAX = 24;
const CLOCK_SKIP_DAYS_MAX = 365;
const AXIS_PATTERN = /^[a-z][a-z0-9]{0,23}$/;
export const LIFE_TEXT_MAX = 200;
export const LIFE_MEMBER_FIELDS = ["relationships", "mood", "agenda", "schedule", "commitments"] as const;

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

const readLabelText = (value: unknown, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  if (!text || text.length > LABEL_TEXT_MAX) return refuse(errors, path, `a label is text of at most ${LABEL_TEXT_MAX} characters`, null);
  return /[{}<>]/.test(text) ? refuse(errors, path, "a label is plain text: no macros or markup", null) : text;
};

const readPublicLabel = (value: unknown, path: string, errors: ValidationError[]): PublicLabel | null => {
  if (!isRecord(value)) return refuse(errors, path, "a public label is {label, when?}", null);
  rejectUnknownKeys(value, PUBLIC_KEYS, path, errors);
  const label = readLabelText(value.label, `${path}.label`, errors);
  const when = value.when === undefined ? null : readGate(value.when, `${path}.when`, errors);
  if (value.follows_feeling !== undefined && typeof value.follows_feeling !== "boolean") addError(errors, `${path}.follows_feeling`, "follows_feeling is true or false");
  const follows = value.follows_feeling === true;
  const hold = value.hold === undefined ? undefined : isInt(value.hold) && value.hold >= 1 && value.hold <= LABEL_HOLD_MAX
    ? value.hold : refuse(errors, `${path}.hold`, `hold is a whole number from 1 to ${LABEL_HOLD_MAX}`, undefined);
  if (hold !== undefined && !follows) addError(errors, `${path}.hold`, "hold is for a label that follows the feeling (follows_feeling: true)");
  if (!label) return null;
  return { label, ...(when ? { when } : {}), ...(follows ? { follows_feeling: true } : {}), ...(hold !== undefined && follows ? { hold } : {}) };
};

const readSecretLabel = (value: unknown, path: string, errors: ValidationError[]): SecretLabel | null => {
  if (!isRecord(value)) return refuse(errors, path, "a secret label is {id, label, revealed_when}", null);
  rejectUnknownKeys(value, SECRET_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!SECRET_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a secret label id is lowercase letters, digits and -");
  const label = readLabelText(value.label, `${path}.label`, errors);
  const revealed = value.revealed_when === undefined ? refuse(errors, `${path}.revealed_when`, "a secret label needs revealed_when", null)
    : readGate(value.revealed_when, `${path}.revealed_when`, errors);
  return label && revealed && SECRET_ID_PATTERN.test(id) ? { id, label, revealed_when: revealed } : null;
};

const readLabels = <T,>(value: unknown, path: string, max: number, read: (entry: unknown, at: string) => T | null, errors: ValidationError[]): T[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) return refuse(errors, path, `a list of at most ${max} labels`, []);
  return value.map((entry, index) => read(entry, `${path}.${index}`)).filter((item): item is T => item !== null);
};

const relationshipLabels = (value: Record<string, unknown>, path: string, errors: ValidationError[]): Pick<RelationshipDecl, "public" | "secret"> => {
  const shown = readLabels(value.public, `${path}.public`, PUBLIC_LABELS_MAX, (entry, at) => readPublicLabel(entry, at, errors), errors);
  const secret = readLabels(value.secret, `${path}.secret`, SECRET_LABELS_MAX, (entry, at) => readSecretLabel(entry, at, errors), errors);
  const words = new Set(shown.map((row) => row.label.toLowerCase()));
  secret.forEach((row, index) => {
    if (secret.findIndex((other) => other.id === row.id) !== index) addError(errors, `${path}.secret.${index}.id`, `duplicate secret label '${row.id}'`);
    if (words.has(row.label.toLowerCase())) addError(errors, `${path}.secret.${index}.label`, "a secret label must differ from every public label of this relationship");
  });
  return { ...(shown.length ? { public: shown } : {}), ...(secret.length ? { secret } : {}) };
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
  const labels = relationshipLabels(value, path, errors);
  return axes.length && toward ? { toward, axes, range, step, start, ...(label ? { label } : {}), ...labels } : null;
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
  const commitments = readCommitments(member.commitments, `${path}.commitments`, errors, readStepEffect);
  return {
    id, relationships, agenda, schedule: readArray(member.schedule, `${path}.schedule`, (entry, at) => readSchedule(entry, at, errors), errors), ...(mood ? { mood } : {}),
    ...(commitments ? { commitments } : {}),
  };
};

const readNames = (value: unknown, path: string, min: number, errors: ValidationError[]): string[] => {
  const names = Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim() && entry.trim().length <= CALENDAR_NAME_MAX)
    ? [...new Set((value as string[]).map((entry) => entry.trim()))] : null;
  return names && names.length >= min && names.length === (value as unknown[]).length
    ? names : refuse(errors, path, `at least ${min} distinct names of at most ${CALENDAR_NAME_MAX} characters`, []);
};

const readClock = (value: unknown, errors: ValidationError[]): StoryClock | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, "clock", "clock is {times, start_day?, start_part?, night?, max_skip_days?}", undefined);
  rejectUnknownKeys(value, CLOCK_KEYS, "clock", errors);
  const times = Array.isArray(value.times) && value.times.length >= 2 && value.times.every((entry) => typeof entry === "string" && entry.trim())
    ? [...new Set((value.times as string[]).map((entry) => entry.trim()))] : refuse(errors, "clock.times", "times are at least two names in order, such as [\"morning\", \"evening\", \"night\"]", []);
  const start = value.start_day === undefined ? undefined : isInt(value.start_day) && value.start_day >= 1
    ? value.start_day : refuse(errors, "clock.start_day", "start_day is a whole number of at least 1", undefined);
  const part = value.start_part === undefined ? undefined : typeof value.start_part === "string" && times.includes(value.start_part.trim())
    ? value.start_part.trim() : refuse(errors, "clock.start_part", "start_part is one of the times", undefined);
  const night = value.night === undefined ? undefined : Array.isArray(value.night) && value.night.every((entry) => typeof entry === "string" && times.includes(entry.trim()))
    ? [...new Set((value.night as string[]).map((entry) => entry.trim()))] : refuse(errors, "clock.night", "night lists times of day from times", undefined);
  const skip = value.max_skip_days === undefined ? undefined : isInt(value.max_skip_days) && value.max_skip_days >= 1 && value.max_skip_days <= CLOCK_SKIP_DAYS_MAX
    ? value.max_skip_days : refuse(errors, "clock.max_skip_days", `max_skip_days is a whole number from 1 to ${CLOCK_SKIP_DAYS_MAX}`, undefined);
  return times.length >= 2 ? {
    times, ...(start !== undefined ? { start_day: start } : {}), ...(part !== undefined ? { start_part: part } : {}), ...(night?.length ? { night } : {}),
    ...(skip !== undefined ? { max_skip_days: skip } : {}),
  } : undefined;
};

const readMonths = (value: unknown, errors: ValidationError[]): CalendarMonth[] => {
  const months = Array.isArray(value) && value.length >= 1 && value.length <= CALENDAR_MONTHS_MAX ? value.flatMap((entry, index): CalendarMonth[] => {
    const name = isRecord(entry) && typeof entry.name === "string" ? entry.name.trim() : "";
    if (isRecord(entry)) rejectUnknownKeys(entry, ["name", "days"], `calendar.months.${index}`, errors);
    if (name && name.length <= CALENDAR_NAME_MAX && isRecord(entry) && isInt(entry.days) && entry.days >= 1 && entry.days <= 100) return [{ name, days: entry.days }];
    return refuse(errors, `calendar.months.${index}`, `a month is {name, days}: a name of at most ${CALENDAR_NAME_MAX} characters and 1 to 100 days`, []);
  }) : refuse(errors, "calendar.months", `months are 1 to ${CALENDAR_MONTHS_MAX} entries of {name, days}`, []);
  months.forEach((month, index) => {
    if (months.findIndex((other) => other.name === month.name) !== index) addError(errors, `calendar.months.${index}.name`, `a second month named '${month.name}'`);
  });
  return months;
};

const monthIndex = (value: unknown, months: CalendarMonth[]): number =>
  (typeof value === "string" ? months.findIndex((month) => month.name === value.trim()) : isInt(value) && value >= 1 && value <= months.length ? value - 1 : -1);

const readSeasons = (value: unknown, months: CalendarMonth[], errors: ValidationError[]): CalendarSeason[] | undefined => {
  if (value === undefined) return undefined;
  const seasons = Array.isArray(value) && value.length >= 1 ? value.flatMap((entry, index): CalendarSeason[] => {
    const name = isRecord(entry) && typeof entry.name === "string" ? entry.name.trim() : "";
    const from = isRecord(entry) ? monthIndex(entry.from_month, months) : -1;
    if (isRecord(entry)) rejectUnknownKeys(entry, ["name", "from_month"], `calendar.seasons.${index}`, errors);
    return name && name.length <= CALENDAR_NAME_MAX && from >= 0 ? [{ name, from_month: from }]
      : refuse(errors, `calendar.seasons.${index}`, "a season is {name, from_month}: from_month names a month, or its number from 1", []);
  }) : refuse(errors, "calendar.seasons", "seasons are a list of {name, from_month}", []);
  const sorted = [...seasons].sort((left, right) => left.from_month - right.from_month);
  sorted.forEach((season, index) => { if (index && sorted[index - 1].from_month === season.from_month) addError(errors, "calendar.seasons", "two seasons start in the same month"); });
  return sorted.length ? sorted : undefined;
};

const readWeekday = (value: unknown, weekdays: string[] | undefined, errors: ValidationError[]): number => {
  if (value === undefined) return 0;
  if (!weekdays?.length) return refuse(errors, "calendar.start.weekday", "start.weekday needs weekdays", 0);
  if (typeof value === "string" && weekdays.includes(value.trim())) return weekdays.indexOf(value.trim());
  return isInt(value) && value >= 0 && value < weekdays.length ? value : refuse(errors, "calendar.start.weekday", "start.weekday names a weekday, or its index from 0", 0);
};

const readCalendar = (value: unknown, clock: StoryClock | undefined, errors: ValidationError[]): StoryCalendar | undefined => {
  if (value === undefined) return undefined;
  if (!clock) return refuse(errors, "calendar", "a calendar needs a clock: add clock {times}", undefined);
  if (!isRecord(value)) return refuse(errors, "calendar", "calendar is {start, months, weekdays?, seasons?, label?}", undefined);
  rejectUnknownKeys(value, CALENDAR_KEYS, "calendar", errors);
  const months = readMonths(value.months, errors);
  const weekdays = value.weekdays === undefined ? undefined : readNames(value.weekdays, "calendar.weekdays", 2, errors);
  const seasons = readSeasons(value.seasons, months, errors);
  const start = isRecord(value.start) ? value.start : refuse(errors, "calendar.start", "start is {month, day, year?, weekday?}: the date of story day 1", {} as Record<string, unknown>);
  rejectUnknownKeys(start, CALENDAR_START_KEYS, "calendar.start", errors);
  const month = monthIndex(start.month, months);
  if (month < 0) addError(errors, "calendar.start.month", "start.month names a month, or its number from 1");
  const day = isInt(start.day) && month >= 0 && start.day >= 1 && start.day <= months[month].days ? start.day : refuse(errors, "calendar.start.day", "start.day is a day of start.month", 1);
  const year = start.year === undefined ? 1 : isInt(start.year) ? start.year : refuse(errors, "calendar.start.year", "start.year is a whole number", 1);
  const weekday = readWeekday(start.weekday, weekdays, errors);
  const label = value.label === undefined ? "date" : value.label === "day" || value.label === "date" ? value.label : refuse(errors, "calendar.label", "label is day or date", "date" as const);
  if (!months.length || month < 0) return undefined;
  return { start: { year, month, day, weekday }, months, ...(weekdays?.length ? { weekdays } : {}), ...(seasons ? { seasons } : {}), label };
};

const timelineCheckpoints = (json: Record<string, unknown>): string[] => {
  const widgets = (Array.isArray(json.widgets) ? json.widgets : []).filter((widget): widget is Record<string, unknown> => isRecord(widget) && widget.kind === "timeline");
  if (!widgets.length) return [];
  const ids = (Array.isArray(json.checkpoints) ? json.checkpoints : []).flatMap((checkpoint) => (isRecord(checkpoint) && typeof checkpoint.id === "string" ? [checkpoint.id] : []));
  return ids.filter((id) => widgets.some((widget) => !isRecord(widget.dates) || !(id in widget.dates)));
};

export const readLife = (json: Record<string, unknown>, errors: ValidationError[]): StoryLife | undefined => {
  const roster = Array.isArray(json.roster) ? json.roster.filter(isRecord) : [];
  const ids = new Set(roster.map((member) => (typeof member.id === "string" ? member.id : "")));
  const members = roster.flatMap((member, index) => readMember(member, `roster.${index}`, ids, errors) ?? []);
  const clock = readClock(json.clock, errors);
  const calendar = readCalendar(json.calendar, clock, errors);
  const reached = clock ? timelineCheckpoints(json) : [];
  const names = Object.fromEntries(roster.flatMap((member) => (typeof member.id === "string" && typeof member.name === "string" && member.name.trim() ? [[member.id, member.name.trim()]] : [])));
  return members.length || clock ? {
    members, ...(clock ? { clock } : {}), ...(calendar ? { calendar } : {}), ...(reached.length ? { reached } : {}), ...(Object.keys(names).length ? { names } : {}),
  } : undefined;
};

const code = (key: string, type: Quality["type"], rubric: string, extra: Partial<Quality> = {}): Quality => ({ key, type, source: "code", rubric, ...extra });

const nameOf = (life: StoryLife, id: string): string => life.names?.[id] ?? id;

const relationshipQualities = (member: LifeMember, life: StoryLife): Quality[] => member.relationships.flatMap((relationship) => relationship.axes.map((axis): Quality => {
  const [min, max] = relationship.range;
  const toward = relationship.toward === RELATIONSHIP_TOWARD_PLAYER ? "the player" : nameOf(life, relationship.toward);
  return {
    key: relationshipKey(member.id, relationship.toward, axis), type: "int", source: "extractor", read_as: "rating",
    rubric: `How much ${nameOf(life, member.id)} feels ${axis} toward ${toward}, as the window shows it: from ${min} (the opposite) to ${max} (completely)`,
    criteria: { levels: Array.from({ length: max - min + 1 }, (_, index) => min + index).map((value) => ({ value, label: `${value}` })) },
    step_rule: { step: relationship.step, min, max, start: relationship.start },
  };
}));

const labelQualities = (member: LifeMember): Quality[] => member.relationships.flatMap((relationship) => [
  ...(relationship.secret ?? []).map((secret) => code(revealKey(member.id, relationship.toward, secret.id), "int",
    `The boundary at which the player learned ${member.id}'s secret label ${secret.id}, once ever`, { latching: true, monotonic: true })),
  ...(relationship.public?.some((row) => row.hold) ? [
    code(labelShownKey(member.id, relationship.toward), "int", "The public label row shown now, after its hold (-1: none)"),
    code(labelNextKey(member.id, relationship.toward), "int", "The public label row waiting out its hold"),
    code(labelSinceKey(member.id, relationship.toward), "int", "The boundary the waiting row began to hold"),
  ] : []),
]);

const moodQualities = (member: LifeMember, life: StoryLife): Quality[] => (member.mood ? [
  { key: moodKey(member.id), type: "enum", values: member.mood.values, source: "extractor", rubric: `${nameOf(life, member.id)}'s mood in this scene, as the window shows it` },
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

const calendarQualities = (calendar: StoryCalendar): Quality[] => [
  code(`${CALENDAR_KEY_PREFIX}year`, "int", "The calendar year"),
  code(`${CALENDAR_KEY_PREFIX}month`, "enum", "The calendar month", { values: calendar.months.map((month) => month.name) }),
  code(`${CALENDAR_KEY_PREFIX}day_of_month`, "int", "The day of the calendar month"),
  ...(calendar.weekdays ? [code(`${CALENDAR_KEY_PREFIX}weekday`, "enum", "The day of the week", { values: calendar.weekdays })] : []),
  ...(calendar.seasons ? [code(`${CALENDAR_KEY_PREFIX}season`, "enum", "The season", { values: calendar.seasons.map((season) => season.name) })] : []),
];

const clockQualities = (life: StoryLife & { clock: StoryClock }): Quality[] => [
  { key: CLOCK_READ_KEY, type: "enum", values: life.clock.times, source: "extractor", read_as: "choice", rubric: "The time of day in the story, as the window shows it" },
  code(CLOCK_STORY_TIME_KEY, "int", "Times of day passed since the story began", { monotonic: true }),
  code(CLOCK_DAY_KEY, "int", "The story's day count", { monotonic: true }),
  code(CLOCK_TIME_KEY, "enum", "The time of day in the story", { values: life.clock.times }),
  code(CLOCK_PART_KEY, "int", "The time of day as a number, 0 for the first"),
  code(CLOCK_NIGHT_KEY, "bool", "Whether this time of day is one of the clock's night times"),
  code(CLOCK_MOVED_KEY, "int", "The last message at which the author or a checkpoint moved the clock"),
  ...(life.calendar ? calendarQualities(life.calendar) : []),
  ...(life.reached ?? []).map((id) => code(timeReachedKey(id), "int", `The story time at which ${id} was first reached`)),
];

export const addLifeQualities = (qualities: Quality[], life: StoryLife | undefined, errors: ValidationError[]): Quality[] => {
  if (!life) return qualities;
  const ticks = life.members.some((member) => member.agenda.length) ? [code(TURN_OOC_KEY, "bool", "Whether this boundary's player line was out of character")] : [];
  const members = life.members.flatMap((member) => [
    ...relationshipQualities(member, life), ...labelQualities(member), ...moodQualities(member, life), ...agendaQualities(member), ...commitmentQualities(member),
  ]);
  const added = [...members, ...(life.clock ? clockQualities({ ...life, clock: life.clock }) : []), ...ticks];
  const existing = new Set(qualities.map((quality) => quality.key));
  const compiled = new Set(added.map((quality) => quality.key));
  added.filter((quality) => existing.has(quality.key)).forEach((quality) => addError(errors, `qualities.${quality.key}`, "this key is kept for character life or the story clock"));
  if (life.clock) {
    qualities.filter((quality) => !compiled.has(quality.key) && (isStoryTimeKey(quality.key) || quality.key.startsWith("life_time_")))
      .forEach((quality) => addError(errors, `qualities.${quality.key}`, "this key is kept for the story clock"));
  }
  return [...qualities, ...added.filter((quality) => !existing.has(quality.key))];
};

const lifeGates = (member: LifeMember): Array<[string, GateNode]> => [
  ...member.agenda.flatMap((agenda, at) => agenda.steps.flatMap((step, index): Array<[string, GateNode]> => (step.when ? [[`agenda.${at}.steps.${index}.when`, step.when]] : []))),
  ...member.schedule.map((entry, index): [string, GateNode] => [`schedule.${index}.when`, entry.when]),
];

export const AGENDA_NO_CHAPTERS = "pace per_chapter needs chapters, and this story declares none, so the agenda would move once and then never again: "
  + "use per_n_boundaries with every, or add chapters";

const readsAxis = (gate: GateNode): boolean => gateKeys(gate).some((key) => key.startsWith("rel_"));

const checkLabels = (member: LifeMember, path: string, qualityByKey: Record<string, Quality>, start: Readonly<Record<string, PrimitiveValue>>, errors: ValidationError[]) =>
  member.relationships.forEach((relationship, at) => {
    const base = `${path}.relationships.${at}`;
    (relationship.public ?? []).forEach((row, index) => {
      if (!row.when) return;
      validateGate(row.when, qualityByKey, `${base}.public.${index}.when`, errors);
      if (!row.follows_feeling && readsAxis(row.when)) addError(errors, `${base}.public.${index}.when`, LABEL_READS_AXIS);
    });
    (relationship.secret ?? []).forEach((row, index) => {
      validateGate(row.revealed_when, qualityByKey, `${base}.secret.${index}.revealed_when`, errors);
      if (evaluateGate(row.revealed_when, { get: (key) => start[key] })) {
        addError(errors, `${base}.secret.${index}.revealed_when`, "this secret's gate holds before anything happens, so the player would know it from the first turn");
      }
    });
  });

const TIME_SHAPE = "time is {advance: {days?, parts?}} or {to: {part, next_day?}}";

export const timeEffectProblem = (effect: unknown, clock: StoryClock): string | null => {
  if (!isRecord(effect) || Object.keys(effect).length !== 1) return TIME_SHAPE;
  const parts = clock.times.length;
  const limit = clock.max_skip_days ?? CLOCK_SKIP_DAYS_DEFAULT;
  if (isRecord(effect.advance)) {
    const { days = 0, parts: steps = 0, ...rest } = effect.advance;
    if (Object.keys(rest).length) return `advance has days and parts only, not ${Object.keys(rest).join(", ")}`;
    if (!isInt(days) || !isInt(steps) || days < 0 || steps < 0) return "time only moves forward: days and parts are whole numbers of at least 0";
    if (days === 0 && steps === 0) return "an advance of nothing: give days or parts";
    return days * parts + steps > limit * parts ? `an advance of at most ${limit} days (clock.max_skip_days)` : null;
  }
  if (isRecord(effect.to)) {
    const { part, next_day: nextDay, ...rest } = effect.to;
    if (Object.keys(rest).length) return `to has part and next_day only, not ${Object.keys(rest).join(", ")}`;
    if (typeof part !== "string" || !clock.times.includes(part)) return `to.part is one of the times: ${clock.times.join(", ")}`;
    return nextDay === undefined || typeof nextDay === "boolean" ? null : "next_day is true or false";
  }
  return TIME_SHAPE;
};

const checkTimeEffects = (clock: StoryClock | undefined, checkpoints: readonly Checkpoint[], startId: string, errors: ValidationError[]) => {
  checkpoints.forEach((checkpoint, index) => {
    const effect = (checkpoint.effects as TimedEffects | undefined)?.time;
    if (effect === undefined) return;
    const path = `checkpoints.${index}.effects.time`;
    if (!clock) return addError(errors, path, "effects.time needs a clock: add clock {times}");
    if (checkpoint.id === startId) return addError(errors, path, "the story starts at clock.start_day and clock.start_part; effects.time runs when a later checkpoint is entered");
    const problem = timeEffectProblem(effect, clock);
    if (problem) addError(errors, path, problem);
  });
};

export const checkLife = (
  life: StoryLife | undefined, roster: Array<{ id: string }>, qualityByKey: Record<string, Quality>, errors: ValidationError[], hasChapters = false,
  checkpoints: readonly Checkpoint[] = [], startId = "",
) => {
  const start = life?.members.some((member) => member.relationships.some(hasLabels) || member.commitments?.length) ? new Blackboard({ qualityByKey }).entries() : {};
  checkTimeEffects(life?.clock, checkpoints, startId, errors);
  for (const member of life?.members ?? []) {
    const path = `roster.${roster.findIndex((entry) => entry.id === member.id)}`;
    lifeGates(member).forEach(([field, gate]) => validateGate(gate, qualityByKey, `${path}.${field}`, errors));
    checkLabels(member, path, qualityByKey, start, errors);
    checkCommitments(member, path, qualityByKey, start, Boolean(life?.clock), errors);
    if (!hasChapters) member.agenda.forEach((agenda, index) => { if (agenda.pace === "per_chapter") addError(errors, `${path}.agenda.${index}.pace`, AGENDA_NO_CHAPTERS); });
  }
};
