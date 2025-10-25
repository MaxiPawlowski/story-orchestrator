import type { NormalizedStory, NormalizedTalkControlReply } from "@utils/story-validator";
import { normalizeName } from "@utils/string";
import { getCharacterIdByName, getContext } from "@services/STAPI";

export class CharacterResolver {
  private readonly storyRoleLookup = new Map<string, string>();

  constructor(story: NormalizedStory) {
    this.rebuildRoleLookup(story);
  }

  private rebuildRoleLookup(story: NormalizedStory) {
    this.storyRoleLookup.clear();
    if (!story?.roles) return;

    for (const [roleKey, displayName] of Object.entries(story.roles)) {
      if (typeof displayName === "string") {
        const norm = normalizeName(displayName);
        if (norm) this.storyRoleLookup.set(norm, displayName);
      }
      const keyNorm = normalizeName(roleKey);
      if (keyNorm && typeof displayName === "string") {
        this.storyRoleLookup.set(keyNorm, displayName);
      }
    }
  }

  resolveCandidateNames(reply: NormalizedTalkControlReply): string[] {
    const names = new Set<string>();
    if (reply.memberId) names.add(reply.memberId);
    if (this.storyRoleLookup.has(reply.normalizedId)) {
      names.add(this.storyRoleLookup.get(reply.normalizedId)!);
    }
    return Array.from(names);
  }

  resolveCharacterId(reply: NormalizedTalkControlReply): number | undefined {
    const { characters } = getContext();
    const candidates = this.resolveCandidateNames(reply);

    for (const candidate of candidates) {
      const byHelper = getCharacterIdByName(candidate);
      if (byHelper !== undefined && byHelper >= 0) return byHelper;

      const normalizedCandidate = normalizeName(candidate);
      const idx = characters.findIndex(entry =>
        normalizeName(entry?.name) === normalizedCandidate
      );
      if (idx >= 0) return idx;
    }

    return undefined;
  }

  resolveCharacter(reply: NormalizedTalkControlReply): { id: number; character: any } | null {
    const { characters } = getContext();
    const charId = this.resolveCharacterId(reply);

    if (charId === undefined) {
      console.warn("[Story TalkControl] Unable to resolve character for talk-control reply", {
        member: reply.memberId
      });
      return null;
    }

    const character = characters[charId];
    if (!character) {
      console.warn("[Story TalkControl] Character index missing for talk-control reply", {
        index: charId
      });
      return null;
    }

    return { id: charId, character };
  }

  buildExpectedSpeakerIds(reply: NormalizedTalkControlReply): string[] {
    const expected = new Set<string>();
    if (reply.normalizedSpeakerId) expected.add(reply.normalizedSpeakerId);

    const mappedDisplay = this.storyRoleLookup.get(reply.normalizedSpeakerId);
    if (mappedDisplay) expected.add(normalizeName(mappedDisplay));

    return Array.from(expected).filter(Boolean);
  }
}
