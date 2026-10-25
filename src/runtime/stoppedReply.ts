let held: { chatId: string; messageId: number } | null = null;

export const holdStoppedReply = (chatId: string, messageId: number): void => { held = { chatId, messageId }; };

export const heldStoppedReply = (chatId: string | null | undefined): number | null =>
  held && held.chatId === chatId ? held.messageId : null;

export const takeStoppedReply = (chatId: string | null | undefined): number | null => {
  const id = heldStoppedReply(chatId);
  held = null;
  return id;
};

export const clearStoppedReply = (): void => { held = null; };

export const readableEndBefore = (chatId: string | null | undefined): number | undefined => {
  const id = heldStoppedReply(chatId);
  return id === null ? undefined : id - 1;
};

export const readableLastId = (chatId: string | null | undefined, lastId: number): number => {
  const end = readableEndBefore(chatId);
  return end === undefined ? lastId : Math.min(lastId, end);
};
