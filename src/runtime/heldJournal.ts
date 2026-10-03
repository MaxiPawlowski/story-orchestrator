import { TYPED_EVIDENCE_CHARS } from "@judge/index";

export interface HeldReading {
  key: string;
  value: string;
  evidence: string;
  reason?: string;
  playerLine?: string;
  messageId?: number;
  sourceChars?: number;
}

export const HELD_QUOTE_CHARS = 120;

const quote = (text: string) => `"${text.slice(0, HELD_QUOTE_CHARS)}"`;

const cut = (entry: HeldReading) => entry.sourceChars === undefined || entry.messageId === undefined ? ""
  : `, evidence cut to the first ${TYPED_EVIDENCE_CHARS} of ${entry.sourceChars} characters of message ${entry.messageId}`;

export const heldNote = (held: readonly HeldReading[]): string => held.map((entry) => [
  `${entry.key}="${entry.value}"${entry.reason ? ` (${entry.reason})` : ""} from ${quote(entry.evidence)}${cut(entry)}`,
  entry.playerLine !== undefined ? `, the player wrote ${quote(entry.playerLine)}` : "",
].join("")).join("; ");
