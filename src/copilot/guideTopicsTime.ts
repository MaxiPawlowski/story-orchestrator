import type { GuideTopic } from "./guideTopics";

export const TIME_TOPICS = {
  "story-time": {
    title: "Story time",
    fields: "clock, times, start_day, start_part, night, max_skip_days, calendar, months, weekdays, seasons, label, effects.time, story_time, time_part, is_night",
    text: "clock {times, start_day, start_part, night, max_skip_days 30} keeps story_time (day parts passed); story_day, time_of_day, time_part, is_night, cal_* "
      + "are derived, never written. Forward only: the reader one part a turn, effects.time {advance: {days, parts}} | {to: {part, next_day}} on entry "
      + "(not the start), /cp set. calendar {start: day-1 date, months [{name, days}], weekdays, seasons [{name, from_month}], label}. Deadlines: failed_when on story_day.",
  },
} as const satisfies Record<string, GuideTopic>;
