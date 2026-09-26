import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = 'so-legacy-books';

const USAGE = `Usage: node scripts/debug/${TOOL}.mts <command> [...]

v2.5 plan 11 step 9 (the plan's One-time data actions section). Nothing is deleted:
every move is one same-volume rename, and a cross-volume rename aborts.

  plan --root <data-user-dir>                          list the D1 candidate books with sha256[:12] (read-only)
  move --root <dir> --dest <dir> [--port 8000] [--declared <json>]
                                                       D1: move the candidates into <dest>/worlds, write <dest>/manifest.json
  verify --root <dir> --dest <dir>                     worlds/ equals the pre-move listing minus exactly the manifest set
  restore-check --dest <dir>                           copy every backup file to a temp dir, match each sha256 to the manifest
  move-dir --src <dir> --dst <dir> [--port <n>]        D2: rename one directory, tree hash before and after`;

export const PREFIX = 'Story Orchestrator - ';
export const OWNER_COMMENT = 'so-owner';
export const CURRENT_BLOB_VERSION = 5;
export const DEFAULT_DECLARED = join(dirname(fileURLToPath(import.meta.url)), 'legacy-books.plan11.json');
const CHAT_ID_TAIL = / - ((?:[^/\\]+ - )?\d{4}-\d{1,2}-\d{1,2}@\d{1,2}h\d{1,2}m\d{1,2}s(?:\d+ms)?)$/;

export interface Candidate { file: string; sha12: string; bytes: number; kind: 'fixed' | 'per-chat'; chatId: string | null; chatVersions: (number | null)[] }
export interface Excluded { file: string; reason: string }
export interface Declared { file: string; sha12: string }
export interface ManifestEntry { src: string; dst: string; bytes: number; sha256: string }
export interface Manifest {
  tool: typeof TOOL; action: 'D1'; commit: string; time: string; root: string; dest: string;
  preMoveListing: string[]; files: ManifestEntry[]; moved: number; complete: boolean; error?: string;
}
export type PortProbe = (port: number) => Promise<boolean>;
export interface MoveOptions { root: string; dest: string; declared: Declared[]; port: number; probe?: PortProbe; commit?: string; now?: () => Date; renameFn?: typeof rename }

export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export async function probePort(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

const readSelected = async (root: string): Promise<Set<string>> => {
  const path = join(root, 'settings.json');
  if (!existsSync(path)) throw new Error(`no settings.json under ${root}: cannot tell which books are selected`);
  const settings = JSON.parse(await readFile(path, 'utf8'));
  const worldInfo = settings?.world_info_settings?.world_info ?? {};
  const global: string[] = Array.isArray(worldInfo.globalSelect) ? worldInfo.globalSelect : [];
  const charLore: string[] = Array.isArray(worldInfo.charLore) ? worldInfo.charLore.flatMap((row: { extraBooks?: string[] }) => row?.extraBooks ?? []) : [];
  return new Set([...global, ...charLore]);
};

const walkFiles = async (dir: string, keep: (name: string) => boolean): Promise<string[]> => {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(path, keep);
    return entry.isFile() && keep(entry.name) ? [path] : [];
  }));
  return nested.flat();
};

const firstLine = async (path: string): Promise<string> => {
  const text = await readFile(path, 'utf8');
  const end = text.indexOf('\n');
  return end < 0 ? text : text.slice(0, end);
};

export async function readChatVersions(root: string): Promise<Map<string, (number | null)[]>> {
  const files = [
    ...await walkFiles(join(root, 'chats'), (name) => name.endsWith('.jsonl')),
    ...await walkFiles(join(root, 'group chats'), (name) => name.endsWith('.jsonl')),
  ];
  const versions = new Map<string, (number | null)[]>();
  for (const file of files) {
    let version: number | null = null;
    try {
      const head = JSON.parse(await firstLine(file));
      const value = head?.chat_metadata?.story_orchestrator?.version;
      version = typeof value === 'number' ? value : null;
    } catch {
      version = null;
    }
    const id = basename(file, '.jsonl');
    versions.set(id, [...(versions.get(id) ?? []), version]);
  }
  return versions;
}

export const chatIdSuffix = (name: string, chatIds: Iterable<string>): string | null => {
  const matches = [...chatIds].filter((id) => name.endsWith(` - ${id}`) && name.length > PREFIX.length + id.length + 3);
  if (matches.length) return matches.sort((a, b) => b.length - a.length)[0];
  return CHAT_ID_TAIL.exec(name)?.[1] ?? null;
};

const listWorlds = async (root: string): Promise<string[]> =>
  (await readdir(join(root, 'worlds'), { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();

export async function planCandidates(root: string): Promise<{ candidates: Candidate[]; excluded: Excluded[] }> {
  const selected = await readSelected(root);
  const chats = await readChatVersions(root);
  const candidates: Candidate[] = [];
  const excluded: Excluded[] = [];
  for (const file of await listWorlds(root)) {
    if (!file.endsWith('.json') || !file.startsWith(PREFIX)) continue;
    const name = file.slice(0, -'.json'.length);
    const bytes = await readFile(join(root, 'worlds', file));
    let book: { entries?: Record<string, { comment?: string }> };
    try {
      book = JSON.parse(bytes.toString('utf8'));
    } catch {
      excluded.push({ file, reason: 'unparseable' });
      continue;
    }
    if (Object.values(book?.entries ?? {}).some((entry) => entry?.comment === OWNER_COMMENT)) { excluded.push({ file, reason: 'so-owner marker' }); continue; }
    if (selected.has(name)) { excluded.push({ file, reason: 'selected (globalSelect or charLore)' }); continue; }
    const chatId = chatIdSuffix(name, chats.keys());
    const chatVersions = chatId ? chats.get(chatId) ?? [] : [];
    if (chatId && chatVersions.includes(CURRENT_BLOB_VERSION)) { excluded.push({ file, reason: `chat ${chatId} holds a v${CURRENT_BLOB_VERSION} blob` }); continue; }
    candidates.push({ file, sha12: sha256(bytes).slice(0, 12), bytes: bytes.length, kind: chatId ? 'per-chat' : 'fixed', chatId, chatVersions });
  }
  return { candidates, excluded };
}

export const declaredMismatch = (candidates: Declared[], declared: Declared[]): string[] => {
  const key = (row: Declared) => `${row.file}\u0000${row.sha12}`;
  const have = new Set(candidates.map(key));
  const want = new Set(declared.map(key));
  const problems: string[] = [];
  for (const row of candidates) if (!want.has(key(row))) problems.push(`undeclared candidate: ${row.file} ${row.sha12}`);
  for (const row of declared) if (!have.has(key(row))) problems.push(`declared but not a candidate now: ${row.file} ${row.sha12}`);
  if (have.size !== candidates.length || want.size !== declared.length) problems.push('duplicate rows');
  return problems;
};

export const readDeclared = async (path: string): Promise<Declared[]> => (JSON.parse(await readFile(path, 'utf8')) as { books: Declared[] }).books;

const sameVolume = (a: string, b: string) => parse(resolve(a)).root.toLowerCase() === parse(resolve(b)).root.toLowerCase();

const gitCommit = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dirname(fileURLToPath(import.meta.url)), encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

export async function moveBooks(options: MoveOptions): Promise<Manifest> {
  const root = resolve(options.root);
  const dest = resolve(options.dest);
  const probe = options.probe ?? probePort;
  const renameFn = options.renameFn ?? rename;
  if (await probe(options.port)) throw new Error(`refused: http://127.0.0.1:${options.port} answers; stop SillyTavern first`);
  if (existsSync(dest)) throw new Error(`refused: destination root ${dest} already exists`);
  if (!sameVolume(root, dest)) throw new Error(`refused: ${root} and ${dest} are on different volumes; only a same-volume rename is allowed`);
  const { candidates } = await planCandidates(root);
  const mismatch = declaredMismatch(candidates, options.declared);
  if (mismatch.length) throw new Error(`refused: candidate set differs from the predeclared list:\n  ${mismatch.join('\n  ')}`);
  const preMoveListing = await listWorlds(root);
  const files: ManifestEntry[] = [];
  for (const row of candidates) {
    const src = join(root, 'worlds', row.file);
    const bytes = await readFile(src);
    const hash = sha256(bytes);
    if (hash.slice(0, 12) !== row.sha12) throw new Error(`refused: ${row.file} changed since it was listed`);
    files.push({ src, dst: join(dest, 'worlds', row.file), bytes: bytes.length, sha256: hash });
  }
  const taken = files.filter((entry) => existsSync(entry.dst)).map((entry) => entry.dst);
  if (taken.length) throw new Error(`refused: destination exists: ${taken.join(', ')}`);
  await mkdir(dirname(dest), { recursive: true });
  await mkdir(dest);
  await mkdir(join(dest, 'worlds'));
  const manifest: Manifest = {
    tool: TOOL, action: 'D1', commit: options.commit ?? gitCommit(), time: (options.now ?? (() => new Date()))().toISOString(),
    root, dest, preMoveListing, files, moved: 0, complete: false,
  };
  const manifestPath = join(dest, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  try {
    for (const entry of files) {
      if (existsSync(entry.dst)) throw new Error(`destination appeared mid-run: ${entry.dst}`);
      await renameFn(entry.src, entry.dst);
      manifest.moved += 1;
    }
    manifest.complete = true;
  } catch (error) {
    manifest.error = error instanceof Error ? `${(error as NodeJS.ErrnoException).code ?? ''} ${error.message}`.trim() : String(error);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  if (!manifest.complete) throw new Error(`aborted after ${manifest.moved} of ${files.length} renames: ${manifest.error}`);
  return manifest;
}

export const readManifest = async (dest: string): Promise<Manifest> => JSON.parse(await readFile(join(resolve(dest), 'manifest.json'), 'utf8'));

export async function verifyMove(root: string, dest: string) {
  const manifest = await readManifest(dest);
  const moved = new Set(manifest.files.map((entry) => basename(entry.src)));
  const expected = manifest.preMoveListing.filter((name) => !moved.has(name));
  const actual = await listWorlds(root);
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  const backups: string[] = [];
  for (const entry of manifest.files) {
    if (!existsSync(entry.dst)) { backups.push(`missing backup: ${entry.dst}`); continue; }
    const bytes = await readFile(entry.dst);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) backups.push(`backup differs: ${entry.dst}`);
  }
  const ok = manifest.complete && missing.length === 0 && extra.length === 0 && backups.length === 0;
  return { ok, complete: manifest.complete, preMove: manifest.preMoveListing.length, manifest: manifest.files.length, now: actual.length, missing, extra, backups };
}

export async function restoreCheck(dest: string, tempRoot = tmpdir()) {
  const manifest = await readManifest(dest);
  const temp = await mkdtemp(join(tempRoot, `${TOOL}-restore-`));
  const mismatched: string[] = [];
  let matched = 0;
  for (const entry of manifest.files) {
    const copy = join(temp, basename(entry.dst));
    try {
      await copyFile(entry.dst, copy);
      const bytes = await readFile(copy);
      if (bytes.length === entry.bytes && sha256(bytes) === entry.sha256) matched += 1;
      else mismatched.push(basename(entry.dst));
    } catch (error) {
      mismatched.push(`${basename(entry.dst)} (${error instanceof Error ? error.message : error})`);
    }
  }
  return { ok: mismatched.length === 0 && matched === manifest.files.length, matched, total: manifest.files.length, mismatched, temp };
}

export async function treeHash(dir: string): Promise<{ sha256: string; files: number; bytes: number }> {
  const rows: string[] = [];
  let bytes = 0;
  const visit = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const rel = relative(dir, path).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) rows.push(`${rel}\tlink:${await readlink(path)}`);
      else if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const content = await readFile(path);
        bytes += content.length;
        rows.push(`${rel}\t${sha256(content)}`);
      }
    }
  };
  await visit(dir);
  rows.sort();
  return { sha256: sha256(rows.join('\n')), files: rows.length, bytes };
}

export interface MoveDirOptions { src: string; dst: string; port?: number | null; probe?: PortProbe; commit?: string; now?: () => Date; renameFn?: typeof rename }

export async function moveDir(options: MoveDirOptions) {
  const src = resolve(options.src);
  const dst = resolve(options.dst);
  const probe = options.probe ?? probePort;
  const renameFn = options.renameFn ?? rename;
  const manifestPath = `${dst}.manifest.json`;
  if (options.port != null && await probe(options.port)) throw new Error(`refused: http://127.0.0.1:${options.port} answers; stop the server first`);
  if (!existsSync(src) || !(await lstat(src)).isDirectory()) throw new Error(`refused: ${src} is not a directory`);
  if (existsSync(dst)) throw new Error(`refused: destination ${dst} already exists`);
  if (existsSync(manifestPath)) throw new Error(`refused: ${manifestPath} already exists`);
  if (!sameVolume(src, dst)) throw new Error(`refused: ${src} and ${dst} are on different volumes; only a same-volume rename is allowed`);
  const before = await treeHash(src);
  await mkdir(dirname(dst), { recursive: true });
  const record = {
    tool: TOOL, action: 'D2', commit: options.commit ?? gitCommit(), time: (options.now ?? (() => new Date()))().toISOString(),
    src, dst, before, after: null as null | { sha256: string; files: number; bytes: number }, match: false, error: undefined as string | undefined,
  };
  await writeFile(manifestPath, JSON.stringify(record, null, 2));
  try {
    await renameFn(src, dst);
  } catch (error) {
    record.error = error instanceof Error ? `${(error as NodeJS.ErrnoException).code ?? ''} ${error.message}`.trim() : String(error);
    await writeFile(manifestPath, JSON.stringify(record, null, 2));
    throw new Error(`aborted: rename failed, nothing moved: ${record.error}`);
  }
  record.after = await treeHash(dst);
  record.match = record.after.sha256 === before.sha256 && record.after.files === before.files && record.after.bytes === before.bytes;
  await writeFile(manifestPath, JSON.stringify(record, null, 2));
  return { ...record, manifest: manifestPath };
}

function argValue(args: string[], name: string, fallback: string | null = null) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const required = (args: string[], name: string) => {
  const value = argValue(args, name);
  if (!value) throw new Error(`${name} is required\n\n${USAGE}`);
  return value;
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  let out: unknown;
  let ok = true;
  if (!command || command === '--help') { console.log(USAGE); return; }
  if (command === 'plan') {
    const { candidates, excluded } = await planCandidates(required(rest, '--root'));
    const declared = await readDeclared(argValue(rest, '--declared', DEFAULT_DECLARED)!);
    const mismatch = declaredMismatch(candidates, declared);
    out = { count: candidates.length, matchesDeclared: mismatch.length === 0, mismatch, candidates, excluded };
  } else if (command === 'move') {
    const declared = await readDeclared(argValue(rest, '--declared', DEFAULT_DECLARED)!);
    out = await moveBooks({ root: required(rest, '--root'), dest: required(rest, '--dest'), declared, port: Number(argValue(rest, '--port', '8000')) });
  } else if (command === 'verify') {
    const result = await verifyMove(required(rest, '--root'), required(rest, '--dest'));
    ok = result.ok;
    out = result;
  } else if (command === 'restore-check') {
    const result = await restoreCheck(required(rest, '--dest'));
    ok = result.ok;
    out = result;
  } else if (command === 'move-dir') {
    const port = argValue(rest, '--port');
    const result = await moveDir({ src: required(rest, '--src'), dst: required(rest, '--dst'), port: port ? Number(port) : null });
    ok = result.match;
    out = result;
  } else { console.log(USAGE); process.exitCode = 2; return; }
  console.log(JSON.stringify(out, null, 2));
  if (!ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith(`${TOOL}.mts`)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
