import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEntry } from './bundleEntry.mts';
import { readSessionChats } from './e0Label.mts';
import type { ModelReply } from './e0LabelRun.mts';

export type ChatRow = { id: number; name: string; isUser: boolean; isSystem?: boolean; text: string };
export type Asker = (prompt: string, workDir: string) => Promise<ModelReply>;
export type LogEntry = { lastMessageId: number; before: string | null; after: string | null };
export type SessionContext = {
  session: string; storyTitle: string; player: string; members: string[]; roles: Record<string, string>;
  checkpoints: Record<string, { name: string; objective: string }>; log: LogEntry[]; startCheckpoint: string | null; epistemic: Array<{ tag: string; messageId: number }>;
};
export type Session = { session: string; rows: ChatRow[]; context: SessionContext };

export interface WitrealKit {
  WITNESS_LABEL_RULES: { window: number; writer: string; checker: string; labWriter: string };
  VR62_RULES: Record<string, number | string>;
  selectE0Sessions(chats: Array<{ session: string; rows: ChatRow[] }>): { kept: string[]; short: string[]; duplicate: string[] };
  sessionMembers(rows: ChatRow[]): string[];
  e0JsonObject(text: string): Record<string, unknown> | null;
  [name: string]: unknown;
}

export const loadWitreal = () => loadEntry<WitrealKit>('scripts/debug/lib/witrealEntry.ts');

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const fileOf = (session: string) => `${session.replace(/[\\/]/g, '__')}.json`;
export const writeJson = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');
export const readJson = async <T = unknown,>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf-8')) as T;
export const jsonHash = async (file: string) => sha256(JSON.stringify(await readJson(file)));

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function contextFromRuntime(session: string, runtime: unknown, rows: ChatRow[], members: string[]): SessionContext {
  const stories = isObject(runtime) && isObject(runtime.stories) ? Object.values(runtime.stories).filter(isObject) : [];
  const logOf = (story: Record<string, unknown>) => (isObject(story.engineHistory) && Array.isArray(story.engineHistory.log) ? story.engineHistory.log : []);
  const story = [...stories].sort((left, right) => logOf(right).length - logOf(left).length)[0] ?? {};
  const pinned = isObject(story.pinnedStory) ? story.pinnedStory : {};
  const roster = Array.isArray(pinned.roster) ? pinned.roster.filter(isObject) : [];
  const roles = Object.fromEntries(members.flatMap((name) => {
    const entry = roster.find((row) => typeof row.name === 'string' && row.name.toLowerCase() === name.toLowerCase());
    return entry && typeof entry.role === 'string' && entry.role ? [[name, entry.role]] : [];
  }));
  const checkpointRows = Array.isArray(pinned.checkpoints) ? pinned.checkpoints.filter(isObject) : [];
  const checkpoints = Object.fromEntries(checkpointRows.filter((row) => typeof row.id === 'string')
    .map((row) => [row.id as string, { name: typeof row.name === 'string' ? row.name : '', objective: typeof row.objective === 'string' ? row.objective : '' }]));
  const start = checkpointRows.find((row) => row.start === true) ?? checkpointRows[0];
  const log = logOf(story).filter(isObject).map((entry) => ({
    lastMessageId: isObject(entry.context) && typeof entry.context.lastMessageId === 'number' ? entry.context.lastMessageId : -1,
    before: isObject(entry.before) && typeof entry.before.activeCheckpointId === 'string' ? entry.before.activeCheckpointId : null,
    after: isObject(entry.after) && typeof entry.after.activeCheckpointId === 'string' ? entry.after.activeCheckpointId : null,
  })).filter((entry) => entry.lastMessageId >= 0);
  const memory = isObject(story.extras) && isObject(story.extras.memory) ? story.extras.memory : {};
  const epistemic = (Array.isArray(memory.epistemic) ? memory.epistemic.filter(isObject) : []).map((row) => ({
    tag: typeof row.tag === 'string' ? row.tag : '',
    messageId: isObject(row.provenance) && typeof row.provenance.messageId === 'number' ? row.provenance.messageId : typeof row.messageId === 'number' ? row.messageId : -1,
  }));
  const player = rows.find((row) => row.isUser && row.name)?.name ?? 'Player';
  return {
    session, storyTitle: typeof pinned.title === 'string' ? pinned.title : '', player, members, roles, checkpoints, log,
    startCheckpoint: start && typeof start.id === 'string' ? start.id : null, epistemic,
  };
}

async function runtimeFile(dir: string): Promise<string | null> {
  const names = (await readdir(dir)).filter((name) => /^runtime-.+\.json$/.test(name)).sort();
  return names.length ? join(dir, names.at(-1) as string) : null;
}

export async function selectRealSessions(root: string) {
  const kit = await loadWitreal();
  const chats = await readSessionChats(root) as Map<string, ChatRow[]>;
  const picked = kit.selectE0Sessions([...chats].map(([session, rows]) => ({ session, rows })));
  const sessions: Session[] = [];
  const dropped = { noSecret: 0, fewSpeakers: 0, noRuntime: 0 };
  for (const session of picked.kept) {
    const rows = chats.get(session) as ChatRow[];
    const members = kit.sessionMembers(rows);
    const file = await runtimeFile(join(root, session));
    if (!file) {
      dropped.noRuntime += 1;
      continue;
    }
    const context = contextFromRuntime(session, await readJson(file), rows, members);
    if (members.length < 3) {
      dropped.fewSpeakers += 1;
      continue;
    }
    if (!context.epistemic.some((row) => row.tag === 'hiding' || row.tag === 'unaware')) {
      dropped.noSecret += 1;
      continue;
    }
    sessions.push({ session, rows, context });
  }
  return { chats: chats.size, e0Kept: picked.kept.length, dropped, sessions };
}

export async function pooled<T>(items: readonly T[], width: number, run: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.max(1, width) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item);
  }));
}

export async function askEach<T extends { key: string }>({ items, dir, prompt, ask, out, width, log, record }: {
  items: T[]; dir: string; out: string; width: number; prompt: (item: T) => string; ask: Asker; log: (line: string) => void;
  record: (item: T, reply: ModelReply, promptSha256: string) => Record<string, unknown>;
}) {
  await mkdir(dir, { recursive: true });
  let asked = 0;
  await pooled(items, width, async (item) => {
    const file = join(dir, fileOf(item.key));
    if (existsSync(file)) return;
    const text = prompt(item);
    const reply = await ask(text, out);
    await writeJson(file, { key: item.key, at: new Date().toISOString(), model: reply.model, ...record(item, reply, sha256(text)), raw: reply.text });
    asked += 1;
    log(`${dir.split(/[\\/]/).at(-1)} ${item.key}: done`);
  });
  return { items: items.length, asked };
}

export async function readDir<T>(dir: string): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (!existsSync(dir)) return out;
  for (const name of (await readdir(dir)).filter((entry) => entry.endsWith('.json')).sort()) {
    const value = await readJson<{ key: string } & T>(join(dir, name));
    out.set(value.key, value);
  }
  return out;
}
