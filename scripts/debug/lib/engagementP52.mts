import { createHash } from 'node:crypto';

export const LABELS = ['aftermath', 'pressure-advancing', 'exploring-relationship', 'uncertain', 'repeating', 'none'] as const;
export type Label = typeof LABELS[number];
export const WINDOW_TURNS = 3;
export const FLOORS = { agreement: 0.75, windows: 40, pushedShare: 0.5 } as const;

export interface ChatRow { id: number; name: string; isUser: boolean; isSystem: boolean; text: string }
export interface LogRow { at: number; boundary: number; fired: unknown; context: { lastMessageId: number; lastPlayerMessageId?: number }; before: { blackboard: { values: Record<string, unknown> } }; after: { blackboard: { values: Record<string, unknown> }; checkpointStartedMessageId: number } }
export interface Provenanced { messageId?: number; createdAt?: number }
export interface TensionRow { messageId: number }
export interface PromiseRow { source: { messageId: number }; events: Array<{ source: { messageId: number } }> }
export interface SessionBlob { log: LogRow[]; memory: Provenanced[]; tension: TensionRow[]; promises: PromiseRow[] }

export interface Candidate { session: string; end: number; boundary: number; turns: number[] }

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export const playerTurnIds = (chat: readonly ChatRow[]): number[] => chat.filter((row) => row.isUser && !row.isSystem && row.text.trim()).map((row) => row.id);

export function candidates(session: string, blob: SessionBlob, chat: readonly ChatRow[], window = WINDOW_TURNS): Candidate[] {
  const players = playerTurnIds(chat);
  const covered = blob.tension.length ? blob.tension[0].messageId : Number.POSITIVE_INFINITY;
  const byTurn = new Map<number, Candidate>();
  for (const entry of blob.log) {
    const end = entry.context.lastMessageId;
    const turns = players.filter((id) => id > entry.after.checkpointStartedMessageId && id <= end);
    if (turns.length < window) continue;
    const inside = turns.slice(-window);
    if (inside[0] < covered) continue;
    if (!chat.some((row) => row.id > inside.at(-1)! && row.id <= end && !row.isUser && !row.isSystem)) continue;
    byTurn.set(inside.at(-1)!, { session, end, boundary: entry.boundary, turns: inside });
  }
  return [...byTurn.values()];
}

export function pick(all: readonly Candidate[], count: number, perSession: number, seed: string): Candidate[] {
  const order = [...all].sort((a, b) => sha(`${seed}:${a.session}:${a.end}`).localeCompare(sha(`${seed}:${b.session}:${b.end}`)));
  const taken = new Map<string, number>();
  const out: Candidate[] = [];
  for (const row of order) {
    if (out.length >= count) break;
    if ((taken.get(row.session) ?? 0) >= perSession) continue;
    taken.set(row.session, (taken.get(row.session) ?? 0) + 1);
    out.push(row);
  }
  return out;
}

export const windowId = (row: Candidate) => sha(`${row.session}:${row.end}`).slice(0, 12);

export function inputAt(blob: SessionBlob, chat: readonly ChatRow[], row: Candidate) {
  return {
    log: blob.log.filter((entry) => entry.context.lastMessageId <= row.end),
    playerTurns: row.turns.map((id) => ({ id, text: chat.find((line) => line.id === id)?.text ?? '' })),
    memoryIds: blob.memory.filter((item) => typeof item.messageId === 'number' && (item.createdAt ?? 0) <= row.boundary).map((item) => item.messageId as number),
    relationEvents: blob.promises.flatMap((item) => [item.source.messageId, ...item.events.map((event) => event.source.messageId)]).filter((id) => id <= row.end),
    tension: blob.tension.filter((point) => point.messageId <= row.end),
    lastMessageId: row.end,
  };
}

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)} …` : text);

export function excerpt(chat: readonly ChatRow[], row: Candidate, before = 2, limit = 1200): string {
  const start = chat.findIndex((line) => line.id === row.turns[0]);
  const lines = chat.slice(Math.max(0, start - before)).filter((line) => line.id <= row.end && !line.isSystem && line.text.trim());
  return lines.map((line) => `${line.isUser ? `[PLAYER] ${line.name}` : line.name}: ${clip(line.text.trim(), limit)}`).join('\n\n');
}

export const LABEL_SYSTEM = 'You are a careful, impartial reader of interactive roleplay fiction. You answer with exactly one JSON object.';

export const labelPrompt = (transcript: string) => `Below is a stretch of a group roleplay. The player's lines are marked [PLAYER]. In this stretch the story has not moved on to its next scene for the last ${WINDOW_TURNS} player turns. Decide WHY the scene is quiet, from the transcript alone.

Classes (if several fit, choose the FIRST that fits in this order):
1. aftermath: something just came to a head in the last two exchanges (a fight ended, a big reveal or decision landed, a climax eased) and people are reacting or catching their breath.
2. pressure-advancing: an established threat, deadline or pressure in the scene just got worse (it crossed a line), and the scene is about its consequence.
3. exploring-relationship: the player is spending the scene on a relationship: personal talk, feelings shifting, trust, affection, a promise or commitment between characters.
4. uncertain: the player seems unsure what to do; their latest line asks a question or looks for direction or information.
5. repeating: the scene is going in circles: nothing new is learned or happens, same place, same beats.
6. none: none of the above; the scene is quiet for another reason or is moving fine.

Transcript:
"""
${transcript}
"""

Answer with JSON only: {"label": "<one of: ${LABELS.join(', ')}>", "why": "<one short sentence>"}`;

export function readLabel(text: string): { label: Label; why: string | null } | { problem: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { problem: 'no JSON object' };
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    if (!LABELS.includes(value.label)) return { problem: `label ${JSON.stringify(value.label)} not in the list` };
    return { label: value.label, why: typeof value.why === 'string' ? value.why : null };
  } catch {
    return { problem: 'unparseable JSON' };
  }
}

export function agreement(rows: ReadonlyArray<{ label: Label; kind: string | null }>) {
  const confusion: Record<string, Record<string, number>> = {};
  let agree = 0;
  for (const row of rows) {
    const kind = row.kind ?? 'none';
    confusion[row.label] ??= {};
    confusion[row.label][kind] = (confusion[row.label][kind] ?? 0) + 1;
    if (kind === row.label) agree += 1;
  }
  const share = rows.length ? agree / rows.length : 0;
  return { windows: rows.length, agree, share, floor: FLOORS.agreement, pass: rows.length >= FLOORS.windows && share >= FLOORS.agreement, confusion };
}

export interface TurnRow { turn: number; arm: boolean; player: string; replies: Array<{ name: string; mes: string }>; reading: { kind: string | null } | null; rungLead: number | null; infoLine: boolean; aftermathLine: boolean }

export const turnsOf = (record: any): TurnRow[] => (record?.steps ?? []).map((step: any) => step.output).filter((output: any) => output && typeof output.turn === 'number' && 'replies' in output);

export interface Pair { id: string; turn: number; run: number; player: string; a: string; b: string }
export interface Key { id: string; a: 'on' | 'off' }

const repliesText = (row: TurnRow) => row.replies.map((reply) => `${reply.name}: ${clip(reply.mes.trim(), 2000)}`).join('\n\n') || '(no reply)';

export function pairs(on: TurnRow[][], off: TurnRow[][], seed: string): { pack: Pair[]; key: Key[] } {
  const pack: Pair[] = [];
  const key: Key[] = [];
  on.forEach((runOn, run) => {
    for (const row of runOn) {
      const other = off[run]?.find((item) => item.turn === row.turn);
      if (!other || other.player !== row.player) continue;
      const id = sha(`${seed}:${run}:${row.turn}`).slice(0, 10);
      const onFirst = parseInt(sha(`${seed}:order:${id}`).slice(0, 8), 16) % 2 === 0;
      pack.push({ id, turn: row.turn, run, player: row.player, a: repliesText(onFirst ? row : other), b: repliesText(onFirst ? other : row) });
      key.push({ id, a: onFirst ? 'on' : 'off' });
    }
  });
  return { pack, key };
}

export const RATE_SYSTEM = LABEL_SYSTEM;

export const ratePrompt = (pair: Pair) => `A player is in a group roleplay at a harbour dock. The scene's official goal is a search for a missing ledger, but the player is choosing to spend the scene on something else. Here is the player's latest line, followed by two alternative replies (A and B) from the story's characters and narrator.

Player: ${pair.player}

Reply A:
"""
${pair.a}
"""

Reply B:
"""
${pair.b}
"""

For EACH reply, judge one thing: does it push the player away from the scene the player wanted? "Pushed" means the reply drags the scene toward the search or another objective the player did not ask for, invents urgency or an interruption, or has someone urge the player on, when the player's line shows they want to stay in the moment. A plain offer of information the player asked for is not pushing. Judge each reply on its own.

Answer with JSON only: {"a": {"pushed": true|false}, "b": {"pushed": true|false}, "why": "<one short sentence>"}`;

export function readRate(text: string): { a: boolean; b: boolean; why: string | null } | { problem: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { problem: 'no JSON object' };
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    if (typeof value?.a?.pushed !== 'boolean' || typeof value?.b?.pushed !== 'boolean') return { problem: 'missing a.pushed or b.pushed' };
    return { a: value.a.pushed, b: value.b.pushed, why: typeof value.why === 'string' ? value.why : null };
  } catch {
    return { problem: 'unparseable JSON' };
  }
}

export function pushedScore(key: readonly Key[], rated: Record<string, { a: boolean; b: boolean }>, turnOf: Record<string, number>, fromTurn: number) {
  let on = 0;
  let off = 0;
  let n = 0;
  for (const row of key) {
    const verdict = rated[row.id];
    if (!verdict || turnOf[row.id] < fromTurn) continue;
    n += 1;
    const onFlag = row.a === 'on' ? verdict.a : verdict.b;
    const offFlag = row.a === 'on' ? verdict.b : verdict.a;
    on += onFlag ? 1 : 0;
    off += offFlag ? 1 : 0;
  }
  return { pairs: n, pushedOn: on, pushedOff: off, floor: `on <= ${FLOORS.pushedShare} x off`, pass: off > 0 ? on <= FLOORS.pushedShare * off : null };
}
