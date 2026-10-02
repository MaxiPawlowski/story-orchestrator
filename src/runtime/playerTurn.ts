import type { BoundaryContext } from "@engine/index";

export function lastPlayerMessageAt(chat: readonly unknown[], last: number): { lastPlayerMessageId?: number } {
  for (let index = Math.min(last, chat.length - 1); index >= 0; index -= 1) {
    const row = chat[index] as { is_user?: unknown; is_system?: unknown } | null | undefined;
    if (row?.is_user === true && row.is_system !== true) return { lastPlayerMessageId: index };
  }
  return {};
}

export function boundaryContextAt(chat: unknown, at?: number): BoundaryContext {
  const rows = Array.isArray(chat) ? chat : [];
  const last = at === undefined ? rows.length - 1 : Math.min(at, rows.length - 1);
  return { lastMessageId: last, chatLength: last + 1, ...lastPlayerMessageAt(rows, last) };
}
