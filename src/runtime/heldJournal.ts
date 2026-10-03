export interface HeldReading {
  key: string;
  value: string;
  evidence: string;
  reason?: string;
  playerLine?: string;
}

export const HELD_QUOTE_CHARS = 120;

const quote = (text: string) => `"${text.slice(0, HELD_QUOTE_CHARS)}"`;

export const heldNote = (held: readonly HeldReading[]): string => held.map((entry) => [
  `${entry.key}="${entry.value}"${entry.reason ? ` (${entry.reason})` : ""} from ${quote(entry.evidence)}`,
  entry.playerLine !== undefined ? `, the player wrote ${quote(entry.playerLine)}` : "",
].join("")).join("; ");
