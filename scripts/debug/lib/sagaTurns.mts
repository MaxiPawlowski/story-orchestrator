export const RESIDUE_TAGS = ['<|channel>thought', '<|channel>', '<channel|>', '<thinking>', '</thinking>', '<think>', '</think>'];

export const visibleText = (mes: unknown): string => (typeof mes === 'string' ? RESIDUE_TAGS.reduce((text, tag) => text.split(tag).join(''), mes).trim() : '');

export interface SagaRow { id: number; name: string | null; user: boolean; system: boolean; visible: number; reasoning: number; swipes: number; swipeId: number }

export function sagaRow(row: any, id: number): SagaRow {
  return {
    id,
    name: typeof row?.name === 'string' ? row.name : null,
    user: row?.is_user === true,
    system: row?.is_system === true,
    visible: visibleText(row?.mes).length,
    reasoning: typeof row?.extra?.reasoning === 'string' ? row.extra.reasoning.trim().length : 0,
    swipes: Array.isArray(row?.swipes) ? row.swipes.length : 1,
    swipeId: typeof row?.swipe_id === 'number' ? row.swipe_id : 0,
  };
}

export const isReply = (row: SagaRow): boolean => !row.user && !row.system;
export const isEmptyVisible = (row: SagaRow): boolean => isReply(row) && row.visible === 0;

export interface BoundaryEntry { boundary?: number; lastMessageId?: number; at?: number }
export interface Recovery { at: number; messageId: number; outcome: string }

export interface TurnSummary {
  replies: number;
  emptyLeft: number;
  emptyIds: number[];
  recoveries: number;
  recoveriesAskedAgain: number;
  askedAgainEndedVisible: number;
  boundariesOnEmpty: number;
}

export function summarizeTurn(rows: SagaRow[], boundaries: BoundaryEntry[], recoveries: Recovery[]): TurnSummary {
  const replies = rows.filter(isReply);
  const empty = replies.filter(isEmptyVisible);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const asked = recoveries.filter((record) => record.outcome === 'asked-again');
  const lastId = rows.length ? rows[rows.length - 1].id : -1;
  const endedVisible = asked.filter((record) => record.messageId === lastId && (byId.get(record.messageId)?.visible ?? 0) > 0).length;
  const firstRecoveryAt = new Map<number, number>();
  for (const record of recoveries) if (!firstRecoveryAt.has(record.messageId) || record.at < (firstRecoveryAt.get(record.messageId) as number)) firstRecoveryAt.set(record.messageId, record.at);
  const onEmpty = boundaries.filter((entry) => {
    const id = entry.lastMessageId;
    if (typeof id !== 'number') return false;
    const row = byId.get(id);
    if (row && isEmptyVisible(row)) return true;
    const recoveredAt = firstRecoveryAt.get(id);
    return recoveredAt !== undefined && typeof entry.at === 'number' && entry.at < recoveredAt;
  }).length;
  return {
    replies: replies.length,
    emptyLeft: empty.length,
    emptyIds: empty.map((row) => row.id),
    recoveries: recoveries.length,
    recoveriesAskedAgain: asked.length,
    askedAgainEndedVisible: endedVisible,
    boundariesOnEmpty: onEmpty,
  };
}
