import type { BoundaryLogEntry } from "@engine/index";

let replaced: number | null = null;
const renderedAt = new Map<number, number>();

export const noteRegeneration = (messageId: number): void => { replaced = messageId; };

export const clearRegeneration = (): void => { replaced = null; };

export const regeneratingMessage = (): number | null => replaced;

export const noteRenderAnchor = (messageId: number, lastMessageId: number | null | undefined): void => {
  if (typeof lastMessageId !== "number") return;
  renderedAt.set(messageId, lastMessageId);
  if (renderedAt.size > 200) renderedAt.delete(renderedAt.keys().next().value as number);
};

export const resetRegeneration = (): void => {
  replaced = null;
  renderedAt.clear();
};

export const outcomeAnchor = (log: readonly BoundaryLogEntry[], message: number | null, lastMessageId: number): number => {
  if (message === null) return lastMessageId;
  const rendered = renderedAt.get(message);
  if (rendered !== undefined) return rendered;
  const consumed = log.find((entry) => entry.context.lastMessageId >= message);
  return consumed ? consumed.before.lastMessageId : lastMessageId;
};
