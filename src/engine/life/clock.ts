import {
  CALENDAR_KEY_PREFIX, CLOCK_DAY_KEY, CLOCK_MOVED_KEY, CLOCK_NIGHT_KEY, CLOCK_PART_KEY, CLOCK_READ_KEY, CLOCK_SKIP_DAYS_DEFAULT, CLOCK_STORY_TIME_KEY, CLOCK_TIME_KEY,
  clockStart, timeReachedKey, type NormalizedStory, type PrimitiveValue, type StoryCalendar, type StoryClock, type TimedEffects, type TimeEffect,
} from "../schema";
import type { BoundaryLogEntry, DerivedQualityView, EntryView } from "../engine";
import { dateOf, ordinal } from "./calendar";

type Write = { q: string; v: PrimitiveValue };
type Values = Readonly<Record<string, PrimitiveValue>>;

export const currentTime = (clock: StoryClock, values: Values): number => {
  const time = values[CLOCK_STORY_TIME_KEY];
  return typeof time === "number" ? time : clockStart(clock);
};

export const dayOf = (clock: StoryClock, time: number): number => Math.floor(time / clock.times.length) + 1;

export const partOf = (clock: StoryClock, time: number): number => time % clock.times.length;

export const maxSkip = (clock: StoryClock): number => (clock.max_skip_days ?? CLOCK_SKIP_DAYS_DEFAULT) * clock.times.length;

export const forwardToPart = (clock: StoryClock, time: number, part: number, nextDay = false): number => {
  const parts = clock.times.length;
  const at = partOf(clock, time);
  if (part > at) return time + part - at;
  if (part === at) return nextDay ? time + parts : time;
  return time + parts - at + part;
};

export const applyTimeEffect = (clock: StoryClock, time: number, effect: TimeEffect): number => {
  const moved = "advance" in effect
    ? time + (effect.advance.days ?? 0) * clock.times.length + (effect.advance.parts ?? 0)
    : forwardToPart(clock, time, clock.times.indexOf(effect.to.part), effect.to.next_day === true);
  return Math.min(time + maxSkip(clock), Math.max(time, moved));
};

export const calendarValues = (calendar: StoryCalendar, day: number): Record<string, PrimitiveValue> => {
  const date = dateOf(calendar, day - 1);
  return {
    [`${CALENDAR_KEY_PREFIX}year`]: date.year,
    [`${CALENDAR_KEY_PREFIX}month`]: calendar.months[date.month].name,
    [`${CALENDAR_KEY_PREFIX}day_of_month`]: date.day,
    ...(date.weekday !== undefined && calendar.weekdays ? { [`${CALENDAR_KEY_PREFIX}weekday`]: calendar.weekdays[date.weekday] } : {}),
    ...(date.season !== undefined && calendar.seasons ? { [`${CALENDAR_KEY_PREFIX}season`]: calendar.seasons[date.season].name } : {}),
  };
};

export const timeValues = (clock: StoryClock, calendar: StoryCalendar | undefined, time: number): Record<string, PrimitiveValue> => {
  const part = partOf(clock, time);
  const day = dayOf(clock, time);
  return {
    [CLOCK_STORY_TIME_KEY]: time, [CLOCK_DAY_KEY]: day, [CLOCK_TIME_KEY]: clock.times[part], [CLOCK_PART_KEY]: part,
    [CLOCK_NIGHT_KEY]: (clock.night ?? []).includes(clock.times[part]), ...(calendar ? calendarValues(calendar, day) : {}),
  };
};

export const timeLabel = (clock: StoryClock, calendar: StoryCalendar | undefined, time: number): string => {
  const part = clock.times[partOf(clock, time)];
  if (!calendar || calendar.label === "day") return `Day ${dayOf(clock, time)}, ${part}`;
  const date = dateOf(calendar, dayOf(clock, time) - 1);
  return `${ordinal(date.day)} of ${calendar.months[date.month].name}, ${part}`;
};

const changed = (values: Values, next: Record<string, PrimitiveValue>): Write[] =>
  Object.entries(next).filter(([key, value]) => values[key] !== value).map(([q, v]) => ({ q, v }));

export const timeWrites = (clock: StoryClock, calendar: StoryCalendar | undefined, values: Values, time: number, movedAt?: number): Write[] => [
  ...changed(values, timeValues(clock, calendar, time)),
  ...(movedAt !== undefined && values[CLOCK_MOVED_KEY] !== movedAt ? [{ q: CLOCK_MOVED_KEY, v: movedAt }] : []),
];

const authorTime = (clock: StoryClock, values: Values, applied: NonNullable<DerivedQualityView["applied"]>, from: number): number | null => {
  const parts = clock.times.length;
  let time = from;
  let set = Boolean(applied[CLOCK_STORY_TIME_KEY]);
  const day = values[CLOCK_DAY_KEY];
  if (applied[CLOCK_DAY_KEY] && typeof day === "number") {
    time = Math.max(time, (day - 1) * parts + partOf(clock, time));
    set = true;
  }
  const named = applied[CLOCK_TIME_KEY] ? clock.times.indexOf(String(values[CLOCK_TIME_KEY])) : -1;
  const counted = applied[CLOCK_PART_KEY] && typeof values[CLOCK_PART_KEY] === "number" ? values[CLOCK_PART_KEY] as number : -1;
  const part = named >= 0 ? named : counted >= 0 && counted < parts ? counted : -1;
  if (part >= 0) {
    time = forwardToPart(clock, time, part);
    set = true;
  }
  return set ? time : null;
};

const readStep = (clock: StoryClock, view: DerivedQualityView, from: number): number => {
  const read = view.applied?.[CLOCK_READ_KEY];
  const at = clock.times.indexOf(String(view.values[CLOCK_READ_KEY]));
  const movedAt = view.values[CLOCK_MOVED_KEY];
  if (!read || at < 0 || (typeof movedAt === "number" && read.to <= movedAt)) return from;
  const ahead = (at - partOf(clock, from) + clock.times.length) % clock.times.length;
  const first = clock.start_part === undefined && from === clockStart(clock) && view.versions?.[CLOCK_READ_KEY] === read.writes;
  return from + (first ? ahead : Math.min(1, ahead));
};

export type ClockWriter = "read" | "checkpoint" | "author";

export interface ClockMove {
  boundary: number;
  messageId: number;
  from: number;
  to: number;
  writer: ClockWriter;
}

export interface StoryTimeRow {
  time: number;
  label: string;
  move: ClockMove | null;
}

const writerOf = (story: NormalizedStory, entry: BoundaryLogEntry): ClockWriter => {
  const checkpoint = entry.after.activeCheckpointId !== entry.before.activeCheckpointId ? story.checkpointById[entry.after.activeCheckpointId] : undefined;
  if ((checkpoint?.effects as TimedEffects | undefined)?.time) return "checkpoint";
  const reads = entry.queue.applied.some((applied) => applied.source === "extractor" && applied.deltas.some((delta) => delta.q === CLOCK_READ_KEY));
  const authored = entry.queue.applied.some((applied) => applied.deltas.some((delta) => delta.writer === "manual"));
  return reads && !authored ? "read" : "author";
};

export const clockMoves = (story: NormalizedStory, log: readonly BoundaryLogEntry[]): ClockMove[] => {
  const clock = story.life?.clock;
  if (!clock) return [];
  return log.flatMap((entry) => {
    const before = entry.before.blackboard.values[CLOCK_STORY_TIME_KEY];
    const after = entry.after.blackboard.values[CLOCK_STORY_TIME_KEY];
    const from = typeof before === "number" ? before : clockStart(clock);
    if (typeof after !== "number" || after === from) return [];
    return [{ boundary: entry.boundary, messageId: entry.context.lastMessageId, from, to: after, writer: writerOf(story, entry) }];
  });
};

export const storyTimeRow = (story: NormalizedStory, values: Values, log: readonly BoundaryLogEntry[]): StoryTimeRow | null => {
  const clock = story.life?.clock;
  if (!clock) return null;
  const time = currentTime(clock, values);
  return { time, label: timeLabel(clock, story.life?.calendar, time), move: clockMoves(story, log).at(-1) ?? null };
};

export const reachedLabel = (story: NormalizedStory, values: Values, checkpoint: string): string | null => {
  const clock = story.life?.clock;
  const time = values[timeReachedKey(checkpoint)];
  return clock && typeof time === "number" ? timeLabel(clock, story.life?.calendar, time) : null;
};

export const timeEntry = (story: NormalizedStory, view: EntryView): Write[] => {
  const clock = story.life?.clock;
  if (!clock) return [];
  const effect = (story.checkpointById[view.activeCheckpointId]?.effects as TimedEffects | undefined)?.time;
  const before = currentTime(clock, view.values);
  const time = effect ? applyTimeEffect(clock, before, effect) : before;
  const reached = timeReachedKey(view.activeCheckpointId);
  return [
    ...timeWrites(clock, story.life?.calendar, view.values, time, time > before ? view.lastMessageId : undefined),
    ...(story.qualityByKey[reached] && view.values[reached] === undefined ? [{ q: reached, v: time }] : []),
  ];
};

export const clockWrites = (clock: StoryClock, calendar: StoryCalendar | undefined, view: DerivedQualityView): Write[] => {
  const values = view.values;
  const from = typeof values[CLOCK_STORY_TIME_KEY] === "number" ? values[CLOCK_STORY_TIME_KEY] as number : clockStart(clock);
  const set = authorTime(clock, values, view.applied ?? {}, from);
  if (set !== null) return timeWrites(clock, calendar, values, set, view.lastMessageId);
  return timeWrites(clock, calendar, values, readStep(clock, view, from));
};
