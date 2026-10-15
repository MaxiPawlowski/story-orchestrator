import { progressQualityForAnchor } from "./convergence";
import { questLatchesMoved } from "./quests";
import {
  CLOCK_DAY_KEY, CLOCK_SEEN_KEY, TURN_OOC_KEY, agendaChapterKey, agendaRepeatsKey, agendaStepKey, agendaWaitKey, isCodexKey, moodAgeKey, moodSceneKey, moodWasKey,
  isFactionKey, questClosedKey, questRewardKey, type NormalizedStoryV2,
} from "./schema";
import { PLAYER_TURNS_KEY } from "./stretch";
import { gameLayer } from "./validate/gameLayer";

type Values = Readonly<Record<string, unknown>>;

export interface RollbackDetector {
  id: string;
  keys: (story: NormalizedStoryV2) => string[];
  moved: (story: NormalizedStoryV2, before: Values, after: Values) => boolean;
}

export interface RollbackExemption {
  id: string;
  keys: (story: NormalizedStoryV2) => string[];
  reason: string;
}

const agendas = (story: NormalizedStoryV2) => (story.life?.members ?? []).flatMap((member) => member.agenda.map((agenda) => ({ member: member.id, agenda })));

const prefixMoved = (match: (key: string) => boolean, before: Values, after: Values): boolean =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].some((key) => match(key) && before[key] !== after[key]);

export const ROLLBACK_DETECTORS: readonly RollbackDetector[] = [
  {
    id: "quests",
    keys: (story) => (story.quests ?? []).flatMap((quest) => [questClosedKey(quest.id), questRewardKey(quest.id)]),
    moved: (story, before, after) => questLatchesMoved(story, before, after),
  },
  {
    id: "life-steps",
    keys: (story) => agendas(story).flatMap(({ member, agenda }) => [agendaStepKey(member, agenda.id), agendaRepeatsKey(member, agenda.id)]),
    moved: (story, before, after) => Boolean(story.life && gameLayer()?.life.lifeMoved(story, before, after)),
  },
  {
    id: "codex",
    keys: (story) => Object.keys(story.qualityByKey).filter(isCodexKey),
    moved: (_story, before, after) => prefixMoved(isCodexKey, before, after),
  },
  {
    id: "factions",
    keys: (story) => Object.keys(story.qualityByKey).filter(isFactionKey),
    moved: (story, before, after) => Boolean(story.factions?.length) && prefixMoved(isFactionKey, before, after),
  },
];

const mood = (story: NormalizedStoryV2) => (story.life?.members ?? []).filter((member) => member.mood).flatMap((member) => [moodAgeKey(member.id), moodSceneKey(member.id), moodWasKey(member.id)]);

export const ROLLBACK_EXEMPT: readonly RollbackExemption[] = [
  { id: "convergence", keys: (story) => story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").map((checkpoint) => progressQualityForAnchor(checkpoint.id)),
    reason: "moves only with a fired transition, which already rolls back" },
  { id: "life-pacing", keys: (story) => [...mood(story), ...agendas(story).flatMap(({ member, agenda }) => [agendaWaitKey(member, agenda.id), agendaChapterKey(member, agenda.id)])],
    reason: "derive bookkeeping that paces the next agenda step or mood read; rewritten from the restored values at the next boundary; not a latch (pre-dates SC1)" },
  { id: "clock", keys: (story) => (story.life?.clock ? [CLOCK_DAY_KEY, CLOCK_SEEN_KEY] : []),
    reason: "follows the applied time-of-day read, whose read window the queue check already sees" },
  { id: "turn-counters", keys: (story) => [TURN_OOC_KEY, PLAYER_TURNS_KEY].filter((key) => story.qualityByKey[key]?.source === "code"),
    reason: "recounted from the chat at every boundary" },
];

export const rollbackMoved = (story: NormalizedStoryV2 | null | undefined, before: Values, after: Values): boolean =>
  Boolean(story && ROLLBACK_DETECTORS.some((detector) => detector.moved(story, before, after)));

export const uncoveredCodeKeys = (story: NormalizedStoryV2, authored: ReadonlySet<string>): string[] => {
  const covered = new Set([...ROLLBACK_DETECTORS, ...ROLLBACK_EXEMPT].flatMap((entry) => entry.keys(story)));
  return story.qualities.filter((quality) => quality.source === "code" && !authored.has(quality.key) && !covered.has(quality.key)).map((quality) => quality.key);
};
