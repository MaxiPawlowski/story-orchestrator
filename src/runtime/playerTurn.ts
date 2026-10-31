import { isInCharacterPlayerLine, isPlayerLine, type BoundaryContext } from "@engine/index";

export { readableEndBefore } from "./stoppedReply";

export const lastPlayerName = (rows: unknown[]): string => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index] as { is_user?: unknown; name?: unknown } | null;
    if (row?.is_user === true && typeof row.name === "string" && row.name.trim()) return row.name.trim();
  }
  return "";
};

export function lastPlayerRow(chat: readonly unknown[]): number {
  for (let index = chat.length - 1; index > 0; index -= 1) {
    if (isPlayerLine(chat[index])) return index;
  }
  return 0;
}

export function lastPlayerMessageAt(chat: readonly unknown[], last: number): { lastPlayerMessageId?: number } {
  for (let index = Math.min(last, chat.length - 1); index >= 0; index -= 1) {
    if (isInCharacterPlayerLine(chat[index])) return { lastPlayerMessageId: index };
  }
  return {};
}

export function boundaryContextAt(chat: unknown, at?: number): BoundaryContext {
  const rows = Array.isArray(chat) ? chat : [];
  const last = at === undefined ? rows.length - 1 : Math.min(at, rows.length - 1);
  return { lastMessageId: last, chatLength: last + 1, ...lastPlayerMessageAt(rows, last) };
}
