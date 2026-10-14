export type ChatRow = { name?: unknown; mes?: unknown; is_user?: boolean; is_system?: boolean; extra?: { reasoning?: unknown } };

export interface CarryInputLike {
  rosterId: string;
  name: string;
  rows: unknown[];
  players: string[];
  from: number;
}

export interface CarryItem {
  key: string;
  messageId: number;
  member: string;
  line: string;
  reason: string | null;
  reasoning: string;
}

export interface Rating {
  key: string;
  aim: boolean;
  meta: boolean;
  player: boolean;
  performed: boolean;
}

export const FLOORS = { precision: 0.8, metaLeak: 0.05, player: 0, yield: 0.25, minRated: 20 } as const;
export const REASONING_EXCERPT = 1500;

export const readChat = (text: string): ChatRow[] => text.split('\n').filter((line) => line.trim()).flatMap((line) => {
  try {
    const row = JSON.parse(line) as ChatRow & { chat_metadata?: unknown };
    return row && typeof row === 'object' && !('chat_metadata' in row) ? [row] : [];
  } catch {
    return [];
  }
});

export const draftInputs = (rows: ChatRow[]): Array<{ messageId: number; member: string; input: CarryInputLike; reasoning: string }> => {
  const players = [...new Set(rows.filter((row) => row.is_user && typeof row.name === 'string').map((row) => String(row.name)))];
  return rows.flatMap((row, messageId) => {
    if (row.is_user || row.is_system || typeof row.name !== 'string' || typeof row.extra?.reasoning !== 'string' || !row.extra.reasoning.trim()) return [];
    const next = { name: players[0] ?? 'Player', mes: '…', is_user: true };
    return [{ messageId, member: row.name, reasoning: row.extra.reasoning, input: { rosterId: row.name, name: row.name, rows: [...rows.slice(0, messageId + 1), next], players, from: 0 } }];
  });
};

export const ratePrompt = (batch: CarryItem[]): string => [
  'You rate lines a roleplay system hands back to a character as its private intent for its next turn.',
  'Each line was picked from that character\'s own hidden reasoning on its previous reply (the reasoning is given for context).',
  'For each item answer four booleans:',
  '- aim: the line states a standing aim, want or goal of that character, in character (something it is still after).',
  '- meta: the line is a writing, narration or formatting instruction rather than the character\'s aim.',
  '- player: the line states what the player character does, says or decides.',
  '- performed: the line is only a step the character already carried out in that reply, not a goal that persists.',
  'Answer with JSON only: {"ratings":[{"key":"…","aim":true,"meta":false,"player":false,"performed":false}, …]} with one entry per key.',
  '',
  ...batch.map((item) => JSON.stringify({ key: item.key, character: item.member, line: item.line, reasoning: item.reasoning.slice(0, REASONING_EXCERPT) })),
].join('\n');

export const parseRatings = (text: string): Rating[] => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { ratings?: unknown };
    const list = Array.isArray(parsed.ratings) ? parsed.ratings : [];
    return list.flatMap((entry) => {
      const value = entry as Record<string, unknown>;
      return typeof value.key === 'string' && ['aim', 'meta', 'player', 'performed'].every((field) => typeof value[field] === 'boolean')
        ? [{ key: value.key, aim: Boolean(value.aim), meta: Boolean(value.meta), player: Boolean(value.player), performed: Boolean(value.performed) }]
        : [];
    });
  } catch {
    return [];
  }
};

export interface Score {
  replies: number;
  carried: number;
  rated: number;
  yield: number;
  precision: number | null;
  metaLeak: number | null;
  player: number;
  reasons: Record<string, number>;
  verdict: 'pass' | 'fail' | 'incomplete';
  misses: string[];
}

export const score = (items: CarryItem[], ratings: Rating[]): Score => {
  const carried = items.filter((item) => item.line);
  const byKey = new Map(ratings.map((rating) => [rating.key, rating]));
  const rated = carried.map((item) => byKey.get(item.key)).filter((rating): rating is Rating => Boolean(rating));
  const good = rated.filter((rating) => rating.aim && !rating.meta && !rating.player && !rating.performed).length;
  const meta = rated.filter((rating) => rating.meta).length;
  const player = rated.filter((rating) => rating.player).length;
  const reasons: Record<string, number> = {};
  for (const item of items) if (!item.line) reasons[item.reason ?? 'unknown'] = (reasons[item.reason ?? 'unknown'] ?? 0) + 1;
  const precision = rated.length ? good / rated.length : null;
  const metaLeak = rated.length ? meta / rated.length : null;
  const yieldRate = items.length ? carried.length / items.length : 0;
  const misses = [
    precision !== null && precision < FLOORS.precision ? `precision ${precision.toFixed(3)} < ${FLOORS.precision}` : '',
    metaLeak !== null && metaLeak > FLOORS.metaLeak ? `meta leak ${metaLeak.toFixed(3)} > ${FLOORS.metaLeak}` : '',
    player > FLOORS.player ? `player lines ${player} > ${FLOORS.player}` : '',
    yieldRate < FLOORS.yield ? `yield ${yieldRate.toFixed(3)} < ${FLOORS.yield}` : '',
  ].filter(Boolean);
  const verdict = rated.length < FLOORS.minRated ? 'incomplete' : misses.length ? 'fail' : 'pass';
  return { replies: items.length, carried: carried.length, rated: rated.length, yield: yieldRate, precision, metaLeak, player, reasons, verdict, misses };
};
