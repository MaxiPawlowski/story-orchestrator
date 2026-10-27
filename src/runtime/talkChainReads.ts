import type { RosterMember } from "@engine/index";
import { asksPlayer, directlyAddressed, type DirectorWindowMessage, type TalkCandidate } from "@talk/index";
import type { SourceRevision } from "@memory/audience";
import type { ChainEnd, ChainEndReason } from "./chainEnds";

interface ChainReadHost {
  getRoster(): RosterMember[];
  getWindow(): DirectorWindowMessage[];
  getPlayerName?(): string;
  getChatId(): string | null;
  getLastMessageId(): number;
  getLastMessageRevision?(): SourceRevision | null;
  recordChainEnd?(end: ChainEnd): void;
}

const others = (roster: RosterMember[], speaker: string) => roster.filter((member) => (member.name ?? member.id).trim().toLowerCase() !== speaker);

export const handedTo = (roster: RosterMember[], window: DirectorWindowMessage[], candidates: TalkCandidate[]): TalkCandidate | null => {
  const last = window.at(-1);
  if (!last || last.isUser) return null;
  const id = directlyAddressed(others(roster, last.speaker.trim().toLowerCase()), last.text);
  return candidates.find((candidate) => candidate.rosterId === id) ?? null;
};

export const voiceAsksPlayer = (host: ChainReadHost): boolean => {
  const last = host.getWindow().at(-1);
  const player = host.getPlayerName?.()?.trim() ?? "";
  const speaker = last?.speaker.trim().toLowerCase() ?? "";
  if (!last || last.isUser || !player || speaker === player.toLowerCase()) return false;
  return asksPlayer(last.text, { player: [player], others: others(host.getRoster(), speaker).flatMap((member) => [member.name ?? member.id, ...(member.aliases ?? [])]) });
};

export const recordEnd = (host: ChainReadHost, chain: { chatId: string; checkpointId: string; spokeCount: number }, reason: ChainEndReason): void => {
  if ((host.getChatId() ?? "") !== chain.chatId) return;
  host.recordChainEnd?.({
    messageId: host.getLastMessageId(), revision: host.getLastMessageRevision?.() ?? null, checkpointId: chain.checkpointId, voices: chain.spokeCount, reason,
  });
};
