import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parsePrompt, type Segment } from './compactionRating.mts';

export interface LoudPrompt { chat: string; member: string; index: number; prompt: string; history: Segment[]; system: string; body?: Record<string, unknown> }

export const chatHash = (text: string) => createHash('sha256').update(text, 'utf-8').digest('hex').slice(0, 8);

export async function readJsonl(path: string): Promise<unknown[]> {
  if (!existsSync(path)) return [];
  return (await readFile(path, 'utf-8')).split(/\r?\n/).filter((line) => line.trim()).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);

export function loudPrompt(row: unknown, file: string): LoudPrompt | null {
  const entry = record(row);
  const body = record(entry?.parsedBody);
  const prompt = body?.prompt;
  if (!entry || typeof prompt !== 'string' || !entry.draftMemberName || body?.stream !== true) return null;
  const parsed = parsePrompt(prompt);
  const segments = [...parsed.head, ...parsed.body];
  return {
    chat: `${file}#${String(entry.chatId)}`, member: String(entry.draftMemberName), index: Number(entry.index), prompt,
    history: parsed.body.filter((segment) => segment.role !== 'system'),
    system: segments.filter((segment) => segment.role === 'system').map((segment) => segment.text).join('\n'),
    body,
  };
}

export async function loudChats(files: readonly string[]): Promise<Map<string, LoudPrompt[]>> {
  const chats = new Map<string, LoudPrompt[]>();
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`no payload file at ${file}`);
    for (const row of await readJsonl(file)) {
      const prompt = loudPrompt(row, file);
      if (prompt) chats.set(prompt.chat, [...(chats.get(prompt.chat) ?? []), prompt]);
    }
  }
  for (const list of chats.values()) list.sort((left, right) => left.index - right.index);
  return chats;
}

export const turnText = (segment: Segment) => segment.text.trim();

export interface NewReply { text: string; position: number; before: LoudPrompt }

export function newReplies(list: readonly LoudPrompt[]): NewReply[] {
  const out: NewReply[] = [];
  for (let at = 0; at + 1 < list.length; at += 1) {
    const seen = new Set(list[at].history.map(turnText));
    const next = list[at + 1].history;
    next.forEach((segment, position) => {
      if (segment.role === 'model' && !seen.has(turnText(segment)) && turnText(segment)) {
        out.push({ text: turnText(segment), position: next.slice(0, position + 1).filter((turn) => turn.role === 'model').length, before: list[at] });
      }
    });
  }
  const unique = new Map<string, NewReply>();
  for (const reply of out) if (!unique.has(reply.text)) unique.set(reply.text, reply);
  return [...unique.values()];
}
