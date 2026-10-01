import { createHash } from 'node:crypto';
import { acceptRegex, type SagaMessage, type SagaNeedle, type SagaNeedles, type SagaStory, type SagaTranscript, type SagaVariant, VARIANTS } from './sagaCorpus.mts';

export const RECIPE_PATH = 'test/measurements/v2.6-07/recipe.json';
export const RUNS_DIR = 'test/measurements/v2.6-07/runs';
export const BASELINE_ARMS: Record<SagaVariant, string> = { chaptered: 'A0', chapterless: 'E0' };

export type ArmSwitch = 'seal' | 'chronicle' | 'fold' | 'recall' | 'eraSeals';

export interface ArmSpec {
  id: string;
  variant?: SagaVariant;
  seal: boolean;
  chronicle: boolean;
  fold: boolean;
  recall?: boolean;
  eraSeals?: boolean;
}

export interface FloorCheck {
  arm: string;
  chapter?: string | null;
  min?: number;
  vs?: { arm: string; minDelta: number };
  wrongRateNoIncrease?: boolean;
}

export interface SagaRecipe {
  arms: ArmSpec[];
  settings: Record<string, string>;
  floors: Array<{ id: string; metric: string; floor: string; check?: FloorCheck }>;
  ask: { template: string; abstain: string; shotgunLimit: number };
  [key: string]: unknown;
}

export type FileRole = 'story' | 'transcript' | 'needles' | 'recipe';

export interface SagaManifest {
  kind: 'saga-recall-manifest';
  version: 1;
  arm: ArmSpec;
  chronicleTokens: number | null;
  variant: SagaVariant;
  baseline: boolean;
  files: Record<FileRole, { path: string; sha256: string }>;
  corpusDigest: string;
  frozenAt: string;
}

export const sha256 = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

export const variantOf = (arm: ArmSpec): SagaVariant => arm.variant ?? 'chaptered';

export const filesFor = (variant: SagaVariant): Record<FileRole, string> => ({ story: VARIANTS[variant].story, transcript: VARIANTS[variant].transcript, needles: VARIANTS[variant].needles, recipe: RECIPE_PATH });

export function findArm(recipe: SagaRecipe, id: string): ArmSpec {
  const arm = recipe.arms.find((entry) => entry.id === id);
  if (!arm) throw new Error(`unknown arm "${id}" (recipe arms: ${recipe.arms.map((entry) => entry.id).join(', ')})`);
  return arm;
}

export function freezeManifest({ arm, chronicleTokens = null, baseline = false, read, now = () => new Date().toISOString() }:
  { arm: ArmSpec; chronicleTokens?: number | null; baseline?: boolean; read: (path: string) => string; now?: () => string }): SagaManifest {
  const variant = variantOf(arm);
  if (baseline !== (arm.id === BASELINE_ARMS[variant])) {
    throw new Error(baseline ? `the baseline of the ${variant} corpus is ${BASELINE_ARMS[variant]}, not ${arm.id}` : `${arm.id} is a baseline arm: prepare it with the baseline command, independently of the treatment arms`);
  }
  if (baseline && (arm.seal || arm.chronicle || arm.fold || arm.recall || arm.eraSeals)) throw new Error(`baseline ${arm.id} must have every switch off`);
  const paths = filesFor(variant);
  const files = Object.fromEntries(Object.entries(paths).map(([role, path]) => [role, { path, sha256: sha256(read(path)) }])) as SagaManifest['files'];
  return { kind: 'saga-recall-manifest', version: 1, arm, chronicleTokens, variant, baseline, files, corpusDigest: corpusDigest(files), frozenAt: now() };
}

export const corpusDigest = (files: SagaManifest['files']) => sha256((['story', 'transcript', 'needles', 'recipe'] as FileRole[]).map((role) => `${role}:${files[role].sha256}`).join('\n'));

export function verifyManifest(manifest: SagaManifest, read: (path: string) => string): string[] {
  const problems: string[] = [];
  if (manifest?.kind !== 'saga-recall-manifest') return ['not a saga-recall manifest'];
  for (const [role, file] of Object.entries(manifest.files)) {
    let actual: string;
    try { actual = sha256(read(file.path)); } catch { problems.push(`${role}: ${file.path} is missing`); continue; }
    if (actual !== file.sha256) problems.push(`${role}: ${file.path} changed since prepare (frozen ${file.sha256.slice(0, 12)}, now ${actual.slice(0, 12)})`);
  }
  if (corpusDigest(manifest.files) !== manifest.corpusDigest) problems.push('the manifest digest does not match its own file hashes');
  return problems;
}

export function assertFrozen(manifest: SagaManifest, read: (path: string) => string, step: string) {
  const problems = verifyManifest(manifest, read);
  if (problems.length) throw new Error(`refusing ${step}: the frozen inputs changed — ${problems.join('; ')}`);
}

export interface ChapterSettingsView { seal?: unknown; storySoFar?: unknown; fold?: unknown; chronicleTokens?: unknown; recall?: unknown; eraSeals?: unknown; [key: string]: unknown }

export function armSettings(arm: ArmSpec, chronicleTokens: number | null): ChapterSettingsView {
  return {
    seal: arm.seal,
    storySoFar: arm.chronicle,
    fold: arm.fold,
    ...(chronicleTokens === null ? {} : { chronicleTokens }),
    ...(arm.recall === undefined ? {} : { recall: arm.recall }),
    ...(arm.eraSeals === undefined ? {} : { eraSeals: arm.eraSeals }),
  };
}

export function settingsMismatch(wanted: ChapterSettingsView, read: ChapterSettingsView | null): string[] {
  if (!read) return ['the page has no chapter settings to read back'];
  return Object.entries(wanted).filter(([key, value]) => read[key] !== value).map(([key, value]) => `${key}: wanted ${JSON.stringify(value)}, read back ${JSON.stringify(read[key])}`);
}

export interface SagaChat { groupId: string | null; chatId: string | null; length: number }
export interface SagaState { activeCheckpointId: string | null; boundary: number; chapterRecords: number }

export interface SagaHost {
  chat(): Promise<SagaChat>;
  importStory(story: SagaStory): Promise<{ ok: boolean; storyId: string | null }>;
  writeChapterSettings(patch: ChapterSettingsView): Promise<void>;
  readChapterSettings(): Promise<ChapterSettingsView | null>;
  setLeg(value: number): Promise<void>;
  post(message: Pick<SagaMessage, 'text' | 'isUser'>, narrator: string): Promise<void>;
  state(): Promise<SagaState>;
  settle(): Promise<void>;
  ask(prompt: string, narrator: string): Promise<{ answer: string; speaker: string | null }>;
  undoAsk(): Promise<void>;
}

export const legFor = (checkpoint: string) => Number(checkpoint.replace(/^c/, '')) - 1;

export interface ReplayRecord {
  corpusDigest: string;
  arm: string;
  chat: SagaChat;
  storyId: string | null;
  greetingOffset: number;
  settings: ChapterSettingsView | null;
  posted: number;
  transitions: Array<{ messageId: number | 'arrival'; expected: string; active: string | null; boundary: number }>;
  drift: string[];
  finalCheckpoint: string | null;
  chapterRecords: number;
  ok: boolean;
}

export async function forceSettings(host: SagaHost, wanted: ChapterSettingsView, when: string) {
  await host.writeChapterSettings(wanted);
  const read = await host.readChapterSettings();
  const mismatch = settingsMismatch(wanted, read);
  if (mismatch.length) throw new Error(`refusing ${when}: the arm's settings did not read back — ${mismatch.join('; ')}`);
  return read;
}

export async function runReplay(host: SagaHost, { manifest, story, transcript, narrator, maxGreeting = 2, onProgress = () => undefined }:
  { manifest: SagaManifest; story: SagaStory; transcript: SagaTranscript; narrator: string; maxGreeting?: number; onProgress?: (done: number, total: number) => void }): Promise<ReplayRecord> {
  const chat = await host.chat();
  if (!chat.groupId || !chat.chatId) throw new Error('refusing replay: no group chat is open (open-group <id> then new-chat first)');
  if (chat.length > maxGreeting) throw new Error(`refusing replay: the chat already holds ${chat.length} messages; replay needs a fresh chat`);
  const imported = await host.importStory(story);
  if (!imported.ok) throw new Error('refusing replay: the story did not import');
  const settings = await forceSettings(host, armSettings(manifest.arm, manifest.chronicleTokens), 'replay');
  const transitions: ReplayRecord['transitions'] = [];
  const drift: string[] = [];
  let previous = transcript.messages[0]?.checkpoint ?? 'c1';
  const steps: Array<{ messageId: number | 'arrival'; message: Pick<SagaMessage, 'text' | 'isUser' | 'checkpoint'> }> = [
    ...transcript.messages.map((message) => ({ messageId: message.id, message })),
    { messageId: 'arrival', message: transcript.arrival },
  ];
  let posted = 0;
  for (const { messageId, message } of steps) {
    const transition = message.checkpoint !== previous;
    if (transition) await host.setLeg(legFor(message.checkpoint));
    await host.post(message, narrator);
    posted += 1;
    if (transition) {
      await host.settle();
      const state = await host.state();
      transitions.push({ messageId, expected: message.checkpoint, active: state.activeCheckpointId, boundary: state.boundary });
      if (state.activeCheckpointId !== message.checkpoint) drift.push(`at message ${messageId}: expected ${message.checkpoint}, the engine is on ${state.activeCheckpointId}`);
      previous = message.checkpoint;
    }
    onProgress(posted, steps.length);
  }
  await host.settle();
  const final = await host.state();
  const after = await host.chat();
  if (after.chatId !== chat.chatId) drift.push(`the chat moved during replay: ${chat.chatId} -> ${after.chatId}`);
  const ok = final.activeCheckpointId === transcript.arrival.checkpoint && drift.length === 0;
  return { corpusDigest: manifest.corpusDigest, arm: manifest.arm.id, chat, storyId: imported.storyId, greetingOffset: chat.length, settings, posted, transitions, drift, finalCheckpoint: final.activeCheckpointId, chapterRecords: final.chapterRecords, ok };
}

export interface AnswerRecord { id: string; chapter: string; question: string; prompt: string; answer: string; speaker: string | null }

export interface AskRecord {
  corpusDigest: string;
  arm: string;
  chatId: string | null;
  checkpoint: string | null;
  settings: ChapterSettingsView | null;
  answers: AnswerRecord[];
}

export const askedNeedles = (needles: SagaNeedles) => needles.needles.filter((needle) => needle.asked);

export const askPrompt = (template: string, question: string) => template.replace('{question}', question);

export async function runAsk(host: SagaHost, { manifest, replay, needles, recipe, narrator }:
  { manifest: SagaManifest; replay: ReplayRecord; needles: SagaNeedles; recipe: SagaRecipe; narrator: string }): Promise<AskRecord> {
  if (replay.corpusDigest !== manifest.corpusDigest) throw new Error('refusing ask: the replay was made from a different frozen manifest');
  if (!replay.ok) throw new Error(`refusing ask: the replay did not end cleanly on ${needles.askAt} (${replay.drift.join('; ') || `final ${replay.finalCheckpoint}`})`);
  const chat = await host.chat();
  if (chat.chatId !== replay.chat.chatId) throw new Error(`refusing ask: the open chat ${chat.chatId} is not the replayed chat ${replay.chat.chatId}`);
  const state = await host.state();
  if (state.activeCheckpointId !== needles.askAt) throw new Error(`refusing ask: the engine is on ${state.activeCheckpointId}, the questions are asked at ${needles.askAt}`);
  const settings = await forceSettings(host, armSettings(manifest.arm, manifest.chronicleTokens), 'ask');
  const answers: AnswerRecord[] = [];
  for (const needle of askedNeedles(needles)) {
    const prompt = askPrompt(recipe.ask.template, needle.question);
    const before = await host.chat();
    const reply = await host.ask(prompt, narrator);
    answers.push({ id: needle.id, chapter: needle.chapter, question: needle.question, prompt, answer: reply.answer, speaker: reply.speaker });
    await host.undoAsk();
    const after = await host.chat();
    if (after.chatId !== before.chatId || after.length !== before.length) throw new Error(`refusing to continue: question ${needle.id} left the chat at ${after.length} messages (was ${before.length})`);
  }
  return { corpusDigest: manifest.corpusDigest, arm: manifest.arm.id, chatId: chat.chatId, checkpoint: state.activeCheckpointId, settings, answers };
}

export type Verdict = 'correct' | 'wrong' | 'abstain' | 'shotgun' | 'cross';

export interface ScoredAnswer { id: string; chapter: string; verdict: Verdict; others: string[] }

export function scoreAnswer(needle: SagaNeedle, answer: string, all: SagaNeedle[], recipe: SagaRecipe): ScoredAnswer {
  const own = acceptRegex(needle).test(answer);
  const others = all.filter((other) => other.id !== needle.id && acceptRegex(other).test(answer)).map((other) => other.id);
  const abstain = new RegExp(recipe.ask.abstain, 'i').test(answer);
  let verdict: Verdict;
  if (own && others.length > recipe.ask.shotgunLimit) verdict = 'shotgun';
  else if (own) verdict = 'correct';
  else if (others.length) verdict = 'cross';
  else if (abstain || !answer.trim()) verdict = 'abstain';
  else verdict = 'wrong';
  return { id: needle.id, chapter: needle.chapter, verdict, others };
}

export interface ArmScore {
  arm: string;
  corpusDigest: string;
  asked: number;
  answered: number;
  recall: number;
  wrongRate: number;
  byChapter: Record<string, { asked: number; correct: number; recall: number }>;
  rows: ScoredAnswer[];
  missing: string[];
}

const round = (value: number) => Number(value.toFixed(4));

export function scoreArm(manifest: SagaManifest, ask: AskRecord, needles: SagaNeedles, recipe: SagaRecipe): ArmScore {
  if (ask.corpusDigest !== manifest.corpusDigest) throw new Error('refusing score: the answers were recorded under a different frozen manifest');
  const asked = askedNeedles(needles);
  const byId = new Map(ask.answers.map((row) => [row.id, row]));
  const rows = asked.map((needle) => scoreAnswer(needle, byId.get(needle.id)?.answer ?? '', needles.needles, recipe));
  const missing = asked.filter((needle) => !byId.has(needle.id)).map((needle) => needle.id);
  const byChapter: ArmScore['byChapter'] = {};
  for (const row of rows) {
    const entry = byChapter[row.chapter] ?? { asked: 0, correct: 0, recall: 0 };
    entry.asked += 1;
    if (row.verdict === 'correct') entry.correct += 1;
    entry.recall = round(entry.correct / entry.asked);
    byChapter[row.chapter] = entry;
  }
  const correct = rows.filter((row) => row.verdict === 'correct').length;
  const wrong = rows.filter((row) => row.verdict === 'wrong' || row.verdict === 'cross' || row.verdict === 'shotgun').length;
  return { arm: manifest.arm.id, corpusDigest: manifest.corpusDigest, asked: rows.length, answered: ask.answers.length, recall: round(correct / rows.length), wrongRate: round(wrong / rows.length), byChapter, rows, missing };
}

export interface ArmRun { manifest: SagaManifest; ask: AskRecord; score: ArmScore }

export const RUN_FILES = { manifest: 'manifest.json', replay: 'replay.json', ask: 'answers.json', score: 'score.json' } as const;

export function loadArmRun(dir: string, read: (path: string) => string): ArmRun {
  const manifest = JSON.parse(read(`${dir}/${RUN_FILES.manifest}`)) as SagaManifest;
  assertFrozen(manifest, read, `to score ${dir}`);
  let ask: AskRecord;
  try { ask = JSON.parse(read(`${dir}/${RUN_FILES.ask}`)); } catch { throw new Error(`refusing to score ${dir}: no ${RUN_FILES.ask} (run ask first)`); }
  const needles = JSON.parse(read(manifest.files.needles.path)) as SagaNeedles;
  const recipe = JSON.parse(read(manifest.files.recipe.path)) as SagaRecipe;
  return { manifest, ask, score: scoreArm(manifest, ask, needles, recipe) };
}

export function checkBaseline(treatment: ArmRun, baseline: ArmRun): string[] {
  const problems: string[] = [];
  const variant = treatment.manifest.variant;
  if (!baseline.manifest.baseline || baseline.manifest.arm.id !== BASELINE_ARMS[variant]) problems.push(`the baseline run is ${baseline.manifest.arm.id}${baseline.manifest.baseline ? '' : ' (not prepared by the baseline command)'}, expected ${BASELINE_ARMS[variant]}`);
  if (baseline.manifest.variant !== variant) problems.push(`the baseline is the ${baseline.manifest.variant} corpus, the arm is ${variant}`);
  if (baseline.manifest.corpusDigest !== treatment.manifest.corpusDigest) problems.push('the baseline was produced from a different frozen manifest');
  const read = baseline.ask.settings;
  const on = (['seal', 'storySoFar', 'fold', 'recall', 'eraSeals'] as const).filter((key) => read?.[key] === true);
  if (!read) problems.push('the baseline recorded no settings read-back');
  else if (on.length) problems.push(`the baseline ran with ${on.join(', ')} on`);
  return problems;
}

export interface FloorResult { id: string; evaluated: boolean; pass: boolean | null; detail: string; values?: Record<string, number> }

const EPSILON = 1e-9;

export function evaluateFloors(recipe: SagaRecipe, runs: Record<string, ArmRun>): FloorResult[] {
  const recallOf = (arm: string, chapter?: string | null) => {
    const score = runs[arm]?.score;
    if (!score) return null;
    return chapter ? score.byChapter[chapter]?.recall ?? null : score.recall;
  };
  return recipe.floors.map((floor) => {
    const check = floor.check;
    if (!check) return { id: floor.id, evaluated: false, pass: null, detail: 'not a recall floor (measured elsewhere)' };
    const needed = [check.arm, ...(check.vs ? [check.vs.arm] : [])];
    const absent = needed.filter((arm) => !runs[arm]);
    if (absent.length) return { id: floor.id, evaluated: false, pass: null, detail: `needs arm(s) ${absent.join(', ')}` };
    const digests = new Set(needed.map((arm) => runs[arm].manifest.corpusDigest));
    if (digests.size > 1) return { id: floor.id, evaluated: false, pass: null, detail: `refused: ${needed.join(' and ')} come from different frozen manifests` };
    const value = recallOf(check.arm, check.chapter)!;
    const values: Record<string, number> = { [check.arm]: value };
    const reasons: string[] = [];
    if (check.min !== undefined && value + EPSILON < check.min) reasons.push(`${check.arm} ${value} < ${check.min}`);
    if (check.vs) {
      const other = recallOf(check.vs.arm, check.chapter)!;
      values[check.vs.arm] = other;
      const delta = round(value - other);
      values.delta = delta;
      if (delta + EPSILON < check.vs.minDelta) reasons.push(`${check.arm} - ${check.vs.arm} = ${delta} < ${check.vs.minDelta}`);
      if (check.wrongRateNoIncrease && runs[check.arm].score.wrongRate > runs[check.vs.arm].score.wrongRate + EPSILON) {
        reasons.push(`wrong-answer rate rose ${runs[check.vs.arm].score.wrongRate} -> ${runs[check.arm].score.wrongRate}`);
      }
    }
    return { id: floor.id, evaluated: true, pass: reasons.length === 0, detail: reasons.join('; ') || `${floor.floor}: met`, values };
  });
}

export function pageHost(page: { evaluate: (fn: (arg: any) => any, arg?: any) => Promise<any>; waitForTimeout: (ms: number) => Promise<void> }, { postTimeoutMs = 120000, settleQuietMs = 3000, settleTimeoutMs = 600000, askTimeoutMs = 300000 } = {}): SagaHost {
  const slash = (command: string) => page.evaluate(async (cmd: string) => {
    const result = await (globalThis as any).SillyTavern.getContext().executeSlashCommandsWithOptions(cmd);
    return { isError: Boolean(result?.isError), pipe: typeof result?.pipe === 'string' ? result.pipe : null };
  }, command);
  const runtime = () => page.evaluate(() => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const snap = rt?.getSnapshot?.();
    return snap ? { activeCheckpointId: snap.activeCheckpointId ?? null, boundary: snap.boundary ?? 0, chapterRecords: snap.chapters?.records?.length ?? 0, scheduler: snap.extraction?.scheduler ?? null } : null;
  });
  const chat = () => page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return { groupId: ctx.groupId ?? null, chatId: ctx.chatId ?? null, length: ctx.chat?.length ?? 0 };
  });
  const until = async (label: string, timeoutMs: number, test: () => Promise<boolean>) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await test()) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
  };
  const quoted = (name: string) => `"${name.replace(/"/g, '')}"`;
  return {
    chat,
    importStory: (story) => page.evaluate(async (raw: string) => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      const ok = await rt.importStory(raw);
      return { ok: Boolean(ok), storyId: rt.getSnapshot().storyId ?? null };
    }, JSON.stringify(story)),
    writeChapterSettings: (patch) => page.evaluate((next: Record<string, unknown>) => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      rt.setMemorySettings({ chapters: { ...(rt.getSnapshot().memory?.settings?.chapters ?? {}), ...next } });
    }, patch),
    readChapterSettings: () => page.evaluate(() => (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.().memory?.settings?.chapters ?? null),
    setLeg: async (value) => {
      const result = await slash(`/cp set leg ${value}`);
      if (result.isError) throw new Error(`/cp set leg ${value} failed`);
    },
    post: async (message, narrator) => {
      const before = await runtime();
      const beforeChat = await chat();
      const result = await slash(message.isUser ? `/send ${message.text}` : `/sendas name=${quoted(narrator)} ${message.text}`);
      if (result.isError) throw new Error(`posting failed: ${message.text.slice(0, 60)}`);
      await until('the message to land', postTimeoutMs, async () => (await chat()).length > beforeChat.length);
      if (!message.isUser) await until('the boundary to commit', postTimeoutMs, async () => ((await runtime())?.boundary ?? 0) > (before?.boundary ?? 0));
    },
    state: async () => {
      const snap = await runtime();
      return { activeCheckpointId: snap?.activeCheckpointId ?? null, boundary: snap?.boundary ?? 0, chapterRecords: snap?.chapterRecords ?? 0 };
    },
    settle: async () => {
      let quietSince: number | null = null;
      await until('the extraction scheduler to drain', settleTimeoutMs, async () => {
        const scheduler = (await runtime())?.scheduler;
        const busy = !scheduler || scheduler.inFlight || scheduler.queueDepth > 0 || scheduler.heavyInFlight || (scheduler.heavyQueueDepth ?? 0) > 0;
        if (busy) { quietSince = null; return false; }
        quietSince ??= Date.now();
        return Date.now() - quietSince >= settleQuietMs;
      });
    },
    ask: async (prompt, narrator) => {
      const before = await chat();
      const sent = await slash(`/send ${prompt.replace(/\|/g, '/')}`);
      if (sent.isError) throw new Error('the question did not post');
      const triggered = await slash(`/trigger await=true ${quoted(narrator)}`);
      if (triggered.isError) throw new Error(`/trigger ${narrator} failed`);
      await until('the narrator to answer', askTimeoutMs, async () => (await chat()).length >= before.length + 2);
      return page.evaluate(() => {
        const ctx = (globalThis as any).SillyTavern.getContext();
        const last = ctx.chat?.[ctx.chat.length - 1];
        return { answer: last && !last.is_user ? String(last.mes ?? '') : '', speaker: last?.name ?? null };
      });
    },
    undoAsk: async () => {
      const before = await chat();
      const result = await slash('/del 2');
      if (result.isError) throw new Error('/del 2 failed');
      await until('the question and answer to be removed', postTimeoutMs, async () => (await chat()).length <= before.length - 2);
    },
  };
}
