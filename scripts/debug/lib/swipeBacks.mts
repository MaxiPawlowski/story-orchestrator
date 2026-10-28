import { createHash } from 'node:crypto';

export const S4_PER_HUNDRED = 3;
export const S4_MIN_TURNS = 300;

export interface ChatRow {
  name?: unknown;
  is_user?: unknown;
  is_system?: unknown;
  send_date?: unknown;
  swipes?: unknown;
  swipe_id?: unknown;
  swipe_info?: unknown;
}

export interface Snapshot {
  label: string;
  rows: ChatRow[];
}

interface ReplyState {
  key: string;
  swipes: number;
  at: number;
}

export interface ChatCount {
  chat: string;
  snapshots: number;
  playerTurns: number;
  replies: number;
  regenerations: number;
  swipeBacks: number;
  swipeBacksKeptInFinal: number;
  perHundred: number | null;
}

export interface SwipeBackReport {
  chats: ChatCount[];
  playerTurns: number;
  swipeBacks: number;
  perHundred: number | null;
  floor: { perHundred: number; minTurns: number };
  verdict: 'pass' | 'fail' | 'insufficient';
  lowerBound: string;
}

export const parseChatJsonl = (text: string): ChatRow[] => text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as ChatRow)
  .filter((row) => !('chat_metadata' in (row as Record<string, unknown>)) || 'mes' in (row as Record<string, unknown>));

const isPlayer = (row: ChatRow) => row.is_user === true && row.is_system !== true;

const isReply = (row: ChatRow) => row.is_user !== true && row.is_system !== true;

const swipeCount = (row: ChatRow) => (Array.isArray(row.swipes) ? row.swipes.length : 0);

const swipeAt = (row: ChatRow) => (typeof row.swipe_id === 'number' && Number.isInteger(row.swipe_id) ? row.swipe_id : 0);

const firstSendDate = (row: ChatRow): string | null => {
  const info = Array.isArray(row.swipe_info) ? row.swipe_info[0] as { send_date?: unknown } | undefined : undefined;
  return typeof info?.send_date === 'string' ? info.send_date : null;
};

const firstText = (row: ChatRow) => (Array.isArray(row.swipes) && typeof row.swipes[0] === 'string' ? row.swipes[0] : '');

export const replyKey = (row: ChatRow, index: number): string => {
  const name = typeof row.name === 'string' ? row.name : '';
  const date = firstSendDate(row);
  return date ? `${name}|${date}` : `${name}|#${index}|${createHash('sha256').update(firstText(row)).digest('hex').slice(0, 12)}`;
};

const replyStates = (rows: readonly ChatRow[]): Map<string, ReplyState> => new Map(rows.flatMap((row, index) => (isReply(row) && swipeCount(row) > 1
  ? [[replyKey(row, index), { key: replyKey(row, index), swipes: swipeCount(row), at: swipeAt(row) }] as const]
  : [])));

const movedBack = (before: ReplyState | undefined, after: ReplyState): boolean => {
  if (!before) return after.at < after.swipes - 1;
  if (after.swipes < before.swipes) return false;
  if (after.at < before.at) return true;
  return after.swipes > before.swipes && after.at < after.swipes - 1;
};

export const countChat = (chat: string, snapshots: readonly Snapshot[]): ChatCount => {
  if (!snapshots.length) throw new Error(`${chat}: no snapshot to read`);
  const final = snapshots[snapshots.length - 1].rows;
  let previous = new Map<string, ReplyState>();
  let swipeBacks = 0;
  snapshots.forEach((snapshot) => {
    const states = replyStates(snapshot.rows);
    states.forEach((state, key) => { if (movedBack(previous.get(key), state)) swipeBacks += 1; });
    previous = new Map([...previous, ...states]);
  });
  const playerTurns = final.filter(isPlayer).length;
  const replies = final.filter(isReply);
  return {
    chat,
    snapshots: snapshots.length,
    playerTurns,
    replies: replies.length,
    regenerations: replies.reduce((sum, row) => sum + Math.max(0, swipeCount(row) - 1), 0),
    swipeBacks,
    swipeBacksKeptInFinal: replies.filter((row) => swipeCount(row) > 1 && swipeAt(row) < swipeCount(row) - 1).length,
    perHundred: playerTurns ? Math.round((swipeBacks / playerTurns) * 10000) / 100 : null,
  };
};

export const report = (chats: readonly ChatCount[]): SwipeBackReport => {
  const playerTurns = chats.reduce((sum, chat) => sum + chat.playerTurns, 0);
  const swipeBacks = chats.reduce((sum, chat) => sum + chat.swipeBacks, 0);
  const perHundred = playerTurns ? Math.round((swipeBacks / playerTurns) * 10000) / 100 : null;
  const verdict = playerTurns < S4_MIN_TURNS ? 'insufficient' : (perHundred ?? 0) >= S4_PER_HUNDRED ? 'pass' : 'fail';
  return {
    chats: [...chats], playerTurns, swipeBacks, perHundred, floor: { perHundred: S4_PER_HUNDRED, minTurns: S4_MIN_TURNS }, verdict,
    lowerBound: 'a back-and-forth between two saves leaves no trace, so swipeBacks is a lower bound; backups extend the trace only while ST still keeps them',
  };
};

export const backupKey = (name: string): string => {
  const sanitized = name.replace(/[/\\?<>:*|"\u0000-\u001f\u0080-\u009f]/g, '').replace(/^\.+$/, '').replace(/[. ]+$/, '');
  const key = sanitized.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return /[^\x20-\x7E]/.test(name) ? `${key}_${createHash('sha256').update(name).digest('hex').slice(0, 8)}` : key;
};

export const backupsFor = (chatName: string, files: readonly string[]): string[] => {
  const prefix = `chat_${backupKey(chatName)}_`;
  return files.filter((file) => file.startsWith(prefix) && /^\d{8}-\d{6}\.jsonl$/.test(file.slice(prefix.length))).sort();
};
