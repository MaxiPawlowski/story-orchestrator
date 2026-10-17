import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chatFile, loadE0 } from './e0.mts';
import { askClaude, askSol, type ModelReply } from './e0LabelRun.mts';

type ChatRow = { id: number; name: string; isUser: boolean; isSystem?: boolean; text: string };
type Written = { askMessageId: number; asker: string; text: string; gold: number[] };
type Check = { answerable: boolean; ids: number[] };
type Draft = { id: string; session: string; written: Written; check: Check | null };

interface LabelKit {
  E0_LABEL_RULES: { perSession: number; minMessages: number };
  readE0Chat(raw: unknown): ChatRow[];
  selectE0Sessions(chats: Array<{ session: string; rows: ChatRow[] }>, minMessages?: number): { kept: string[]; short: string[]; duplicate: string[] };
  e0WriterPrompt(rows: ChatRow[], per?: number): string;
  e0CheckerPrompt(rows: ChatRow[], questions: Array<{ key: string; written: Written }>): string;
  e0JsonObject(text: string): Record<string, unknown> | null;
  readE0Written(raw: Record<string, unknown> | null): Written[];
  readE0Check(raw: Record<string, unknown> | null): Check | null;
  mergeE0Labels(drafts: Draft[], chats: Map<string, ChatRow[]>, writer: string, checker: string): { labels: unknown; counts: Record<string, number>; invalid: Array<{ id: string; reason: string }> };
}

export type Asker = (prompt: string, workDir: string) => Promise<ModelReply>;

const kit = async () => (await loadE0()) as unknown as LabelKit;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const fileOf = (session: string) => `${session.replace(/[\\/]/g, '__')}.json`;
const writeJson = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');

export async function readSessionChats(root: string): Promise<Map<string, ChatRow[]>> {
  const e0 = await kit();
  const chats = new Map<string, ChatRow[]>();
  for (const tier of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^T\d+$/.test(entry.name)).map((entry) => entry.name).sort()) {
    for (const run of (await readdir(join(root, tier), { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith(`${tier}-`)).map((entry) => entry.name).sort()) {
      const dir = join(root, tier, run);
      const names = await readdir(dir);
      if (!names.some((name) => /^chat-.+\.json$/.test(name))) continue;
      chats.set(`${tier}/${run}`, e0.readE0Chat(JSON.parse(await readFile(await chatFile(dir), 'utf-8'))));
    }
  }
  return chats;
}

export async function selectSessions(root: string) {
  const e0 = await kit();
  const chats = await readSessionChats(root);
  return { chats, picked: e0.selectE0Sessions([...chats].map(([session, rows]) => ({ session, rows }))) };
}

async function pooled<T>(items: readonly T[], width: number, run: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.max(1, width) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item);
  }));
}

export async function writeLabels({ root, out, sessions, per, width = 3, ask = askSol, log = console.log }: { root: string; out: string; sessions: string[]; per?: number; width?: number; ask?: Asker; log?: (line: string) => void }) {
  const e0 = await kit();
  const chats = await readSessionChats(root);
  const dir = join(out, 'written');
  await mkdir(dir, { recursive: true });
  let wrote = 0;
  await pooled(sessions, width, async (session) => {
    const file = join(dir, fileOf(session));
    if (existsSync(file)) return;
    const rows = chats.get(session);
    if (!rows) throw new Error(`no chat for ${session}`);
    const prompt = e0.e0WriterPrompt(rows, per ?? e0.E0_LABEL_RULES.perSession);
    const reply = await ask(prompt, out);
    const questions = e0.readE0Written(e0.e0JsonObject(reply.text));
    await writeJson(file, { session, writer: reply.model, promptSha256: sha256(prompt), at: new Date().toISOString(), questions, raw: reply.text });
    wrote += 1;
    log(`written ${session}: ${questions.length} question(s)`);
  });
  return { sessions: sessions.length, wrote };
}

export async function checkLabels({ root, out, width = 3, ask = askClaude, log = console.log }: { root: string; out: string; width?: number; ask?: Asker; log?: (line: string) => void }) {
  const e0 = await kit();
  const chats = await readSessionChats(root);
  const writtenDir = join(out, 'written');
  const dir = join(out, 'checked');
  await mkdir(dir, { recursive: true });
  const files = (await readdir(writtenDir)).filter((name) => name.endsWith('.json')).sort();
  let checked = 0;
  await pooled(files, width, async (name) => {
    const file = join(dir, name);
    if (existsSync(file)) return;
    const written = JSON.parse(await readFile(join(writtenDir, name), 'utf-8')) as { session: string; questions: Written[] };
    const rows = chats.get(written.session);
    if (!rows || !written.questions.length) return;
    const questions = written.questions.map((entry, index) => ({ key: `q${index + 1}`, written: entry }));
    const reply = await ask(e0.e0CheckerPrompt(rows, questions), out);
    const parsed = e0.e0JsonObject(reply.text);
    const answers = parsed && typeof parsed.answers === 'object' && parsed.answers ? parsed.answers as Record<string, Record<string, unknown>> : {};
    const checks = Object.fromEntries(questions.map(({ key }) => [key, e0.readE0Check(answers[key] ?? null)]));
    await writeJson(file, { session: written.session, checker: reply.model, at: new Date().toISOString(), checks, raw: reply.text });
    checked += 1;
    log(`checked ${written.session}: ${Object.values(checks).filter(Boolean).length} of ${questions.length} answered`);
  });
  return { files: files.length, checked };
}

export async function mergeLabels({ root, out, writer, checker }: { root: string; out: string; writer: string; checker: string }) {
  const e0 = await kit();
  const chats = await readSessionChats(root);
  const drafts: Draft[] = [];
  const checkers = new Set<string>();
  const writers = new Set<string>();
  for (const name of (await readdir(join(out, 'written'))).filter((entry) => entry.endsWith('.json')).sort()) {
    const written = JSON.parse(await readFile(join(out, 'written', name), 'utf-8')) as { session: string; writer: string | null; questions: Written[] };
    const checkedFile = join(out, 'checked', name);
    const checked = existsSync(checkedFile) ? JSON.parse(await readFile(checkedFile, 'utf-8')) as { checker: string | null; checks: Record<string, Check | null> } : null;
    if (written.writer) writers.add(written.writer);
    if (checked?.checker) checkers.add(checked.checker);
    written.questions.forEach((entry, index) => drafts.push({ id: `${written.session}#${index + 1}`, session: written.session, written: entry, check: checked?.checks[`q${index + 1}`] ?? null }));
  }
  const merged = e0.mergeE0Labels(drafts, chats, writer, checker);
  return { ...merged, models: { writers: [...writers].sort(), checkers: [...checkers].sort() } };
}
