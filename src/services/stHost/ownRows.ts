import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { quoteSlashArg } from "@utils/string";
import { getContext } from "./context";
import { executeSlashCommands } from "./slashCommands";

export const OWN_ROW_KEY = "so_row";

export type OwnRowKind = "note" | "image";

type Row = { is_system?: unknown; is_user?: unknown; extra?: unknown };

const ownKind = (row: unknown): unknown => {
  const extra = (row as Row | null)?.extra;
  return extra && typeof extra === "object" ? (extra as Record<string, unknown>)[OWN_ROW_KEY] : undefined;
};

export const isOwnRow = (row: unknown): boolean => (row as Row | null)?.is_system === true && (ownKind(row) === "note" || ownKind(row) === "image");

export function trailingOwnRows(chat: readonly unknown[]): number {
  let count = 0;
  while (count < chat.length && isOwnRow(chat[chat.length - 1 - count])) count += 1;
  return count;
}

export function markOwnRows(chat: unknown[], from: number, kind: OwnRowKind): number {
  let marked = 0;
  for (let index = Math.max(0, from); index < chat.length; index += 1) {
    const row = chat[index] as Row | null;
    if (!row || row.is_system !== true) continue;
    row.extra = { ...(row.extra && typeof row.extra === "object" ? row.extra : {}), [OWN_ROW_KEY]: kind };
    marked += 1;
  }
  return marked;
}

export async function postOwnComment(text: string): Promise<WriteResult<{ marked: number }>> {
  const chat = getContext().chat;
  const before = Array.isArray(chat) ? chat.length : 0;
  const posted = await executeSlashCommands(`/comment compact=true raw=false ${quoteSlashArg(text)}`, { silent: true });
  const after = getContext().chat;
  if (!posted) return couldNot("the /comment that posts the note was refused");
  return wrote({ marked: Array.isArray(after) && after === chat ? markOwnRows(after, before, "note") : 0 });
}
