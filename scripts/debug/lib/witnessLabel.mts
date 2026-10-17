import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { askClaude, askSol, type ModelReply } from './e0LabelRun.mts';
import { askEach, fileOf, jsonHash, loadWitreal, readDir, readJson, selectRealSessions, writeJson, type Asker, type ChatRow } from './witreal.mts';

type Draft = { messageId: number; present: string[]; heard: string[] | 'unknown'; spans?: Array<{ from: string; heard: string[] | 'unknown' }> };
type Problems = Array<{ messageId: number | null; reason: string }>;
type LabelSet = { format: string; set: string; synthetic: boolean; members: string[]; labels: unknown[] };
type Score = Record<string, unknown> & { verdict: string };
type LabRow = { index: number; scene: string; speaker: string; text: string; heard: string[]; presence: string[] };

interface WitnessLabelKit {
  WITNESS_LABEL_RULES: { window: number; writer: string; checker: string; labWriter: string };
  sessionMembers(rows: ChatRow[]): string[];
  witnessWindow(rows: ChatRow[]): number[];
  witnessLabelPrompt(rows: ChatRow[], members: string[], window: number[], scenes?: Map<number, string>): string;
  readWitnessDrafts(raw: Record<string, unknown> | null, members: string[]): { drafts: Draft[]; problems: Problems };
  e0JsonObject(text: string): Record<string, unknown> | null;
  mergeWitnessSession(session: { session: string; rows: ChatRow[]; members: string[]; window: number[]; written: Draft[] | null; checked: Draft[] | null }, writer: string, checker: string, comparePresent?: boolean): { set: LabelSet; counts: Record<string, number>; invalid: Array<{ id: string; reason: string }> };
  labWitnessSession(rows: LabRow[], members: string[]): { session: { session: string; rows: ChatRow[]; members: string[]; window: number[] }; written: Draft[]; scenes: Map<number, string> };
  scoreWitness(set: LabelSet, predict: unknown): Score;
  presencePredict(set: LabelSet): unknown;
  combineWitnessScores(set: string, scores: Score[]): Score;
  adjudicationOrder(key: string, first: Draft, second: Draft): [Draft, Draft];
  adjudicationPrompt(rows: ChatRow[], members: string[], window: number[], items: Array<{ messageId: number; a: Draft; b: Draft }>, scenes?: Map<number, string>): string;
  readAdjudication(raw: Record<string, unknown> | null, members: string[]): Map<number, Draft | 'undecided'>;
  applyAdjudication(set: LabelSet, rows: ChatRow[], verdicts: Map<number, Draft | 'undecided'>, adjudicator: string, structuralPresence?: Map<number, string[]>): { set: LabelSet; counts: Record<string, number> };
}

const kit = async () => (await loadWitreal()) as unknown as WitnessLabelKit;

type Item = { key: string; rows: ChatRow[]; members: string[]; window: number[] };

async function realItems(root: string): Promise<Item[]> {
  const witness = await kit();
  const { sessions } = await selectRealSessions(root);
  return sessions.map(({ session, rows, context }) => ({ key: session, rows, members: context.members, window: witness.witnessWindow(rows) }));
}

const drafting = (witness: WitnessLabelKit) => (item: Item, reply: ModelReply, promptSha256: string) => {
  const { drafts, problems } = witness.readWitnessDrafts(witness.e0JsonObject(reply.text), item.members);
  return { session: item.key, members: item.members, window: item.window, promptSha256, drafts, problems };
};

export async function writeWitnessLabels({ root, out, width = 3, ask = askSol as Asker, log = console.log }: { root: string; out: string; width?: number; ask?: Asker; log?: (line: string) => void }) {
  const witness = await kit();
  const items = await realItems(root);
  return askEach({ items, dir: join(out, 'written'), out, width, ask, log, prompt: (item) => witness.witnessLabelPrompt(item.rows, item.members, item.window), record: drafting(witness) });
}

export async function checkWitnessLabels({ root, out, width = 3, ask = askClaude as Asker, log = console.log }: { root: string; out: string; width?: number; ask?: Asker; log?: (line: string) => void }) {
  const witness = await kit();
  const written = await readDir<unknown>(join(out, 'written'));
  const items = (await realItems(root)).filter((item) => written.has(item.key));
  return askEach({ items, dir: join(out, 'checked'), out, width, ask, log, prompt: (item) => witness.witnessLabelPrompt(item.rows, item.members, item.window), record: drafting(witness) });
}

const sumCounts = (all: Array<Record<string, number>>) => all.reduce<Record<string, number>>((total, counts) => {
  Object.entries(counts).forEach(([key, value]) => { total[key] = (total[key] ?? 0) + value; });
  return total;
}, {});

export async function mergeWitnessLabels({ root, out }: { root: string; out: string }) {
  const witness = await kit();
  const written = await readDir<{ drafts: Draft[]; model: string | null; problems: Problems }>(join(out, 'written'));
  const checked = await readDir<{ drafts: Draft[]; model: string | null; problems: Problems }>(join(out, 'checked'));
  const dir = join(out, 'labels');
  await mkdir(dir, { recursive: true });
  const reports: Array<Record<string, number>> = [];
  const invalid: string[] = [];
  const models = { writers: new Set<string>(), checkers: new Set<string>() };
  for (const item of await realItems(root)) {
    const write = written.get(item.key);
    if (!write) continue;
    const check = checked.get(item.key);
    if (write.model) models.writers.add(write.model);
    if (check?.model) models.checkers.add(check.model);
    const merged = witness.mergeWitnessSession({ session: item.key, rows: item.rows, members: item.members, window: item.window, written: write.drafts, checked: check?.drafts ?? null },
      witness.WITNESS_LABEL_RULES.writer, witness.WITNESS_LABEL_RULES.checker);
    await writeJson(join(dir, fileOf(item.key)), merged.set);
    reports.push(merged.counts);
    invalid.push(...merged.invalid.map((entry) => entry.reason));
  }
  const report = { sessions: reports.length, counts: sumCounts(reports), invalidReasons: invalid, models: { writers: [...models.writers].sort(), checkers: [...models.checkers].sort() } };
  await writeJson(join(out, 'labels-report.json'), report);
  return report;
}

export async function labWitness({ source, out, ask = askClaude as Asker, log = console.log }: { source: string; out: string; ask?: Asker; log?: (line: string) => void }) {
  const witness = await kit();
  const raw = await readJson<{ members: string[]; rows: LabRow[] }>(source);
  const lab = witness.labWitnessSession(raw.rows, raw.members);
  const dir = join(out, 'lab');
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, 'written.json'), { writer: witness.WITNESS_LABEL_RULES.labWriter, drafts: lab.written });
  const item = { key: lab.session.session, rows: lab.session.rows, members: lab.session.members, window: lab.session.window };
  await askEach({ items: [item], dir: join(dir, 'checked'), out, width: 1, ask, log, prompt: (entry) => witness.witnessLabelPrompt(entry.rows, entry.members, entry.window, lab.scenes), record: drafting(witness) });
  const check = (await readDir<{ drafts: Draft[]; model: string | null }>(join(dir, 'checked'))).get(item.key);
  const merged = witness.mergeWitnessSession({ ...lab.session, written: lab.written, checked: check?.drafts ?? null }, witness.WITNESS_LABEL_RULES.labWriter, witness.WITNESS_LABEL_RULES.checker, false);
  await writeJson(join(dir, 'labels.json'), merged.set);
  const report = { counts: merged.counts, invalidReasons: merged.invalid.map((entry) => entry.reason), checker: check?.model ?? null };
  await writeJson(join(dir, 'labels-report.json'), report);
  return report;
}

async function labelFiles(out: string, adjudicated = false): Promise<string[]> {
  const base = adjudicated ? join(out, 'adjudicated') : out;
  const dir = join(base, 'labels');
  const real = existsSync(dir) ? (await readdir(dir)).filter((name) => name.endsWith('.json')).sort().map((name) => join(dir, name)) : [];
  const lab = adjudicated ? join(base, 'lab.json') : join(out, 'lab', 'labels.json');
  return [...real, ...(existsSync(lab) ? [lab] : [])];
}

export async function freezeWitnessLabels(out: string, adjudicated = false) {
  const files = await labelFiles(out, adjudicated);
  const hashes: Record<string, string> = {};
  for (const file of files) hashes[file.slice(out.length + 1).replace(/\\/g, '/')] = await jsonHash(file);
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
  return { format: 'so-witness-label-freeze/1', files: Object.keys(hashes).length, digest, hashes };
}

export async function checkWitnessFreeze(out: string, freezeFile: string, adjudicated = false): Promise<string | null> {
  const record = await readJson<{ digest: string }>(freezeFile);
  const now = await freezeWitnessLabels(out, adjudicated);
  return record.digest === now.digest ? null : 'refused: the label files differ from the frozen digest';
}

export async function presenceControl(out: string, adjudicated = false) {
  const witness = await kit();
  const files = await labelFiles(out, adjudicated);
  const realScores: Score[] = [];
  let lab: Score | null = null;
  for (const file of files) {
    const set = await readJson<LabelSet>(file);
    const score = witness.scoreWitness(set, witness.presencePredict(set));
    if (file.endsWith(join('lab', 'labels.json')) || file.endsWith(join('adjudicated', 'lab.json'))) lab = score;
    else realScores.push(score);
  }
  return { real: witness.combineWitnessScores('real-sessions', realScores), lab };
}

export const ASTRA_MODEL = 'gpt-6-astra';
export const ADJUDICATOR = `codex:${ASTRA_MODEL}`;

export const askAstra: Asker = async (prompt, workDir) => {
  const { spawnExec } = await import('./e0LabelRun.mts');
  const { mkdtemp, readFile: read, writeFile: write } = await import('node:fs/promises');
  const dir = await mkdtemp(join(workDir, 'astra-'));
  await write(join(dir, 'prompt.txt'), prompt, 'utf-8');
  const last = join(dir, 'answer.txt');
  const run = await spawnExec('sh', ['-c', `codex exec -m ${ASTRA_MODEL} -s read-only --skip-git-repo-check --ephemeral -C "$1" -o "$2" "$3" </dev/null`, 'astra', dir, last,
    'Read the file prompt.txt in the current directory and follow its instructions exactly. Reply with only the JSON object it asks for.'], '', {}, dir);
  const text = existsSync(last) ? await read(last, 'utf-8') : '';
  if (run.code !== 0 || !text.trim()) throw new Error(`codex exec ${ASTRA_MODEL} failed (exit ${run.code}): ${run.stderr.slice(-400)}`);
  return { text, model: ASTRA_MODEL };
};

type Stored = { drafts: Draft[]; model: string | null };

export async function adjudicateWitness({ root, out, ask = askAstra, width = 2, log = console.log }: { root: string; out: string; ask?: Asker; width?: number; log?: (line: string) => void }) {
  const witness = await kit();
  const base = join(out, 'adjudicated');
  await mkdir(join(base, 'labels'), { recursive: true });
  const written = await readDir<Stored>(join(out, 'written'));
  const checked = await readDir<Stored>(join(out, 'checked'));
  type Job = Item & { set: LabelSet; items: Array<{ messageId: number; a: Draft; b: Draft }>; scenes?: Map<number, string>; presence?: Map<number, string[]>; file: string };
  const jobs: Job[] = [];
  const disputed = (set: LabelSet, write: Draft[], check: Draft[], key: string) => set.labels
    .filter((label) => (label as { review?: { agreed?: boolean } }).review?.agreed === false)
    .map((label) => {
      const id = (label as { messageId: number }).messageId;
      const [a, b] = witness.adjudicationOrder(`${key}#${id}`, write.find((draft) => draft.messageId === id) as Draft, check.find((draft) => draft.messageId === id) as Draft);
      return { messageId: id, a, b };
    });
  for (const item of await realItems(root)) {
    const file = join(out, 'labels', fileOf(item.key));
    if (!existsSync(file)) continue;
    const set = await readJson<LabelSet>(file);
    jobs.push({ ...item, set, file: join(base, 'labels', fileOf(item.key)), items: disputed(set, written.get(item.key)?.drafts ?? [], checked.get(item.key)?.drafts ?? [], item.key) });
  }
  const labFile = join(out, 'lab', 'labels.json');
  if (existsSync(labFile)) {
    const raw = await readJson<{ members: string[]; rows: LabRow[] }>(join(out, 'lab-rows.json'));
    const lab = witness.labWitnessSession(raw.rows, raw.members);
    const set = await readJson<LabelSet>(labFile);
    const labCheck = (await readDir<Stored>(join(out, 'lab', 'checked'))).get(lab.session.session);
    jobs.push({ key: lab.session.session, rows: lab.session.rows, members: lab.session.members, window: lab.session.window, set, scenes: lab.scenes,
      presence: new Map(raw.rows.map((row) => [row.index, row.presence])), file: join(base, 'lab.json'), items: disputed(set, lab.written, labCheck?.drafts ?? [], lab.session.session) });
  }
  const todo = jobs.filter((job) => job.items.length);
  await askEach({ items: todo, dir: join(base, 'raw'), out, width, ask, log, prompt: (job) => witness.adjudicationPrompt(job.rows, job.members, job.window, job.items, job.scenes),
    record: (job, reply, promptSha256) => ({ session: job.key, promptSha256, disputed: job.items.map((entry) => entry.messageId) }) });
  const raw = await readDir<{ raw: string; model: string | null }>(join(base, 'raw'));
  const totals: Record<string, number> = {};
  for (const job of jobs) {
    const answer = raw.get(job.key);
    const verdicts = answer ? witness.readAdjudication(witness.e0JsonObject(answer.raw), job.members) : new Map<number, Draft | 'undecided'>();
    const applied = witness.applyAdjudication(job.set, job.rows, verdicts, ADJUDICATOR, job.presence);
    await writeJson(job.file, applied.set);
    for (const [name, value] of Object.entries(applied.counts)) totals[`${job.presence ? 'lab' : 'real'}.${name}`] = (totals[`${job.presence ? 'lab' : 'real'}.${name}`] ?? 0) + value;
  }
  const report = { adjudicator: ADJUDICATOR, sessions: todo.length, totals };
  await writeJson(join(base, 'report.json'), report);
  return report;
}
