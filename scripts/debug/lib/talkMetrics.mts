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
  budget?: number;
  leadWords?: number;
}

export interface SpeechLedgerRow {
  send: number;
  origin: string;
  generated: boolean;
  messageId: number | null;
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
  budget: { limit: number; rounds: number; compliant: number; rate: number | null } | null;
  spotlight: { share: Record<string, number>; longestPartyGap: number; longestQuiet: Record<string, number> };
  leadLength: { target: number; within: number; lines: number; rate: number | null } | null;
}

export interface SpeechLedgerMetrics {
  events: number;
  byOrigin: Record<string, number>;
  failedAttempts: number;
  maxVoicesPerSend: number;
}

const speaking = (rows: ChatRow[]) => rows.filter((row) => !row.is_system && typeof row.mes === 'string');

const quantile = (values: number[], q: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export const talkMetrics = ({ rows, player, lead, cast, budget, leadWords: leadTarget }: TalkMetricsInput): TalkMetrics => {
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
    budget: budget === undefined ? null : budgetCompliance(rounds, budget),
    spotlight: spotlightMetrics(lines, lead, cast, same),
    leadLength: leadTarget === undefined ? null : {
      target: leadTarget, within: leadWords.filter((count) => count <= leadTarget * LEAD_SLACK).length, lines: leadWords.length,
      rate: leadWords.length ? leadWords.filter((count) => count <= leadTarget * LEAD_SLACK).length / leadWords.length : null,
    },
  };
};

const LEAD_SLACK = 1.25;

const budgetCompliance = (rounds: number[], limit: number) => {
  const compliant = rounds.filter((count) => count <= limit).length;
  return { limit, rounds: rounds.length, compliant, rate: rounds.length ? compliant / rounds.length : null };
};

const spotlightMetrics = (lines: ChatRow[], lead: string, cast: string[], same: (a: string | undefined, b: string) => boolean) => {
  const party = cast.filter((name) => !same(name, lead));
  const partyLines = lines.filter((row) => !row.is_user && party.some((name) => same(row.name, name)));
  const share = Object.fromEntries(party.map((name) => [name, partyLines.length ? partyLines.filter((row) => same(row.name, name)).length / partyLines.length : 0]));
  let gap = 0;
  let longestPartyGap = 0;
  let sawParty = false;
  const quiet = Object.fromEntries(party.map((name) => [name, 0]));
  const longestQuiet = { ...quiet };
  for (const row of lines) {
    if (row.is_user) {
      if (!sawParty) gap += 1;
      longestPartyGap = Math.max(longestPartyGap, gap);
      sawParty = false;
      for (const name of party) {
        quiet[name] += 1;
        longestQuiet[name] = Math.max(longestQuiet[name], quiet[name]);
      }
      continue;
    }
    const speaker = party.find((name) => same(row.name, name));
    if (!speaker) continue;
    sawParty = true;
    gap = 0;
    quiet[speaker] = 0;
  }
  return { share, longestPartyGap, longestQuiet };
};

export const speechLedgerMetrics = (rows: SpeechLedgerRow[]): SpeechLedgerMetrics => {
  const byOrigin: Record<string, number> = {};
  const voices = new Map<number, number>();
  for (const row of rows) {
    byOrigin[row.origin] = (byOrigin[row.origin] ?? 0) + 1;
    if (row.messageId !== null && row.origin !== 'entry') voices.set(row.send, (voices.get(row.send) ?? 0) + 1);
  }
  return {
    events: rows.length, byOrigin, failedAttempts: rows.filter((row) => row.generated && row.messageId === null && row.origin !== 'entry').length,
    maxVoicesPerSend: Math.max(0, ...voices.values()),
  };
};

const storyExtras = (text: string): Record<string, unknown> | null => {
  const first = text.split(/\r?\n/).find((line) => line.trim());
  try {
    type Blob = { selectedStoryId?: string | null; stories?: Record<string, { extras?: Record<string, unknown> }> };
    const header = first ? JSON.parse(first) as { chat_metadata?: { story_orchestrator?: Blob } } : null;
    const blob = header?.chat_metadata?.story_orchestrator;
    return blob?.stories?.[blob.selectedStoryId ?? '']?.extras ?? null;
  } catch {
    return null;
  }
};

export const parseSpeechLedger = (text: string): SpeechLedgerRow[] => {
  const speech = storyExtras(text)?.speech;
  return Array.isArray(speech) ? speech.filter((row): row is SpeechLedgerRow => Boolean(row) && typeof row === 'object' && typeof (row as SpeechLedgerRow).origin === 'string') : [];
};

export interface ChainEndRow {
  reason: string;
  voices: number;
}

export const parseChainEnds = (text: string): ChainEndRow[] => {
  const ends = storyExtras(text)?.chainEnds;
  return Array.isArray(ends) ? ends.filter((row): row is ChainEndRow => Boolean(row) && typeof row === 'object' && typeof (row as ChainEndRow).reason === 'string') : [];
};

export const chainEndMetrics = (rows: ChainEndRow[]): { chains: number; byReason: Record<string, number>; meanVoices: number | null } => {
  const byReason: Record<string, number> = {};
  for (const row of rows) byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
  return { chains: rows.length, byReason, meanVoices: rows.length ? rows.reduce((sum, row) => sum + (Number(row.voices) || 0), 0) / rows.length : null };
};

export const parseChatJsonl = (text: string): ChatRow[] => text.split(/\r?\n/).filter((line) => line.trim()).flatMap((line) => {
  try {
    const row = JSON.parse(line) as ChatRow & { chat_metadata?: unknown };
    return row && typeof row === 'object' && 'mes' in row ? [row] : [];
  } catch {
    return [];
  }
});
