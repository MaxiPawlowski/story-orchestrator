import { progressQualityForAnchor } from "./convergence";
import { questLatchesMoved } from "./quests";
import {
  CLOCK_MOVED_KEY, CLOCK_STORY_TIME_KEY, TIME_REACHED_PREFIX, TURN_OOC_KEY, agendaChapterKey, agendaRepeatsKey, agendaStepKey, agendaWaitKey, clockStart, isCodexKey,
  isObservationKey, isStoryTimeKey, moodAgeKey, moodSceneKey, moodWasKey, isCommitKey, isFactionKey, isLabelKey, questClosedKey, questRewardKey, type NormalizedStory,
} from "./schema";
import { PLAYER_TURNS_KEY } from "./stretch";
import { isCueKey, isTopicKey } from "./cueKeys";
import { checkRolledKeys } from "./storyChecks";
import { gameLayer } from "./validate/gameLayer";

type Values = Readonly<Record<string, unknown>>;

export interface RollbackDetector {
  id: string;
  keys: (story: NormalizedStory) => string[];
  moved: (story: NormalizedStory, before: Values, after: Values) => boolean;
}

export interface RollbackExemption {
  id: string;
  keys: (story: NormalizedStory) => string[];
  reason: string;
}

const agendas = (story: NormalizedStory) => (story.life?.members ?? []).flatMap((member) => member.agenda.map((agenda) => ({ member: member.id, agenda })));

const isHeritage = (key: string): boolean => key.startsWith("heritage_");

const mood = (story: NormalizedStory) => (story.life?.members ?? []).filter((member) => member.mood).flatMap((member) => [moodAgeKey(member.id), moodSceneKey(member.id), moodWasKey(member.id)]);

const lifePacing = (story: NormalizedStory) => [...mood(story), ...agendas(story).flatMap(({ member, agenda }) => [agendaWaitKey(member, agenda.id), agendaChapterKey(member, agenda.id)])];

const prefixMoved = (match: (key: string) => boolean, before: Values, after: Values): boolean =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].some((key) => match(key) && before[key] !== after[key]);

const byPrefix = (id: string, match: (key: string) => boolean, applies: (story: NormalizedStory) => boolean = () => true): RollbackDetector => ({
  id, keys: (story) => Object.keys(story.qualityByKey).filter(match), moved: (story, before, after) => applies(story) && prefixMoved(match, before, after),
});

const lived = (story: NormalizedStory): boolean => Boolean(story.life);

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
    id: "life-pacing",
    keys: lifePacing,
    moved: (story, before, after) => lifePacing(story).some((key) => before[key] !== after[key]),
  },
  byPrefix("codex", isCodexKey),
  byPrefix("observations", isObservationKey),
  {
    id: "story-time",
    keys: (story) => (story.life?.clock ? Object.keys(story.qualityByKey).filter((key) => isStoryTimeKey(key) || key === CLOCK_MOVED_KEY) : []),
    moved: (story, before, after) => {
      const clock = story.life?.clock;
      if (!clock) return false;
      const start = clockStart(clock);
      return (before[CLOCK_STORY_TIME_KEY] ?? start) !== (after[CLOCK_STORY_TIME_KEY] ?? start) || prefixMoved((key) => key.startsWith(TIME_REACHED_PREFIX), before, after);
    },
  },
  byPrefix("factions", isFactionKey, (story) => Boolean(story.factions?.length)),
  byPrefix("relationship-labels", isLabelKey, lived),
  byPrefix("commitments", isCommitKey, lived),
  byPrefix("cues", isCueKey, lived),
  byPrefix("cue-topics", isTopicKey, lived),
  byPrefix("heritage", isHeritage),
  { id: "check-attempts", keys: checkRolledKeys, moved: (story, before, after) => checkRolledKeys(story).some((key) => before[key] !== after[key]) },
];

export const ROLLBACK_EXEMPT: readonly RollbackExemption[] = [
  { id: "convergence", keys: (story) => story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").map((checkpoint) => progressQualityForAnchor(checkpoint.id)),
    reason: "moves only with a fired transition, which already rolls back" },
  { id: "turn-counters", keys: (story) => [TURN_OOC_KEY, PLAYER_TURNS_KEY].filter((key) => story.qualityByKey[key]?.source === "code"),
    reason: "recounted from the chat at every boundary" },
];

export const rollbackMoved = (story: NormalizedStory | null | undefined, before: Values, after: Values): boolean =>
  Boolean(story && ROLLBACK_DETECTORS.some((detector) => detector.moved(story, before, after)));

export const uncoveredCodeKeys = (story: NormalizedStory, authored: ReadonlySet<string>): string[] => {
  const covered = new Set([...ROLLBACK_DETECTORS, ...ROLLBACK_EXEMPT].flatMap((entry) => entry.keys(story)));
  return story.qualities.filter((quality) => quality.source === "code" && !authored.has(quality.key) && !covered.has(quality.key)).map((quality) => quality.key);
};
