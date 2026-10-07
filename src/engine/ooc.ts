const WRAPPED = /^\(\([\s\S]*\)\)$/;
const MARKED = /^\(?\s*OOC\s*[:)]/i;

export const isOocText = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.length > 0 && (WRAPPED.test(trimmed) || MARKED.test(trimmed));
};

interface ChatRow { is_user?: unknown; is_system?: unknown; mes?: unknown }

const rowOf = (row: unknown): ChatRow | null => (typeof row === "object" && row !== null ? row as ChatRow : null);

export const isPlayerLine = (row: unknown): boolean => {
  const shaped = rowOf(row);
  return Boolean(shaped?.is_user) && !shaped?.is_system;
};

export const isOocLine = (row: unknown): boolean => {
  const shaped = rowOf(row);
  return isPlayerLine(row) && typeof shaped?.mes === "string" && isOocText(shaped.mes);
};

export const isInCharacterPlayerLine = (row: unknown): boolean => isPlayerLine(row) && !isOocLine(row);

export const latestPlayerLineIsOoc = (chat: readonly unknown[], lastMessageId: number): boolean => {
  for (let index = Math.min(lastMessageId, chat.length - 1); index >= 0; index -= 1) {
    if (isPlayerLine(chat[index])) return isOocLine(chat[index]);
  }
  return false;
};
