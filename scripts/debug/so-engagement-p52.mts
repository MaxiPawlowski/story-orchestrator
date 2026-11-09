import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { loadEntry, refusePrivateOutput } from './lib/bundleEntry.mts';
import { DEFAULT_OPENCODE, DEFAULT_RATER_MODEL, opencodeRunner, refuseModel } from './lib/promptBatchRater.mts';
import { SESSIONS_GIT_DIR, workTreeOf } from '../lib/sessionsArchive.mjs';
import {
  agreement, candidates, excerpt, inputAt, LABEL_SYSTEM, labelPrompt, pairs, pick, pushedScore, RATE_SYSTEM, ratePrompt, readLabel, readRate, turnsOf, windowId,
  type ChatRow, type Label, type SessionBlob,
} from './lib/engagementP52.mts';

const USAGE = `Usage: node scripts/debug/so-engagement-p52.mts <command> [...]

v3.0 52 rows. Private output (chat text) under the so-sessions work tree, rating-pack/p52-engagement (--out <dir> to move it), never the public repo.

  windows [--sessions <dir>] [--count 40] [--per-session 2] [--seed p52]
          CPU. Quiet windows (3 player turns, no transition) from archived sessions; the classifier's reading per
          window is computed offline and sealed (readings.sealed.json); windows.jsonl holds the transcripts
  label   [--model ${DEFAULT_RATER_MODEL}] [--opencode <exe>]   Sol labels each window from the transcript only; resumes
  seal    writes labels.json; archive it (npm run sessions:archive) before score
  score   refuses unless labels.json is committed in so-sessions; agreement (floor 0.75) and the confusion counts
  pack    --on <run.json,...> --off <run.json,...> [--seed p52]   blind A/B pairs from v30-52-engagement runs
  rate    [--model ${DEFAULT_RATER_MODEL}]   Sol flags "pushed away from the scene" per reply; resumes
  unseal  [--from-turn 4]   pushed flags on vs off (floor: on <= 0.5 x off)`;

const argValue = (name: string) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] ?? null : null; };
const SESSIONS = resolve(workTreeOf(SESSIONS_GIT_DIR));
const OUT = resolve(argValue('--out') ?? join(SESSIONS, 'rating-pack', 'p52-engagement'));
const writeJson = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));

const toChat = (rows: any[]): ChatRow[] => rows.map((row, index) => ({ id: typeof row.id === 'number' ? row.id : index, name: String(row.name ?? ''), isUser: Boolean(row.isUser), isSystem: Boolean(row.isSystem), text: String(row.text ?? '') }));

function sessionFiles(root: string) {
  const out: Array<{ session: string; runtime: string; chat: string }> = [];
  for (const tier of readdirSync(root).filter((name) => /^T\d+$/.test(name))) {
    for (const dir of readdirSync(join(root, tier)).filter((name) => /^T\d+-/.test(name))) {
      const files = readdirSync(join(root, tier, dir));
      const stamps = files.filter((name) => /^runtime-.*\.json$/.test(name)).map((name) => name.slice('runtime-'.length, -'.json'.length)).sort();
      const stamp = stamps.reverse().find((value) => files.includes(`chat-full-${value}.json`));
      if (stamp) out.push({ session: `${tier}/${dir}`, runtime: join(root, tier, dir, `runtime-${stamp}.json`), chat: join(root, tier, dir, `chat-full-${stamp}.json`) });
    }
  }
  return out;
}

const blobOf = (runtime: any): SessionBlob | null => {
  const story = runtime?.stories?.[runtime.selectedStoryId] ?? Object.values(runtime?.stories ?? {})[0] as any;
  if (!story?.engineHistory?.log?.length) return null;
  const memory = story.extras?.memory ?? {};
  return { log: story.engineHistory.log, memory: [...(memory.entries ?? []), ...(memory.ledger ?? [])], tension: story.extras?.tension?.history ?? [], promises: story.extras?.promises?.rows ?? [] };
};

async function windows() {
  const root = argValue('--sessions') ?? SESSIONS;
  const count = Number(argValue('--count') ?? 40);
  const perSession = Number(argValue('--per-session') ?? 2);
  const seed = argValue('--seed') ?? 'p52';
  const { readEngagement } = await loadEntry<any>('src/pacing/engagement.ts');
  const loaded = new Map<string, { blob: SessionBlob; chat: ChatRow[] }>();
  const all = [];
  let sessions = 0;
  for (const files of sessionFiles(root)) {
    const blob = blobOf(await readJson(files.runtime));
    if (!blob) continue;
    const chat = toChat(await readJson(files.chat));
    sessions += 1;
    loaded.set(files.session, { blob, chat });
    all.push(...candidates(files.session, blob, chat));
  }
  const chosen = pick(all, count, perSession, seed);
  await mkdir(OUT, { recursive: true });
  const rows = chosen.map((row) => {
    const { blob, chat } = loaded.get(row.session)!;
    const reading = readEngagement(inputAt(blob, chat, row));
    return { id: windowId(row), session: row.session, end: row.end, transcript: excerpt(chat, row), reading: { kind: reading.kind, matched: reading.matched } };
  });
  await writeFile(join(OUT, 'windows.jsonl'), rows.map(({ reading, ...rest }) => JSON.stringify(rest)).join('\n') + '\n', 'utf-8');
  await writeJson(join(OUT, 'readings.sealed.json'), Object.fromEntries(rows.map((row) => [row.id, row.reading])));
  const manifest = { seed, sessions, candidates: all.length, windows: rows.length, perSession, sessionsUsed: new Set(rows.map((row) => row.session)).size };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  console.log(JSON.stringify(manifest));
}

const runner = (system: string) => {
  const model = argValue('--model') ?? DEFAULT_RATER_MODEL;
  refuseModel(model);
  return { model, make: async (dir: string) => { await writeFile(join(dir, 'system.md'), system, 'utf-8'); return opencodeRunner(argValue('--opencode') ?? DEFAULT_OPENCODE, model, dir, join(dir, 'system.md')); } };
};

async function askAll<T extends { id: string }>(items: T[], folder: string, system: string, prompt: (item: T) => string, read: (text: string) => any) {
  const { model, make } = runner(system);
  const dir = join(OUT, folder);
  await mkdir(dir, { recursive: true });
  const home = await mkdtemp(join(tmpdir(), 'so-p52-'));
  const run = await make(home);
  let done = 0;
  let failed = 0;
  try {
    for (const item of items) {
      const file = join(dir, `${item.id}.json`);
      if (existsSync(file)) { done += 1; continue; }
      let result: any = null;
      for (let attempt = 1; attempt <= 3 && !result; attempt += 1) {
        const promptFile = join(home, `${item.id}.md`);
        await writeFile(promptFile, prompt(item), 'utf-8');
        const answer = await run(promptFile);
        const parsed = read(answer.text);
        if (!('problem' in parsed)) result = { id: item.id, model, attempt, ...parsed };
        else console.error(`${item.id} attempt ${attempt}: ${parsed.problem} (exit ${answer.code}) ${answer.stderr.slice(-200)}`);
      }
      if (result) { await writeJson(file, result); done += 1; } else failed += 1;
      console.error(`${done}/${items.length}${failed ? ` (${failed} failed)` : ''}`);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ model, done, failed, total: items.length }));
}

const readJsonl = async (path: string) => (await readFile(path, 'utf-8')).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));

async function label() {
  const rows = await readJsonl(join(OUT, 'windows.jsonl'));
  await askAll(rows, 'labels', LABEL_SYSTEM, (row) => labelPrompt(row.transcript), readLabel);
}

async function seal() {
  const rows = await readJsonl(join(OUT, 'windows.jsonl'));
  const labels: Record<string, Label> = {};
  const models = new Set<string>();
  for (const row of rows) {
    const file = join(OUT, 'labels', `${row.id}.json`);
    if (!existsSync(file)) throw new Error(`window ${row.id} has no label yet`);
    const value = await readJson(file);
    labels[row.id] = value.label;
    models.add(value.model);
  }
  await writeJson(join(OUT, 'labels.json'), { models: [...models], labels });
  console.log(JSON.stringify({ labelled: Object.keys(labels).length, models: [...models] }));
}

const committed = (file: string) => {
  const work = SESSIONS;
  const rel = relative(work, file).replace(/\\/g, '/');
  const git = (args: string[]) => spawnSync('git', [`--git-dir=${SESSIONS_GIT_DIR}`, `--work-tree=${work}`, ...args], { cwd: work, encoding: 'utf8' });
  return git(['ls-files', '--error-unmatch', rel]).status === 0 && git(['diff', '--quiet', 'HEAD', '--', rel]).status === 0;
};

async function score() {
  const file = join(OUT, 'labels.json');
  if (!committed(file)) throw new Error('refused: labels.json is not committed in so-sessions (npm run sessions:archive first); labels are committed before scoring');
  const { labels } = await readJson(file);
  const readings = await readJson(join(OUT, 'readings.sealed.json'));
  const rows = Object.entries(labels as Record<string, Label>).map(([id, value]) => ({ label: value, kind: readings[id]?.kind ?? null }));
  const result = agreement(rows);
  const kinds: Record<string, number> = {};
  rows.forEach((row) => { kinds[row.kind ?? 'none'] = (kinds[row.kind ?? 'none'] ?? 0) + 1; });
  const labelsBy: Record<string, number> = {};
  rows.forEach((row) => { labelsBy[row.label] = (labelsBy[row.label] ?? 0) + 1; });
  const out = { ...result, classifier: kinds, labels: labelsBy };
  await writeJson(join(OUT, 'score.json'), out);
  console.log(JSON.stringify(out, null, 1));
}

async function pack() {
  const seed = argValue('--seed') ?? 'p52';
  const load = async (list: string | null) => Promise.all((list ?? '').split(',').filter(Boolean).map(async (path) => turnsOf(await readJson(path))));
  const on = await load(argValue('--on'));
  const off = await load(argValue('--off'));
  if (!on.length || on.length !== off.length) throw new Error('--on and --off need the same number of run records');
  if (on.flat().some((row) => row.arm !== true) || off.flat().some((row) => row.arm !== false)) throw new Error('refused: an --on record ran with pacing.engagement off, or an --off record with it on');
  const { pack: items, key } = pairs(on, off, seed);
  const dir = join(OUT, 'rating');
  refusePrivateOutput(false, dir, 'rating pack');
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, 'pack.json'), items);
  await writeJson(join(dir, 'key.sealed.json'), key);
  const readings = on.map((run) => run.map((row) => ({ turn: row.turn, kind: row.reading?.kind ?? null, rung: row.rungLead, info: row.infoLine })));
  const offGuidance = off.map((run) => run.map((row) => ({ turn: row.turn, kind: row.reading?.kind ?? null, rung: row.rungLead, info: row.infoLine })));
  await writeJson(join(dir, 'arms.json'), { on: readings, off: offGuidance });
  console.log(JSON.stringify({ pairs: items.length, runs: on.length }));
}

async function rate() {
  const items = await readJson(join(OUT, 'rating', 'pack.json'));
  await askAll(items, join('rating', 'rated'), RATE_SYSTEM, ratePrompt, readRate);
}

async function unseal() {
  const dir = join(OUT, 'rating');
  const key = await readJson(join(dir, 'key.sealed.json'));
  const items = await readJson(join(dir, 'pack.json'));
  const turnOf = Object.fromEntries(items.map((item: any) => [item.id, item.turn]));
  const rated: Record<string, { a: boolean; b: boolean }> = {};
  for (const item of items) {
    const file = join(dir, 'rated', `${item.id}.json`);
    if (existsSync(file)) rated[item.id] = await readJson(file);
  }
  const fromTurn = Number(argValue('--from-turn') ?? 4);
  const out = { all: pushedScore(key, rated, turnOf, 1), afterLadder: pushedScore(key, rated, turnOf, fromTurn), fromTurn, rated: Object.keys(rated).length, total: items.length };
  await writeJson(join(dir, 'score.json'), out);
  console.log(JSON.stringify(out, null, 1));
}

const commands: Record<string, () => Promise<void>> = { windows, label, seal, score, pack, rate, unseal };
const command = commands[process.argv[2] ?? ''];
if (!command) {
  console.log(USAGE);
  process.exit(process.argv[2] ? 2 : 0);
}
await command();
