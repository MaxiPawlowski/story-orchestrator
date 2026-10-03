import type { ParsedDelta } from "./types";

export interface EvidenceCut {
  messageId?: number;
  sourceChars?: number;
}

export const evidenceCut = (delta: Pick<ParsedDelta, "messageId" | "sourceChars">): EvidenceCut => delta.sourceChars === undefined ? {}
  : { sourceChars: delta.sourceChars, ...(delta.messageId !== undefined ? { messageId: delta.messageId } : {}) };
