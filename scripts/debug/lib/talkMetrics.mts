import { asksPlayer } from '../../../src/talk/asksPlayer.ts';

export interface ChatRow {
  name?: string;
  mes?: string;
  is_user?: boolean;
  is_system?: boolean;
}

export interface TalkMetricsInput {
  rows: ChatRow[];
  player: string;
  lead: string;
  cast: string[];
}

export interface TalkMetrics {
  aiLines: number;
  playerSends: number;
  openingHook: boolean;
  turnsToFirstAddress: number | null;
  playerQuestions: number;
  yieldedAfterQuestion: number;
  yieldIntegrity: number | null;
  voicesPerSend: { mean: number | null; max: number };
  partyShare: number | null;
  leadWords: { p50: number | null; p90: number | null };
}

const speaking = (rows: ChatRow[]) => rows.filter((row) => !row.is_system && typeof row.mes === 'string');

const quantile = (values: number[], q: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export const talkMetrics = ({ rows, player, lead, cast }: TalkMetricsInput): TalkMetrics => {
  const lines = speaking(rows);
  const same = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
  const asks = (row: ChatRow) => !row.is_user && asksPlayer(row.mes ?? '', { player: [player], others: cast.filter((name) => !same(row.name, name)) });
  const ai = lines.filter((row) => !row.is_user);
  const firstSend = lines.findIndex((row) => row.is_user);
  const opening = firstSend < 0 ? lines : lines.slice(0, firstSend);
  const firstAddress = ai.findIndex((row) => !same(row.name, lead) && asks(row));
  const questionAt = lines.flatMap((row, index) => (asks(row) ? [index] : []));
  const yielded = questionAt.filter((index) => index === lines.length - 1 || lines[index + 1]?.is_user).length;
  const rounds = lines.reduce<number[]>((acc, row) => {
    if (row.is_user) acc.push(0);
    else if (acc.length) acc[acc.length - 1] += 1;
    return acc;
  }, []);
  const leadWords = ai.filter((row) => same(row.name, lead)).map((row) => words(row.mes ?? ''));
  return {
    aiLines: ai.length,
    playerSends: rounds.length,
    openingHook: opening.some((row) => !row.is_user && !same(row.name, lead) && asks(row)),
    turnsToFirstAddress: firstAddress < 0 ? null : firstAddress,
    playerQuestions: questionAt.length,
    yieldedAfterQuestion: yielded,
    yieldIntegrity: questionAt.length ? yielded / questionAt.length : null,
    voicesPerSend: { mean: rounds.length ? rounds.reduce((sum, count) => sum + count, 0) / rounds.length : null, max: Math.max(0, ...rounds) },
    partyShare: ai.length ? ai.filter((row) => !same(row.name, lead)).length / ai.length : null,
    leadWords: { p50: quantile(leadWords, 0.5), p90: quantile(leadWords, 0.9) },
  };
};

export const parseChatJsonl = (text: string): ChatRow[] => text.split(/\r?\n/).filter((line) => line.trim()).flatMap((line) => {
  try {
    const row = JSON.parse(line) as ChatRow & { chat_metadata?: unknown };
    return row && typeof row === 'object' && 'mes' in row ? [row] : [];
  } catch {
    return [];
  }
});
