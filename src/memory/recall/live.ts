import type { LiveMessage } from "../audienceRules";
import { revisionOf } from "../witness/contract";

export interface RecallMessage {
  messageId: number;
  speaker: string;
  isUser: boolean;
  text: string;
  swipeId?: number;
  hidden?: boolean;
}

export const findMessage = (chat: readonly RecallMessage[], messageId: number): RecallMessage | null => chat.find((message) => message.messageId === messageId) ?? null;

export const liveMessage = (chat: readonly RecallMessage[], messageId: number): LiveMessage | null => {
  const message = findMessage(chat, messageId);
  return message ? { revision: revisionOf(message), hidden: Boolean(message.hidden) } : null;
};
