import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const PRIVATE_DIR = join(REPO_ROOT, 'test', 'sessions', 'e0');
export const FREEZE_FORMAT = 'so-e0-freeze/1';

type Arm = 'a' | 'b' | 'c' | 'd' | 'e';
type Candidate = { messageId: number; textHash: string; stRank: number; bands: number[] };
type PoolQuestion = { id: string; gold: number[]; candidates: Candidate[] };
type Pool = { format: string; source: 'synthetic' | 'private'; provider: string; questions: PoolQuestion[]; refused: Array<{ id: string; reason: string }> };
type LabelRead = { source: 'synthetic' | 'private'; questions: Array<{ id: string; session: string }>; dropped: { disagreed: number; invalid: Array<{ id: string; reason: string }> } };
type ArmResult = { arm: Arm; label: string; metrics: Record<string, number | null> | null; owed: string | null; refused: Array<{ id: string; reason: string }> };

interface E0Module {
  E0_COST_ORDER: readonly Arm[];
  E0_FLOORS: Record<string, number>;
  readE0Labels(raw: unknown): LabelRead;
  readE0Chat(raw: unknown): unknown[];
  buildE0Pool(labels: LabelRead, chats: Map<string, unknown[]>, provider: unknown): Promise<Pool>;
  e0StubProvider: unknown;
  runArm(arm: Arm, questions: PoolQuestion[], recorded?: unknown): ArmResult;
  decideE0(results: ArmResult[]): Record<string, unknown>;
}

let loaded: Promise<E0Module> | null = null;

export function loadE0(): Promise<E0Module> {
  loaded ??= (async () => {
    const require = createRequire(import.meta.url);
    const built = await require('esbuild').build({
      entryPoints: [join(REPO_ROOT, 'scripts/debug/lib/e0Entry.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node22',
      tsconfig: join(REPO_ROOT, 'tsconfig.json'), write: false, logLevel: 'silent',
    });
    const dir = await mkdtemp(join(tmpdir(), 'so-e0-'));
    const file = join(dir, 'e0.mjs');
    await writeFile(file, built.outputFiles[0].text, 'utf-8');
    return import(pathToFileURL(file).href) as Promise<E0Module>;
  })();
  return loaded;
}

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const jsonHash = async (file: string) => sha256(JSON.stringify(await readJson(file)));

export function refusePublicPrivate(source: string, out: string): void {
  if (source !== 'private') return;
  const target = resolve(out);
  const inRepo = !relative(REPO_ROOT, target).startsWith('..');
  const inPrivate = target.startsWith(PRIVATE_DIR + sep);
  if (inRepo && !inPrivate) throw new Error(`refused: private E0 output inside the public repo (${out}); write under test/sessions/e0/ (gitignored, so-sessions) or outside the repo`);
}

async function chatFile(dir: string): Promise<string> {
  const names = (await readdir(dir)).sort();
  const full = names.filter((name) => /^chat-full-.+\.json$/.test(name));
  const plain = names.filter((name) => /^chat-.+\.json$/.test(name) && !name.startsWith('chat-full-'));
  const pick = full.at(-1) ?? plain.at(-1);
  if (!pick) throw new Error(`${dir}: no chat-*.json`);
  return join(dir, pick);
}

export async function buildPool(labelsFile: string, sessionsRoot: string, provider: string) {
  if (provider !== 'stub') throw new Error(`provider ${provider}: only "stub" runs here; the st-vectors pool (a lane's /api/vector, transformers) is owed`);
  const e0 = await loadE0();
  const labels = e0.readE0Labels(await readJson(labelsFile));
  const chats = new Map<string, unknown[]>();
  for (const session of new Set(labels.questions.map((question) => question.session))) {
    const dir = join(sessionsRoot, session);
    if (existsSync(dir)) chats.set(session, e0.readE0Chat(await readJson(await chatFile(dir))));
  }
  const pool = await e0.buildE0Pool(labels, chats, e0.e0StubProvider);
  return { labels, pool };
}

const questionHash = (question: PoolQuestion) => sha256(JSON.stringify([question.id, question.gold, question.candidates.map((candidate) => [candidate.messageId, candidate.textHash, candidate.stRank, candidate.bands])]));

export async function freeze(labelsFile: string, poolFile: string) {
  const pool = (await readJson(poolFile)) as Pool;
  return {
    format: FREEZE_FORMAT,
    source: pool.source,
    provider: pool.provider,
    labels: await jsonHash(labelsFile),
    pool: await jsonHash(poolFile),
    questions: pool.questions.length,
    perQuestion: Object.fromEntries(pool.questions.map((question) => [question.id, questionHash(question)])),
  };
}

export async function checkFrozen(freezeFile: string | undefined, labelsFile: string, poolFile: string): Promise<string | null> {
  if (!freezeFile) return 'refused: no freeze record (run `freeze` and commit it before any arm runs)';
  const record = await readJson(freezeFile);
  if (record.format !== FREEZE_FORMAT) return `refused: ${freezeFile} is not a ${FREEZE_FORMAT} record`;
  const now = await freeze(labelsFile, poolFile);
  if (record.labels !== now.labels) return 'refused: the labels file differs from the frozen hash';
  if (record.pool !== now.pool) return 'refused: the pool file differs from the frozen hash';
  return null;
}

export async function runE0(labelsFile: string, poolFile: string, choicesFile?: string) {
  const e0 = await loadE0();
  const labels = e0.readE0Labels(await readJson(labelsFile));
  const pool = (await readJson(poolFile)) as Pool;
  if (pool.source !== labels.source) throw new Error(`pool source ${pool.source} differs from labels source ${labels.source}`);
  const recorded = choicesFile ? await readJson(choicesFile) : undefined;
  const arms = e0.E0_COST_ORDER.map((arm) => e0.runArm(arm, pool.questions, arm === 'd' ? recorded : undefined));
  return {
    plan: 'v2.8 21 E0',
    source: pool.source,
    provider: pool.provider,
    floors: e0.E0_FLOORS,
    counts: {
      labels: labels.questions.length, droppedDisagreed: labels.dropped.disagreed, droppedInvalid: labels.dropped.invalid.length,
      pooled: pool.questions.length, poolRefused: pool.refused.length,
    },
    arms: arms.map(({ refused, ...arm }) => ({ ...arm, refused: refused.length })),
    verdict: e0.decideE0(arms),
  };
}
