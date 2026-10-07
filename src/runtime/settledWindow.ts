import type { SharedReadWindow } from "@extraction/index";
import { isRecord } from "@utils/guards";
import type { WindowAccess } from "./wiring/types";

export const swipePending = (row: unknown): boolean =>
  isRecord(row) && Array.isArray(row.swipes) && typeof row.swipe_id === "number" && row.swipe_id >= row.swipes.length;

export const settledLastIndex = (chat: readonly unknown[]): number =>
  chat.length - 1 - (chat.length > 0 && swipePending(chat[chat.length - 1]) ? 1 : 0);

export const settledWindowAccess = (
  chat: () => readonly unknown[],
  read: (from: number, to: number) => SharedReadWindow,
  size: number,
): WindowAccess => {
  const chatLastId = () => chat().length - 1;
  const recentTurns = () => {
    const to = settledLastIndex(chat());
    return read(Math.max(0, to + 1 - size), to).messages.map((message) => ({ speaker: message.speaker, text: message.text, isUser: message.isUser }));
  };
  const recentWindow = () => recentTurns().map(({ speaker, text }) => ({ speaker, text }));
  return { chatLastId, recentWindow, recentTurns };
};
