import { evaluateGate, type GateReader } from "@engine/gates";
import { PLAYER_REF } from "@engine/agency";
import { questStatus, stepStatus } from "@engine/quests";
import { CLOCK_DAY_KEY, type GateNode, type NormalizedStory, type PrimitiveValue, type StoryClock } from "@engine/schema";
import { currentTime, dayOf, partOf, timeLabel, timeValues } from "@engine/life/clock";

type Values = Readonly<Record<string, PrimitiveValue>>;

export type SkipDueKind = "reply" | "echo" | "rumor" | "commitment" | "quest" | "agenda" | "schedule";

export type SkipDueAt = { boundary: number } | { part: number } | { day: number };

export interface SkipDueEvent {
  kind: "echo" | "rumor";
  due: SkipDueAt;
  open: boolean;
}

export interface SkipSpan {
  from: number;
  to: number;
  part: string;
  label: string;
  nextDay: boolean;
}

export interface SkipDue {
  kind: SkipDueKind;
  at: "next-reply" | "threshold";
}

export interface SkipPlan {
  span: SkipSpan | null;
  due: SkipDue | null;
  text: string;
}

export interface SkipPlanInput {
  story: NormalizedStory;
  values: Values;
  boundary: number;
  events: readonly SkipDueEvent[];
}

export const SKIP_ATTENTION = `something needs ${PLAYER_REF}'s attention`;

export const skipSpan = (clock: StoryClock | undefined, calendar: NonNullable<NormalizedStory["life"]>["calendar"], values: Values): SkipSpan | null => {
  if (!clock?.times.length) return null;
  const from = currentTime(clock, values);
  const to = from + 1;
  return { from, to, part: clock.times[partOf(clock, to)], label: timeLabel(clock, calendar, to), nextDay: dayOf(clock, to) !== dayOf(clock, from) };
};

const reader = (values: Values): GateReader => ({ get: (key) => values[key] });

const flips = (gate: GateNode | undefined, now: GateReader, next: GateReader): boolean => gate !== undefined && !evaluateGate(gate, now) && evaluateGate(gate, next);

const eventDue = (event: SkipDueEvent, boundary: number, span: SkipSpan | null, day: number | null, nextDay: number | null): SkipDue | null => {
  if (!event.open) return null;
  const due = event.due;
  if ("boundary" in due) return due.boundary === boundary + 1 ? { kind: event.kind, at: "next-reply" } : null;
  if ("part" in due) return span && due.part > span.from && due.part <= span.to ? { kind: event.kind, at: "threshold" } : null;
  return day !== null && nextDay !== null && due.day > day && due.day <= nextDay ? { kind: event.kind, at: "threshold" } : null;
};

const gateDue = (story: NormalizedStory, now: GateReader, next: GateReader, day: number | null, nextDay: number | null): SkipDue | null => {
  for (const quest of story.quests ?? []) {
    const status = questStatus(quest, now);
    if (status === "done" || status === "failed") continue;
    if (questStatus(quest, next) !== status || quest.steps.some((step) => stepStatus(step, next) !== stepStatus(step, now))) return { kind: "quest", at: "threshold" };
  }
  for (const member of story.life?.members ?? []) {
    if (member.agenda.some((agenda) => agenda.steps.some((step) => flips(step.when, now, next)))) return { kind: "agenda", at: "threshold" };
    if (member.schedule.some((entry) => flips(entry.when, now, next))) return { kind: "schedule", at: "threshold" };
    const broken = (member.commitments ?? []).some((commitment) => {
      const due = commitment.due;
      const lapses = due && "story_day" in due && day !== null && nextDay !== null && day <= due.story_day && nextDay > due.story_day;
      return lapses || flips(commitment.kept_when, now, next) || flips(commitment.broken_when, now, next);
    });
    if (broken) return { kind: "commitment", at: "threshold" };
  }
  return null;
};

export const skipDue = (input: SkipPlanInput, span: SkipSpan | null): SkipDue | null => {
  const clock = input.story.life?.clock;
  const nextValues = span && clock ? { ...input.values, ...timeValues(clock, input.story.life?.calendar, span.to) } : input.values;
  const day = typeof input.values[CLOCK_DAY_KEY] === "number" ? input.values[CLOCK_DAY_KEY] as number : span && clock ? dayOf(clock, span.from) : null;
  const nextDay = span && clock ? dayOf(clock, span.to) : day;
  const found = input.events.map((event) => eventDue(event, input.boundary, span, day, nextDay)).filter((due): due is SkipDue => due !== null);
  const reply = found.find((due) => due.at === "next-reply");
  if (reply) return reply;
  if (found.length) return found[0];
  return span ? gateDue(input.story, reader(input.values), reader(nextValues), day, nextDay) : null;
};

const untilText = (span: SkipSpan | null): string => (span ? `${span.part}${span.nextDay ? " of the next day" : ""}` : "the next scene");

export const skipDirectionText = (span: SkipSpan | null, due: SkipDue | null): string => {
  const until = untilText(span);
  const stop = due
    ? `Stop as soon as ${SKIP_ATTENTION}${span ? `, and at ${until} at the latest` : ""}, and set that moment up.`
    : `Stop when ${until} arrives and set that moment up.`;
  return [
    `${PLAYER_REF} chose to skip ahead ${span ? `until ${until}` : "to the next scene"}.`,
    "In a few sentences, tell the time that passes as narration: the travel, the waiting or the routine, with nothing decisive happening on the way.",
    stop,
    `End there, with the next move left to ${PLAYER_REF}: never decide, say or feel anything for ${PLAYER_REF}, and never reveal anything the story has not shown.`,
  ].join(" ");
};

export const skipPlan = (input: SkipPlanInput): SkipPlan => {
  const span = skipSpan(input.story.life?.clock, input.story.life?.calendar, input.values);
  const due = skipDue(input, span);
  return { span, due, text: skipDirectionText(span, due) };
};
