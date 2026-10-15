import type { StoryCalendar } from "../schema";

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
  weekday?: number;
  season?: number;
}

export const yearLength = (calendar: StoryCalendar): number => calendar.months.reduce((sum, month) => sum + month.days, 0);

const dayOfYear = (calendar: StoryCalendar): number => calendar.months.slice(0, calendar.start.month).reduce((sum, month) => sum + month.days, 0) + calendar.start.day - 1;

const seasonOf = (calendar: StoryCalendar, month: number): number | undefined => {
  const seasons = calendar.seasons ?? [];
  if (!seasons.length) return undefined;
  const at = seasons.reduce((found, season, index) => (season.from_month <= month ? index : found), -1);
  return at >= 0 ? at : seasons.length - 1;
};

export const dateOf = (calendar: StoryCalendar, offset: number): CalendarDate => {
  const length = yearLength(calendar);
  const total = dayOfYear(calendar) + Math.max(0, Math.floor(offset));
  let rest = total % length;
  let month = 0;
  while (rest >= calendar.months[month].days) {
    rest -= calendar.months[month].days;
    month += 1;
  }
  const weekdays = calendar.weekdays?.length ?? 0;
  const season = seasonOf(calendar, month);
  return {
    year: calendar.start.year + Math.floor(total / length), month, day: rest + 1,
    ...(weekdays ? { weekday: (calendar.start.weekday + Math.max(0, Math.floor(offset))) % weekdays } : {}),
    ...(season !== undefined ? { season } : {}),
  };
};

export const ordinal = (value: number): string => {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `${value}${suffix}`;
};
