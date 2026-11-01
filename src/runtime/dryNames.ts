import { castCardName, type NormalizedStory } from "@engine/index";
import { partyNames } from "@talk/crossVoice";
import { appendSequenceBreakers } from "@utils/samplerKeys";
import { isLoudRequest, type SamplerRequest } from "./samplerOverlay";

export interface DryNamesDeps {
  enabled: () => boolean;
  storyChat: () => string | null;
  story: () => NormalizedStory | null;
  player: () => string;
  journal: (summary: string, note: string) => void;
}

export const DRY_NAMES_APPLIED = "The cast's names were added to the repetition penalty's sequence breakers";

export const dryBreakerNames = (story: NormalizedStory, player: string): string[] => [...new Set([
  ...(story.roster ?? []).flatMap((member) => partyNames(castCardName(member), member.aliases ?? [])),
  ...(player.trim() ? partyNames(player) : []),
])];

export const dryNamesHandler = (deps: DryNamesDeps) => {
  let journaled: string | null = null;
  return (payload: Record<string, unknown>, request: SamplerRequest): string[] => {
    if (!deps.enabled() || request.api !== "textgen" || !isLoudRequest(request)) return [];
    const chat = deps.storyChat();
    const story = deps.story();
    if (!story || chat === null || request.chatId !== chat) return [];
    const { added } = appendSequenceBreakers(payload, dryBreakerNames(story, deps.player()));
    if (added.length && journaled !== chat) {
      journaled = chat;
      deps.journal(DRY_NAMES_APPLIED, `${added.length} names added to this request's own breakers; the preset is unchanged`);
    }
    return added;
  };
};
