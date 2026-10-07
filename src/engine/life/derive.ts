import { evaluateGate } from "../gates";
import {
  CLOCK_DAY_KEY, CLOCK_SEEN_KEY, CLOCK_TIME_KEY, PARTY_LOCATION_KEY, TURN_OOC_KEY, agendaChapterKey, agendaRepeatsKey, agendaStepKey, agendaWaitKey,
  moodAgeKey, moodKey, moodSceneKey, moodWasKey,
  type Agenda, type AgendaStep, type LifeMember, type NormalizedStoryV2, type PrimitiveValue, type StoryClock,
} from "../schema";
import type { DerivedQualityView } from "../engine";
import { latestPlayerLineIsOoc } from "../ooc";

type Write = { q: string; v: PrimitiveValue };
type Values = Readonly<Record<string, PrimitiveValue>>;

const reader = (values: Values) => ({ get: (key: string) => values[key] });

const num = (value: PrimitiveValue | undefined): number => (typeof value === "number" ? value : 0);

export const sceneMarker = (values: Values): string => `${String(values[PARTY_LOCATION_KEY] ?? "")}|${String(values[CLOCK_TIME_KEY] ?? "")}`;

export const nextAgendaStep = (agenda: Agenda, values: Values, member: string): { step: AgendaStep; repeat: boolean } | null => {
  const done = num(values[agendaStepKey(member, agenda.id)]);
  if (done < agenda.steps.length) return { step: agenda.steps[done], repeat: false };
  const last = agenda.steps.at(-1);
  return last?.repeat ? { step: last, repeat: true } : null;
};

const agendaWrites = (member: string, agenda: Agenda, values: Values, chapter: string, ooc: boolean): Write[] => {
  const waitKey = agendaWaitKey(member, agenda.id);
  const wait = num(values[waitKey]) + (ooc ? 0 : 1);
  const next = nextAgendaStep(agenda, values, member);
  const paced = agenda.pace === "per_chapter" ? values[agendaChapterKey(member, agenda.id)] !== chapter : wait >= (agenda.every ?? 1);
  const ready = next && !ooc && paced && (!next.step.when || evaluateGate(next.step.when, reader(values)));
  if (!next || !ready) return values[waitKey] === wait ? [] : [{ q: waitKey, v: wait }];
  const counter = next.repeat ? agendaRepeatsKey(member, agenda.id) : agendaStepKey(member, agenda.id);
  return [{ q: counter, v: num(values[counter]) + 1 }, { q: waitKey, v: 0 }, { q: agendaChapterKey(member, agenda.id), v: chapter }];
};

const moodWrites = (member: LifeMember, values: Values, versions: Values): Write[] => {
  if (!member.mood) return [];
  const version = versions[moodKey(member.id)];
  if (version === undefined) return [];
  if (version !== values[moodWasKey(member.id)]) {
    return [{ q: moodWasKey(member.id), v: version }, { q: moodAgeKey(member.id), v: 0 }, { q: moodSceneKey(member.id), v: sceneMarker(values) }];
  }
  return [{ q: moodAgeKey(member.id), v: num(values[moodAgeKey(member.id)]) + 1 }];
};

const clockWrites = (clock: StoryClock, values: Values): Write[] => {
  const day = values[CLOCK_DAY_KEY] === undefined ? [{ q: CLOCK_DAY_KEY, v: clock.start_day ?? 1 }] : [];
  const time = values[CLOCK_TIME_KEY];
  const seen = values[CLOCK_SEEN_KEY];
  if (typeof time !== "string" || time === seen) return day;
  const wrapped = typeof seen === "string" && clock.times.indexOf(time) <= clock.times.indexOf(seen);
  const today = num(values[CLOCK_DAY_KEY] ?? clock.start_day ?? 1);
  return [{ q: CLOCK_SEEN_KEY, v: time }, { q: CLOCK_DAY_KEY, v: wrapped ? today + 1 : today }];
};

export const deriveLife = (story: NormalizedStoryV2, view: DerivedQualityView, chat: readonly unknown[]): Write[] => {
  const life = story.life;
  if (!life) return [];
  const values = view.values;
  const versions = (view.versions ?? {}) as Values;
  const ooc = latestPlayerLineIsOoc(chat, view.lastMessageId);
  const chapter = story.chapterByCheckpoint?.[view.activeCheckpointId] ?? "";
  return [
    ...(story.qualityByKey[TURN_OOC_KEY] ? [{ q: TURN_OOC_KEY, v: ooc }] : []),
    ...life.members.flatMap((member) => [
      ...member.agenda.flatMap((agenda) => agendaWrites(member.id, agenda, values, chapter, ooc)),
      ...moodWrites(member, values, versions),
    ]),
    ...(life.clock ? clockWrites(life.clock, values) : []),
  ];
};
