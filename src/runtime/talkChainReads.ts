import type { RosterMember } from "@engine/index";
import { asksPlayer, directlyAddressed, type DirectorWindowMessage, type TalkCandidate } from "@talk/index";
import type { SourceRevision } from "@memory/audience";
import type { ChainEnd, ChainEndReason } from "./chainEnds";
import type { TalkDecisionAudit } from "./types";

interface ChainReadHost {
  getRoster(): RosterMember[];
  getWindow(): DirectorWindowMessage[];
  getPlayerName?(): string;
  getChatId(): string | null;
  getLastMessageId(): number;
  getLastMessageRevision?(): SourceRevision | null;
  recordChainEnd?(end: ChainEnd): void;
  recordDecision(audit: TalkDecisionAudit): void;
  getCheckpointInfo(): { id: string } | null;
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

export const recordYield = (host: ChainReadHost, chain: { checkpointId: string; spokeCount: number }): void => host.recordDecision({
  at: new Date().toISOString(), messageId: host.getLastMessageId(), checkpointId: host.getCheckpointInfo()?.id ?? chain.checkpointId,
  chosenRosterId: null, chosenName: null, source: "rules", latencyMs: 0, chainStep: chain.spokeCount, kind: "player", revision: host.getLastMessageRevision?.() ?? null,
});

export const voiceMessage = (chain: { expected: string | null; voice: { messageId: number; rosterId: string | null } | null }, lastSpeaker: string | null, lastId: number): number | null => {
  if (!chain.expected) return null;
  if (chain.voice) return chain.voice.rosterId === chain.expected ? chain.voice.messageId : null;
  return lastSpeaker === chain.expected ? lastId : null;
};
