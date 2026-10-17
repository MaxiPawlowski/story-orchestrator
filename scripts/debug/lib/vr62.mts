import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { askClaude, askSol } from './e0LabelRun.mts';
import { askEach, jsonHash, loadWitreal, readDir, readJson, selectRealSessions, writeJson, type Asker, type ChatRow, type Session, type SessionContext } from './witreal.mts';

type Written = { askMessageId: number; member: string; text: string; gold: number[]; witnessed: boolean };
type Check = { answerable: boolean; ids: number[]; memberWitnessed: boolean | null };
type Question = { id: string; session: string; askMessageId: number; member: string; kind: string; text: string; gold: number[]; nonce?: string };
type LabelRead = { source: string; questions: Question[]; dropped: { disagreed: number; invalid: number } };
type Candidate = { messageId: number; text: string; speaker: string };
type PoolQuestion = { id: string; session: string; query: string; candidates: Candidate[] };
type Pool = { source: string; provider: string; questions: PoolQuestion[]; refused: unknown[] };
type SceneRecord = { present: Record<string, number> | null; fallback: string | null; model: string | null; latencyMs: number; inputTokens: number; cached: boolean };
type JudgeAnswer = { answers: Record<string, unknown> | null; fallback?: string | null; model?: string | null; latencyMs: number; usage?: { input_tokens?: number }; cached?: boolean };
type Filter = unknown;

interface Vr62Kit {
  VR62_RULES: { positives: number; exclusions: number; topUpEach: number; writer: string; checker: string };
  VR62_SCENES_FORMAT: string;
  e0JsonObject(text: string): Record<string, unknown> | null;
  vr62WriterPrompt(rows: ChatRow[], members: string[], positives?: number, exclusions?: number): string;
  vr62CheckerPrompt(rows: ChatRow[], members: string[], questions: Array<{ key: string; written: Written }>): string;
  readVr62Written(raw: Record<string, unknown> | null): Written[];
  readVr62Check(raw: Record<string, unknown> | null): Check | null;
  mergeVr62Labels(drafts: Array<{ id: string; session: string; written: Written; check: Check | null }>, chats: Map<string, { rows: ChatRow[]; members: string[] }>, nonce: () => string): { labels: unknown; counts: Record<string, number>; invalid: Array<{ id: string; reason: string }> };
  readVr62Labels(raw: unknown): LabelRead;
  secretScenes(context: SessionContext, lastAsk: number): string[];
  vr62Minimums(questions: Question[], scenes: string[]): { counts: Record<string, number>; met: Record<string, boolean>; ok: boolean };
  buildVr62Pool(labels: LabelRead, chats: Map<string, ChatRow[]>, provider: unknown): Promise<Pool>;
  sceneKey(session: string, messageId: number): string;
  sceneRequestAt(context: SessionContext, rows: ChatRow[], messageId: number): unknown;
  sceneRecordFrom(context: SessionContext, rows: ChatRow[], messageId: number, answer: JudgeAnswer): SceneRecord;
  presenceFilter(scenes: Record<string, SceneRecord>): Filter;
  choiceQuestions(pool: Pool, filter: Filter): Array<{ id: string; query: string; candidates: Array<{ messageId: number; text: string }> }>;
  scoreVr62(labels: LabelRead, pool: Pool, scenes: Record<string, SceneRecord>, recorded: Record<string, unknown[]>, scenesOk: string[]): Record<string, unknown> & { verdict: { status: string } };
  E0_CHOICE_CALLS: number;
  E0_CHOICE_KEY: string;
  e0ChoiceRequest(query: string, remaining: Array<{ messageId: number; text: string }>): unknown;
  e0ChoicePick(choice: string | null | undefined): number | null;
}

const kit = async () => (await loadWitreal()) as unknown as Vr62Kit;

type Item = { key: string; session: Session };

const items = async (root: string): Promise<Item[]> => (await selectRealSessions(root)).sessions.map((session) => ({ key: session.session, session }));

export async function writeQuestions({ root, out, topUp = false, width = 3, ask = askSol as Asker, log = console.log }: { root: string; out: string; topUp?: boolean; width?: number; ask?: Asker; log?: (line: string) => void }) {
  const vr = await kit();
  const each = topUp ? vr.VR62_RULES.topUpEach : null;
  return askEach({
    items: await items(root), dir: join(out, topUp ? 'written-topup' : 'written'), out, width, ask, log,
    prompt: ({ session }) => vr.vr62WriterPrompt(session.rows, session.context.members, each ?? vr.VR62_RULES.positives, each ?? vr.VR62_RULES.exclusions),
    record: (item, reply, promptSha256) => ({ session: item.key, promptSha256, questions: vr.readVr62Written(vr.e0JsonObject(reply.text)) }),
  });
}

export async function checkQuestions({ root, out, width = 3, ask = askClaude as Asker, log = console.log }: { root: string; out: string; width?: number; ask?: Asker; log?: (line: string) => void }) {
  const vr = await kit();
  const all = await items(root);
  const results = [];
  for (const pass of ['written', 'written-topup']) {
    const written = await readDir<{ questions: Written[] }>(join(out, pass));
    const todo = all.filter((item) => (written.get(item.key)?.questions.length ?? 0) > 0);
    results.push(await askEach({
      items: todo, dir: join(out, pass.replace('written', 'checked')), out, width, ask, log,
      prompt: ({ key, session }) => vr.vr62CheckerPrompt(session.rows, session.context.members, (written.get(key)?.questions ?? []).map((entry, index) => ({ key: `q${index + 1}`, written: entry }))),
      record: (item, reply) => {
        const parsed = vr.e0JsonObject(reply.text);
        const answers = parsed && typeof parsed.answers === 'object' && parsed.answers ? parsed.answers as Record<string, Record<string, unknown>> : {};
        const count = written.get(item.key)?.questions.length ?? 0;
        return { session: item.key, checks: Object.fromEntries(Array.from({ length: count }, (_, index) => [`q${index + 1}`, vr.readVr62Check(answers[`q${index + 1}`] ?? null)])) };
      },
    }));
  }
  return results;
}

export async function sessionsByKey(root: string) {
  return new Map((await items(root)).map((item) => [item.key, item.session]));
}

export function secretSceneList(vr: Vr62Kit, sessions: Map<string, Session>, questions: Question[]): string[] {
  const lastAsk = new Map<string, number>();
  questions.forEach((question) => lastAsk.set(question.session, Math.max(lastAsk.get(question.session) ?? -1, question.askMessageId)));
  return [...lastAsk].flatMap(([key, ask]) => {
    const session = sessions.get(key);
    return session ? vr.secretScenes(session.context, ask) : [];
  });
}

export async function mergeQuestions({ root, out }: { root: string; out: string }) {
  const vr = await kit();
  const sessions = await sessionsByKey(root);
  const drafts: Array<{ id: string; session: string; written: Written; check: Check | null }> = [];
  const models = { writers: new Set<string>(), checkers: new Set<string>() };
  for (const [pass, tag] of [['written', ''], ['written-topup', 't']] as const) {
    const written = await readDir<{ questions: Written[]; model: string | null }>(join(out, pass));
    const checked = await readDir<{ checks: Record<string, Check | null>; model: string | null }>(join(out, pass.replace('written', 'checked')));
    for (const [key, file] of written) {
      if (file.model) models.writers.add(file.model);
      const check = checked.get(key);
      if (check?.model) models.checkers.add(check.model);
      file.questions.forEach((entry, index) => drafts.push({ id: `${key}#${tag}${index + 1}`, session: key, written: entry, check: check?.checks[`q${index + 1}`] ?? null }));
    }
  }
  const chats = new Map([...sessions].map(([key, session]) => [key, { rows: session.rows, members: session.context.members }]));
  const merged = vr.mergeVr62Labels(drafts, chats, () => randomBytes(6).toString('hex'));
  await writeJson(join(out, 'labels.json'), merged.labels);
  const kept = vr.readVr62Labels(merged.labels);
  const minimums = vr.vr62Minimums(kept.questions, secretSceneList(vr, sessions, kept.questions));
  const report = { counts: merged.counts, invalidReasons: merged.invalid.map((entry) => entry.reason), minimums, models: { writers: [...models.writers].sort(), checkers: [...models.checkers].sort() } };
  await writeJson(join(out, 'labels-report.json'), report);
  return report;
}

export async function buildPool(root: string, labelsFile: string, provider: unknown) {
  const vr = await kit();
  const sessions = await sessionsByKey(root);
  const labels = vr.readVr62Labels(await readJson(labelsFile));
  const chats = new Map([...sessions].map(([key, session]) => [key, session.rows]));
  return { labels, pool: await vr.buildVr62Pool(labels, chats, provider) };
}

export async function freeze(labelsFile: string, poolFile: string) {
  const pool = await readJson<Pool>(poolFile);
  return { format: 'so-vr62-freeze/1', source: pool.source, provider: pool.provider, labels: await jsonHash(labelsFile), pool: await jsonHash(poolFile), questions: pool.questions.length };
}

export async function checkFrozen(freezeFile: string | undefined, labelsFile: string, poolFile: string): Promise<string | null> {
  if (!freezeFile || !existsSync(freezeFile)) return 'refused: no freeze record (run `freeze` and commit its hashes before scenes, choices or run)';
  const record = await readJson<{ labels: string; pool: string }>(freezeFile);
  const now = await freeze(labelsFile, poolFile);
  if (record.labels !== now.labels) return 'refused: the labels file differs from the frozen hash';
  if (record.pool !== now.pool) return 'refused: the pool file differs from the frozen hash';
  return null;
}

export const SCENE_BUSY_RETRIES = 3;
export const SCENE_BUSY_WAIT_MS = 61_000;

export async function recordScenes({ root, poolFile, out, ask, wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), log = console.log }: {
  root: string; poolFile: string; out: string; ask: (request: unknown) => Promise<JudgeAnswer>; wait?: (ms: number) => Promise<void>; log?: (line: string) => void;
}) {
  const vr = await kit();
  const sessions = await sessionsByKey(root);
  const pool = await readJson<Pool>(poolFile);
  const done = existsSync(out) ? await readJson<{ records: Record<string, SceneRecord> }>(out) : { records: {} };
  const records: Record<string, SceneRecord> = { ...done.records };
  const keys = [...new Set(pool.questions.flatMap((question) => question.candidates.map((candidate) => `${question.session}\u0000${candidate.messageId}`)))];
  let asked = 0;
  for (const entry of keys) {
    const [sessionKey, idText] = entry.split('\u0000');
    const messageId = Number(idText);
    const key = vr.sceneKey(sessionKey, messageId);
    if (records[key]) continue;
    const session = sessions.get(sessionKey);
    if (!session) throw new Error(`no session ${sessionKey}`);
    let answer: JudgeAnswer | null = null;
    for (let attempt = 0; attempt <= SCENE_BUSY_RETRIES; attempt += 1) {
      answer = await ask(vr.sceneRequestAt(session.context, session.rows, messageId));
      if (answer.fallback !== 'busy') break;
      if (attempt === SCENE_BUSY_RETRIES) throw new Error(`${key}: the plugin's rate limiter refused ${SCENE_BUSY_RETRIES + 1} times`);
      await wait(SCENE_BUSY_WAIT_MS);
    }
    records[key] = vr.sceneRecordFrom(session.context, session.rows, messageId, answer as JudgeAnswer);
    asked += 1;
    if (asked % 20 === 0) {
      await writeJson(out, { format: vr.VR62_SCENES_FORMAT, records });
      log(`scenes: ${Object.keys(records).length} of ${keys.length}`);
    }
  }
  await writeJson(out, { format: vr.VR62_SCENES_FORMAT, records });
  const rows = Object.values(records);
  return { messages: keys.length, asked, failed: rows.filter((row) => !row.present).length, fallbacks: rows.filter((row) => row.fallback).length, cached: rows.filter((row) => row.cached).length, models: [...new Set(rows.map((row) => row.model ?? 'none'))].sort(), inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0) };
}

export async function choiceInputs(poolFile: string, scenesFile: string) {
  const vr = await kit();
  const pool = await readJson<Pool>(poolFile);
  const scenes = await readJson<{ records: Record<string, SceneRecord> }>(scenesFile);
  return { kit: vr, questions: vr.choiceQuestions(pool, vr.presenceFilter(scenes.records)) };
}

export async function runVr62({ root, labelsFile, poolFile, scenesFile, choicesFile }: { root: string; labelsFile: string; poolFile: string; scenesFile: string; choicesFile?: string }) {
  const vr = await kit();
  const sessions = await sessionsByKey(root);
  const labels = vr.readVr62Labels(await readJson(labelsFile));
  const pool = await readJson<Pool>(poolFile);
  const scenes = await readJson<{ records: Record<string, SceneRecord> }>(scenesFile);
  const recorded = choicesFile && existsSync(choicesFile) ? await readJson<Record<string, unknown[]>>(choicesFile) : {};
  const pooledIds = new Set(pool.questions.map((question) => question.id));
  const scenesOk = secretSceneList(vr, sessions, labels.questions.filter((question) => pooledIds.has(question.id)));
  return { plan: 'v2.8 21 §6.2 (R1, presence proxy, arm d)', source: pool.source, provider: pool.provider, dropped: labels.dropped, ...vr.scoreVr62(labels, pool, scenes.records, recorded, scenesOk) };
}
