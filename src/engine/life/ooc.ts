const WRAPPED = /^\(\([\s\S]*\)\)$/;
const MARKED = /^\(?\s*OOC\s*[:)]/i;

export const isOocText = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.length > 0 && (WRAPPED.test(trimmed) || MARKED.test(trimmed));
};

interface ChatRow { is_user?: boolean; is_system?: boolean; mes?: unknown }

export const latestPlayerLineIsOoc = (chat: readonly unknown[], lastMessageId: number): boolean => {
  for (let index = Math.min(lastMessageId, chat.length - 1); index >= 0; index -= 1) {
    const row = chat[index] as ChatRow | null;
    if (row?.is_user && !row.is_system) return typeof row.mes === "string" && isOocText(row.mes);
  }
  return false;
};
