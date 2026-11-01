import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface CorpusMessage {
  speaker: string;
  text: string;
  user: boolean;
}

export interface CorpusChat {
  id: string;
  messages: CorpusMessage[];
  players: string[];
  members: string[];
}

interface RawLine {
  name?: unknown;
  mes?: unknown;
  is_user?: unknown;
  is_system?: unknown;
}

export const parseChatLines = (id: string, lines: readonly string[]): CorpusChat => {
  const messages: CorpusMessage[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let row: RawLine;
    try { row = JSON.parse(line) as RawLine; } catch { continue; }
    if (typeof row.name !== 'string' || typeof row.mes !== 'string' || row.is_system === true || !row.mes.trim()) continue;
    messages.push({ speaker: row.name.trim(), text: row.mes, user: row.is_user === true });
  }
  const players = [...new Set(messages.filter((message) => message.user).map((message) => message.speaker))];
  const members = [...new Set(messages.filter((message) => !message.user).map((message) => message.speaker))].filter((name) => !players.includes(name));
  return { id, messages, players, members };
};

export const laneChatDirs = (root: string): string[] => existsSync(root)
  ? readdirSync(root).map((lane) => join(root, lane, 'data', 'default-user', 'group chats')).filter((dir) => existsSync(dir) && statSync(dir).isDirectory())
  : [];

interface SessionRow {
  name?: unknown;
  text?: unknown;
  isUser?: unknown;
  isSystem?: unknown;
}

export const sessionChatLines = (rows: readonly SessionRow[]): string[] => rows.map((row) => JSON.stringify({ name: row.name, mes: row.text, is_user: row.isUser, is_system: row.isSystem }));

export const loadSessionChats = (gitDir: string): CorpusChat[] => {
  if (!existsSync(gitDir)) return [];
  const git = (...args: string[]) => execFileSync('git', [`--git-dir=${gitDir}`, ...args], { encoding: 'utf-8', maxBuffer: 1 << 28 });
  const files = git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').map((line) => line.trim()).filter((file) => /chat-full-[^/]+\.json$/.test(file));
  return files.flatMap((file) => {
    try {
      const rows = JSON.parse(git('show', `HEAD:${file}`)) as SessionRow[];
      const id = basename(file, '.json').replace(/^chat-full-/, '');
      return Array.isArray(rows) ? [parseChatLines(id, sessionChatLines(rows))] : [];
    } catch { return []; }
  });
};

export const loadGroupChats = (dirs: readonly string[], extra: readonly CorpusChat[] = []): CorpusChat[] => {
  const longest = new Map<string, CorpusChat>();
  for (const chat of extra) {
    const kept = longest.get(chat.id);
    if (!kept || chat.messages.length > kept.messages.length) longest.set(chat.id, chat);
  }
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue;
      const id = basename(file, '.jsonl');
      const chat = parseChatLines(id, readFileSync(join(dir, file), 'utf-8').split(/\r?\n/));
      const kept = longest.get(id);
      if (!kept || chat.messages.length > kept.messages.length) longest.set(id, chat);
    }
  }
  return [...longest.values()].filter((chat) => chat.members.length > 0).sort((a, b) => a.id.localeCompare(b.id));
};

const textKey = (speaker: string, text: string) => `${speaker}\u0000${text}`;

export const distinctReplies = (chats: readonly CorpusChat[]): Array<{ chat: CorpusChat; message: CorpusMessage }> => {
  const seen = new Set<string>();
  const out: Array<{ chat: CorpusChat; message: CorpusMessage }> = [];
  for (const chat of chats) {
    for (const message of chat.messages) {
      if (message.user) continue;
      const key = textKey(message.speaker, message.text);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ chat, message });
    }
  }
  return out;
};
