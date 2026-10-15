import type { PlayerSpan } from "@engine/index";
import { fnv1a } from "@runtime/hash";
import { cleanWindowMessage } from "./windowHygiene";

export const textRevision = (text: string): string => fnv1a(text);

export const playerSpanOf = (message: { messageId: number; text: string }): PlayerSpan =>
  ({ messageId: message.messageId, revision: textRevision(message.text), span: [0, message.text.length] });

export const playerRowRevision = (row: unknown): string | null => {
  const cleaned = cleanWindowMessage(row);
  return cleaned.keep && cleaned.isUser ? textRevision(cleaned.text) : null;
};
