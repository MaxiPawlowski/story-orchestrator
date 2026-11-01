import { castCardName, type NormalizedStory } from "@engine/index";
import { log } from "@utils/log";
import { partyNames } from "@talk/crossVoice";
import { appendSequenceBreakers, DRY_MAX_BREAKERS } from "@utils/samplerKeys";
import { isLoudRequest, type SamplerRequest } from "./samplerOverlay";

export interface DryNamesDeps {
  enabled: () => boolean;
  storyChat: () => string | null;
  story: () => NormalizedStory | null;
  player: () => string;
  drafted: () => string | null;
  onStage: () => readonly string[];
  journal: (summary: string, note: string) => void;
}

export const DRY_NAMES_APPLIED = "The cast's names were added to the repetition penalty's sequence breakers";

export const DRY_NAMES_CAPPED = "Some cast names were left out of the repetition penalty's sequence breakers";

type Member = NonNullable<NormalizedStory["roster"]>[number];

const memberNames = (member: Member): string[] => partyNames(castCardName(member), member.aliases ?? []);

export const dryBreakerNames = (story: NormalizedStory, player: string, drafted: string | null = null, onStage: readonly string[] = []): string[] => {
  const roster = story.roster ?? [];
  return [...new Set([
    ...roster.filter((member) => castCardName(member) === drafted).flatMap(memberNames),
    ...(player.trim() ? partyNames(player) : []),
    ...roster.filter((member) => onStage.includes(castCardName(member))).flatMap(memberNames),
    ...roster.flatMap(memberNames),
  ])];
};

export const dryNamesHandler = (deps: DryNamesDeps) => {
  let journaled: string | null = null;
  let capped: string | null = null;
  return (payload: Record<string, unknown>, request: SamplerRequest): string[] => {
    if (!deps.enabled() || request.api !== "textgen" || !isLoudRequest(request)) return [];
    const chat = deps.storyChat();
    const story = deps.story();
    if (!story || chat === null || request.chatId !== chat) return [];
    const { added, dropped } = appendSequenceBreakers(payload, dryBreakerNames(story, deps.player(), deps.drafted(), deps.onStage()));
    if (added.length && journaled !== chat) {
      journaled = chat;
      deps.journal(DRY_NAMES_APPLIED, `${added.length} names added to this request's own breakers; the preset is unchanged`);
    }
    if (dropped.length) {
      log.debug(`DRY breakers at llama.cpp's ${DRY_MAX_BREAKERS}-entry cap: ${added.length} names added, ${dropped.length} left out`, dropped);
      if (capped !== chat) {
        capped = chat;
        deps.journal(DRY_NAMES_CAPPED, `${dropped.length} names left out to stay within llama.cpp's ${DRY_MAX_BREAKERS} distinct breakers; drafted member, player and stage first`);
      }
    }
    return added;
  };
};
