import { isOocLine } from "@engine/ooc";
import type { ChatMessageWindowEntry, SharedReadWindow } from "./types";
import { CLEANED_FORM, cleanWindowMessage } from "./windowHygiene";

const readMessage = (entry: unknown, index: number): ChatMessageWindowEntry | null => {
  const cleaned = cleanWindowMessage(entry);
  return cleaned.keep ? { index, messageId: index, speaker: cleaned.speaker, text: cleaned.text, isUser: cleaned.isUser } : null;
};

export const onlyOutOfCharacter = (window: SharedReadWindow): boolean => !window.messages.length && Boolean(window.ooc?.length);

export function windowOf(chat: unknown[], from: number, to?: number): SharedReadWindow {
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(chat.length - 1, Math.floor(to ?? chat.length - 1));
  if (end < start) return { from: start, to: end, messages: [], form: CLEANED_FORM };
  const messages: ChatMessageWindowEntry[] = [];
  const ooc: number[] = [];
  chat.slice(start, end + 1).forEach((entry, offset) => {
    const message = readMessage(entry, start + offset);
    if (message && isOocLine(entry)) ooc.push(message.messageId);
    else if (message) messages.push(message);
  });
  return { from: start, to: end, messages, form: CLEANED_FORM, ...(ooc.length ? { ooc } : {}) };
}

export function lastMessageTextOf(chat: unknown[]): string {
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const message = readMessage(chat[index], index);
    if (message) return message.text;
  }
  return "";
}
