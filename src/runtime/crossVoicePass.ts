import { castCardName, type NormalizedStory } from "@engine/index";
import { crossVoiceHits, partyNames, trimCrossVoice, type VoiceParty } from "@talk/crossVoice";
import type { WriteResult } from "@utils/writeResult";
import { visibleReplyText } from "./emptyReply";

export interface CrossVoiceReply {
  mes: string;
  reasoning: string;
  isUser: boolean;
  name?: string;
}

export interface CrossVoiceDeps {
  enabled: () => boolean;
  storyChat: () => boolean;
  story: () => NormalizedStory | null;
  player: () => string;
  read: (messageId: number) => CrossVoiceReply | null;
  write: (messageId: number, text: { mes: string; reasoning: string }) => WriteResult;
  journal: (summary: string, note: string) => void;
}

export const CROSS_VOICE_TRIMMED = "A reply went on to write another character's lines; it was cut where they began";

export const CROSS_VOICE_KEPT = "A reply was written under another character's name; it was kept as written";

const fold = (text: string) => text.trim().toLowerCase();

export const voiceParties = (story: NormalizedStory, speaker: string, player: string): { self: string[]; others: VoiceParty[] } => {
  const roster = story.roster ?? [];
  const own = roster.find((member) => fold(castCardName(member)) === fold(speaker));
  const self = own ? partyNames(castCardName(own), own.aliases ?? []) : partyNames(speaker);
  const others: VoiceParty[] = roster.filter((member) => member !== own).map((member) => ({ id: member.id, names: partyNames(castCardName(member), member.aliases ?? []) }));
  if (player.trim() && fold(player) !== fold(speaker)) others.push({ id: "player", names: partyNames(player), player: true });
  return { self, others };
};

export const crossVoicePass = (deps: CrossVoiceDeps) => (messageId: number): void => {
  if (!deps.enabled() || !deps.storyChat()) return;
  const story = deps.story();
  const reply = deps.read(messageId);
  if (!story || !reply || reply.isUser || !reply.name || !visibleReplyText(reply.mes)) return;
  const { self, others } = voiceParties(story, reply.name, deps.player());
  if (!others.length) return;
  const header = crossVoiceHits(reply.mes, self, others).find((hit) => hit.kind === "header");
  if (!header) return;
  const trim = trimCrossVoice(reply.mes, self, others);
  if (!trim) {
    deps.journal(CROSS_VOICE_KEPT, `message ${messageId}: cutting at the other name would leave too little of the reply`);
    return;
  }
  if (!deps.write(messageId, { mes: trim.text, reasoning: reply.reasoning }).ok) return;
  deps.journal(CROSS_VOICE_TRIMMED, `message ${messageId}: ${trim.removed} characters written as ${trim.hit.player ? "you" : "another member"} removed`);
};
