import { getContext } from "@services/STAPI";
import type { ChatMessageWindowEntry, SharedReadWindow } from "./types";
import { CLEANED_FORM, cleanWindowMessage } from "./windowHygiene";

const readMessage = (entry: unknown, index: number): ChatMessageWindowEntry | null => {
  const cleaned = cleanWindowMessage(entry);
  return cleaned.keep ? { index, messageId: index, speaker: cleaned.speaker, text: cleaned.text, isUser: cleaned.isUser } : null;
};

export function getChatWindow(from: number, to?: number): SharedReadWindow {
  const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(chat.length - 1, Math.floor(to ?? chat.length - 1));
  if (end < start) return { from: start, to: end, messages: [], form: CLEANED_FORM };
  const messages = chat.slice(start, end + 1).map((entry, offset) => readMessage(entry, start + offset)).filter((entry): entry is ChatMessageWindowEntry => Boolean(entry));
  return { from: start, to: end, messages, form: CLEANED_FORM };
}

export function getLastMessageText(): string {
  const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const message = readMessage(chat[index], index);
    if (message) return message.text;
  }
  return "";
}
