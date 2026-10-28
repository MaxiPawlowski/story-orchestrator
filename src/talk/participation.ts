import { isRecord } from "@utils/guards";

export interface SpeechRow {
  speaker: string;
  isUser: boolean;
  isSystem: boolean;
  text: string;
}

export interface QuietCandidate {
  rosterId: string;
  name: string;
  names: readonly string[];
}

export const speechRows = (chat: readonly unknown[]): SpeechRow[] => chat.map((row) => (isRecord(row)
  ? { speaker: typeof row.name === "string" ? row.name : "", isUser: row.is_user === true, isSystem: row.is_system === true, text: typeof row.mes === "string" ? row.mes : "" }
  : { speaker: "", isUser: false, isSystem: true, text: "" }));

const spoken = (row: SpeechRow | undefined): row is SpeechRow => row !== undefined && !row.isSystem;

export const latestSend = (rows: readonly SpeechRow[]): number => {
  for (let index = rows.length - 1; index >= 0; index -= 1) if (spoken(rows[index]) && rows[index].isUser) return index;
  return -1;
};

export const playerTurnsAfter = (rows: readonly SpeechRow[], index: number): number =>
  rows.reduce((count, row, at) => count + (at > index && spoken(row) && row.isUser ? 1 : 0), 0);

const sameName = (names: readonly string[]) => {
  const wanted = new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean));
  return (row: SpeechRow) => wanted.has(row.speaker.trim().toLowerCase());
};

export const lastLineAt = (rows: readonly SpeechRow[], from: number, match: (row: SpeechRow, index: number) => boolean): number => {
  for (let index = rows.length - 1; index >= Math.max(0, from); index -= 1) {
    const row = rows[index];
    if (spoken(row) && !row.isUser && match(row, index)) return index;
  }
  return -1;
};

export const quietTurns = (rows: readonly SpeechRow[], names: readonly string[], from: number): number => {
  const at = lastLineAt(rows, from, sameName(names));
  return playerTurnsAfter(rows, at < 0 ? from - 1 : at);
};

export const turnsSince = (rows: readonly SpeechRow[], from: number, match: (row: SpeechRow, index: number) => boolean): number => {
  const at = lastLineAt(rows, from, match);
  return playerTurnsAfter(rows, at < 0 ? from - 1 : at);
};

export const pickQuiet = (
  rows: readonly SpeechRow[], candidates: readonly QuietCandidate[], from: number, quietAfter: number, random?: () => number,
): QuietCandidate | null => {
  const scored = candidates.map((candidate) => ({ candidate, turns: quietTurns(rows, candidate.names, from) })).filter((entry) => entry.turns >= quietAfter);
  if (!scored.length) return null;
  const top = Math.max(...scored.map((entry) => entry.turns));
  const tied = scored.filter((entry) => entry.turns === top);
  const at = tied.length > 1 && random ? Math.min(tied.length - 1, Math.floor(random() * tied.length)) : 0;
  return tied[at].candidate;
};

export const renderedVoicesAfter = (rows: readonly SpeechRow[], send: number, excluded: ReadonlySet<number>): number[] =>
  rows.flatMap((row, index) => (index > send && spoken(row) && !row.isUser && !excluded.has(index) ? [index] : []));

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
