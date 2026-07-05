import { getContext } from "@services/STAPI";
import type { ChatMessageWindowEntry, SharedReadWindow } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readMessage = (entry: unknown, index: number): ChatMessageWindowEntry | null => {
  if (!isRecord(entry)) return null;
  if (entry.gen_started && !entry.gen_finished) return null;
  const text = typeof entry.mes === "string" ? entry.mes.trim() : "";
  if (!text) return null;
  const speaker = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : entry.is_user ? "User" : "Assistant";
  return { index, messageId: index, speaker, text };
};

export function getChatWindow(from: number, to?: number): SharedReadWindow {
  const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(chat.length - 1, Math.floor(to ?? chat.length - 1));
  if (end < start) return { from: start, to: end, messages: [] };
  const messages = chat.map((entry, index) => readMessage(entry, index)).filter((entry): entry is ChatMessageWindowEntry => Boolean(entry)).filter((entry) => entry.index >= start && entry.index <= end);
  return { from: start, to: end, messages };
}

export function getLastMessageText(): string {
  const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const message = readMessage(chat[index], index);
    if (message) return message.text;
  }
  return "";
}
