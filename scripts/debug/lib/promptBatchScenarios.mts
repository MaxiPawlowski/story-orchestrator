import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { Page } from 'playwright';
import { loadEntry, REPO_ROOT } from './bundleEntry.mts';
import { freezeRequest, latestOk, sha256, type BatchItem, type BatchManifest, type Finish, type InstructSequences, type ResponseRecord, type StopCallback } from './promptBatch.mts';
import type { BatchKit, MeasureArgs, Measurement, PlannedItem } from './promptBatchMeasures.mts';
import { servedBundleSha, type RecorderPlan } from './promptBatchRecorder.mts';
import { evaluateStop, type StopDeclaration, type StopItem } from './stopRule.mts';

export interface SerialSecret { entryId?: string; phrasings: string[][]; knowers: string[]; onlyFrom: string[] | null }
export interface ShownLine { text: string; anchor: string | null; anchorKind: string | null; authored: boolean }
type Anchor = { id: string; kind: string; text: string };

export interface ScenarioKit {
  suggestionPrompt(context: Record<string, unknown>): Promise<{ prompt: string; anchors: Anchor[] }>;
  suggestionLines(context: Record<string, unknown>, text: string, finish: Finish): Promise<{ parsed: number; usable: boolean; incomplete: boolean; shown: ShownLine[]; anchors: Anchor[] }>;
  needleHits(texts: readonly string[], needles: readonly string[]): string[];
  sagaPrompt(context: Record<string, unknown>): Promise<{ prompt: string; title: string }>;
  sagaCast(story: unknown, playerName: string): Promise<string[]>;
  sagaVerdict(text: string, finish: Finish, context: { records: unknown[]; cast: string[] }): { accepted: boolean; incomplete: boolean; reasons: string[]; words: number; invented: string[]; properNouns: string[]; reply: string };
}

export const loadScenarioKit = () => loadEntry<ScenarioKit>('scripts/debug/lib/promptBatchScenarioEntry.ts');

export interface CaptureContext {
  page: Page;
  out: string;
  kit: BatchKit;
  instruct: InstructSequences | null;
  items: PlannedItem[];
  log: (line: string) => void;
}

export interface CaptureResult { rows: BatchItem[]; bodies: Map<string, string> }

const THOUGHT = '<|channel>thought\n<channel|>';
const backendJson = (text: string, extra: Record<string, unknown> = {}): string => JSON.stringify({ content: text, stop: true, stopped_eos: true, stop_type: 'eos', tokens_predicted: 1, tokens_evaluated: 1, model: 'prompt-batch-canned', ...extra });

const promptOf = (body: string): string => {
  const parsed = JSON.parse(body) as { prompt?: unknown };
  return typeof parsed.prompt === 'string' ? parsed.prompt : '';
};

const safe = (id: string) => id.replace(/[^a-zA-Z0-9._-]+/g, '_');

const text = (args: MeasureArgs, name: string): string | undefined => (typeof args[name] === 'string' ? args[name] as string : undefined);

const readJson = async <T,>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf-8')) as T;

export const lfSha = (value: string): string => sha256(value.replace(/\r\n/g, '\n'));

export const LT_DIR = join(REPO_ROOT, 'test', 'measurements', 'v2.9', '06-lt');
export const LT_ARMS = ['current', 'anchored'] as const;
export type LtArm = typeof LT_ARMS[number];
export const STRICT_GOAL_THREAD = new Set(['objective', 'quest-step', 'quest', 'thread', 'dormant-thread', 'promise', 'pattern']);
export const SUGGESTION_RULE = 'You help a player who is stuck in a roleplay story\\.';

export const modelRefusals = (refused: ReadonlyArray<{ url: string }>) => refused.filter((call) => !/\/api\/plugins\/story-orchestrator-media\//.test(call.url));

interface Situation { id: string; mix: string; premise: string; story: { id: string }; bait?: string; leakNeedles?: string[]; expect?: { computed?: { candidates?: Array<{ id: string; text: string }>; selectedOffline?: string[] } } }

export function ltCannedLines(arm: LtArm, situation: Pick<Situation, 'expect'>): string[] {
  if (arm === 'current') return LT_CANNED.current;
  const computed = situation.expect?.computed;
  const texts = (computed?.selectedOffline ?? []).map((id) => computed?.candidates?.find((entry) => entry.id === id)?.text).filter((entry): entry is string => Boolean(entry)).slice(0, 2);
  return LT_CANNED.anchored.map((line, index) => (texts[index] ? `- [${index + 1}] I work toward this: ${texts[index].slice(0, 150)}` : line));
}
interface Frozen { corpus: { sha256: string; scenarios: { sha256: Record<LtArm, Record<string, string>> } }; rater: { passA: { prompt: string }; passB: { prompt: string } } }

export async function ltCorpus(dir = LT_DIR) {
  const raw = await readFile(join(dir, 'situations.json'), 'utf-8');
  const frozen = await readJson<Frozen>(join(dir, 'frozen.json'));
  const corpusSha = lfSha(raw);
  if (corpusSha !== frozen.corpus.sha256) throw new Error(`refused: situations.json hashes to ${corpusSha}, frozen.json says ${frozen.corpus.sha256}`);
  const situations = (JSON.parse(raw) as { situations: Situation[] }).situations;
  return { dir, corpusSha, frozen, situations };
}

export const ltFile = (dir: string, arm: LtArm, id: string) => join(dir, 'scenarios', arm, `v29-06-lt-${arm}-${id}.json`);

export const armOrder = (id: string): LtArm[] => (Number(id.replace(/\D/g, '')) % 2 ? ['current', 'anchored'] : ['anchored', 'current']);

export const anchoredFirst = (corpusSha: string, id: string): boolean => (createHash('sha256').update(`${corpusSha}${id}`).digest()[0] & 1) === 1;

export const LT_CANNED = {
  anchored: ['- [1] I look around for anything that could help with what I came here to do.', '- [2] I ask about the matter that is still unresolved.', '- I take a slow breath and study the scene again.', '- I ask my companion what we should try first.'],
  current: ['- I look around for anything that could help with what I came here to do.', '- I ask about the matter that is still unresolved.', '- I take a slow breath and study the scene again.', '- I ask my companion what we should try first.'],
};

const OTHER_REPLY = backendJson(`${THOUGHT}The moment passes quietly.`);

const isRecordStep = (step: Record<string, unknown>) => typeof step.eval === 'string' && step.eval.includes("localStorage.setItem('so-v29-06lt-");

export const LT_CONTEXT_EVAL = "const s = globalThis.__soPromptBatch; if (!s) throw new Error('prompt-batch recorder missing'); s.armed = false; const rt = globalThis.storyOrchestratorRuntime; const ctx = SillyTavern.getContext(); const story = rt.getStory(); const snap = rt.getSnapshot(); const inj = rt.co?.memory?.injector; if (!inj || typeof inj.secrets !== 'function') throw new Error('no memory injector secrets seam on this build'); const secrets = story ? inj.secrets(story).map((x) => ({ entryId: x.entryId, phrasings: x.phrasings.map((p) => [...p]), knowers: [...x.knowers], onlyFrom: x.onlyFrom ? [...x.onlyFrom] : null })) : []; const key = 'so-v29-06lt-' + globalThis.__lt.arm + '-' + globalThis.__lt.id; s.context = JSON.parse(JSON.stringify({ state: rt.getEngineState(), narrative: snap.narrative, arcs: snap.memory?.arcs ?? [], derived: snap.memory?.derived, promises: snap.promises ?? [], patterns: snap.patterns ?? [], game: snap.game ?? null, enabled: rt.getEnabledCharacterIds(), chat: ctx.chat, playerName: String(ctx.name1 ?? '').trim(), chatId: String(ctx.chatId ?? ''), boundaryLog: rt.getBoundaryLog().map((e) => ({ boundary: e.boundary, before: { blackboard: { values: e.before?.blackboard?.values ?? {} } } })), secrets, anchorsOff: globalThis.storyOrchestratorDebugSuggestionAnchors === 'off', record: JSON.parse(localStorage.getItem(key) ?? 'null') })); return { context: true, secrets: secrets.length, lines: s.context.record?.lines?.length ?? null };";

const sameLines = (offline: ShownLine[], page: Array<{ text: string; anchor: string | null }>): boolean =>
  offline.length === page.length && offline.every((line, index) => line.text === page[index].text && (line.anchor ?? null) === (page[index].anchor ?? null));

interface LtRecord { lines: Array<{ text: string; anchor: string | null }>; help: string[]; greyed: Array<{ text: string }>; asks: number; failed: string | null; timedOut: boolean; authorRow: string | null; playerView: unknown; corpus: string }

interface LtSpec { file: string; situation: string; arm: LtArm; story: unknown; needles: string[] }

async function captureLt(ctx: CaptureContext): Promise<CaptureResult> {
  const kit2 = await loadScenarioKit();
  const { captureVariant, runScenarioItem } = await import('./promptBatchScenario.mts');
  const rows: BatchItem[] = [];
  const bodies = new Map<string, string>();
  let fresh = false;
  for (const item of ctx.items) {
    const spec = item.spec as LtSpec;
    const scenario = await readJson<{ steps: Array<Record<string, unknown>> }>(spec.file);
    const variant = captureVariant(scenario, {
      armBefore: isRecordStep, contextAfter: isRecordStep, contextEval: LT_CONTEXT_EVAL, sourceDir: dirname(spec.file),
      note: `so-prompt-batch lt06 capture variant of ${relative(REPO_ROOT, spec.file).replace(/\\/g, '/')} (recorder armed for the ask, no model).`,
    });
    const plan: RecorderPlan = { rules: [{ id: 'suggestions', source: SUGGESTION_RULE, replies: [item.canned] }], canned: OTHER_REPLY };
    const file = join(ctx.out, 'variants', spec.arm, `${safe(item.id)}.json`);
    const first = await runScenarioItem(ctx.page, file, variant as never, plan, { reload: fresh });
    const retried = !first.stepsOk;
    if (retried) ctx.log(`retry ${item.id} once after a fresh page (S5): ${first.error}`);
    const run = retried ? await runScenarioItem(ctx.page, file, variant as never, plan, { reload: true }) : first;
    const bundleSha256 = await servedBundleSha(ctx.page);
    const asks = run.calls.filter((call) => call.rule === 'suggestions');
    const others = run.calls.filter((call) => call.rule !== 'suggestions');
    const context = run.context as (Record<string, unknown> & { record: LtRecord | null }) | null;
    const row: BatchItem = { id: item.id, sha: null, path: null, calls: asks.length, builderInBody: null, selfCheck: null, inPage: null, meta: item.meta };
    const problems: string[] = [];
    if (!run.stepsOk) problems.push(`${run.notRunnable ? 'not runnable' : 'scenario'}: ${run.error}`);
    const warning = run.stepsOk && !run.ok ? run.error : undefined;
    if (asks.length !== 1) problems.push(`${asks.length} suggestions calls in the ask window (exactly 1 expected)`);
    if (!context?.record) problems.push('no context or record captured');
    if (asks.length === 1 && context?.record) {
      try {
        const frozen = freezeRequest(asks[0]);
        row.sha = frozen.sha;
        row.path = frozen.path;
        bodies.set(frozen.sha, frozen.body);
        const full = { ...context, story: spec.story };
        const offline = await kit2.suggestionPrompt(full);
        row.builderInBody = promptOf(frozen.body).includes(offline.prompt);
        if (!row.builderInBody) problems.push("the offline-rebuilt suggestions prompt is not inside the request body");
        const reply = ctx.kit.textCompletionReply(JSON.parse(item.canned), ctx.instruct);
        const lines = await kit2.suggestionLines(full, reply.ok ? reply.text : '', reply.finish);
        const record = context.record;
        const differs = !sameLines(lines.shown, record.lines) ? 'lines' : record.asks !== 1 ? `asks ${record.asks}` : null;
        row.selfCheck = differs ? { ok: false, detail: `offline ${differs} differ from the page` } : { ok: true };
        if (differs) problems.push(`self-check: offline ${differs} differ from the page`);
        const contextText = `${JSON.stringify(full)}\n`;
        const contextSha = sha256(contextText);
        await mkdir(join(ctx.out, 'contexts'), { recursive: true });
        await writeFile(join(ctx.out, 'contexts', `${contextSha}.json`), contextText, 'utf-8');
        row.inPage = {
          contextSha, anchors: offline.anchors, asks: record.asks, help: record.help, greyed: record.greyed.map((entry) => entry.text), authorRow: record.authorRow,
          promptNeedles: kit2.needleHits([offline.prompt], spec.needles), otherCalls: others.length, bundleSha256, ...(retried ? { retriedAfter: first.error } : {}), refused: modelRefusals(run.refused).map((call) => call.url), ...(warning ? { cleanupWarning: warning } : {}),
        };
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (problems.length) row.problem = problems.join('; ');
    fresh = Boolean(row.problem);
    rows.push(row);
    ctx.log(`${row.problem ? 'FAIL' : 'ok  '} ${item.id} ${row.sha ? row.sha.slice(0, 12) : '(no call)'}${row.problem ? ` ${row.problem}` : ''}${warning ? ` (cleanup warning: ${warning})` : ''}`);
  }
  return { rows, bodies };
}

export interface LtRow {
  id: string; situation: string; arm: LtArm; answered: boolean; error?: string; finish?: Finish; ms?: number;
  parsed: number; usable: boolean; shown: ShownLine[]; help: string[]; greyed: string[]; asks: number | null;
  grounded: boolean; groundedStrict: boolean; groundedModel: boolean; anchorsOffered: Anchor[]; anchorsUsed: string[];
  needles: string[]; visibleNeedles: string[]; promptNeedles: string[];
}

export const splitNeedles = (hits: readonly string[], shown: readonly string[]) => ({
  needles: hits.filter((needle) => !shown.includes(needle)),
  visibleNeedles: hits.filter((needle) => shown.includes(needle)),
});

const contextCache = new Map<string, Record<string, unknown>>();

async function contextOf(dir: string, sha: string): Promise<Record<string, unknown>> {
  const key = `${dir}|${sha}`;
  if (!contextCache.has(key)) {
    const textValue = await readFile(join(dir, 'contexts', `${sha}.json`), 'utf-8');
    if (lfSha(textValue) !== sha) throw new Error(`refused: contexts/${sha}.json no longer hashes to its name`);
    contextCache.set(key, JSON.parse(textValue));
  }
  return contextCache.get(key) as Record<string, unknown>;
}

async function ltRow(dir: string, manifest: BatchManifest, item: BatchItem, record: ResponseRecord | undefined, kit: BatchKit, kit2: ScenarioKit): Promise<LtRow> {
  const meta = item.meta as { situation: string; arm: LtArm; needles: string[] };
  const inPage = (item.inPage ?? {}) as { contextSha?: string; help?: string[]; greyed?: string[]; asks?: number; anchors?: Anchor[]; promptNeedles?: string[] };
  const base = {
    id: item.id, situation: meta.situation, arm: meta.arm, parsed: 0, usable: false, shown: [] as ShownLine[], help: inPage.help ?? [], greyed: inPage.greyed ?? [], asks: inPage.asks ?? null,
    grounded: false, groundedStrict: false, groundedModel: false, anchorsOffered: inPage.anchors ?? [], anchorsUsed: [] as string[], needles: [] as string[], visibleNeedles: [] as string[], promptNeedles: inPage.promptNeedles ?? [],
  };
  if (!inPage.contextSha || !record) return { ...base, answered: false, error: item.problem ?? 'no response recorded' };
  const context = await contextOf(dir, inPage.contextSha);
  const reply = kit.textCompletionReply(JSON.parse(record.raw), manifest.route.instruct);
  const lines = await kit2.suggestionLines(context, reply.ok ? reply.text : '', reply.finish);
  const tagged = lines.shown.filter((line) => line.anchor);
  return {
    ...base, answered: true, finish: record.finish, ms: record.ms, ...(reply.ok ? {} : { error: reply.message }),
    parsed: lines.parsed, usable: lines.usable, shown: lines.shown,
    grounded: tagged.length > 0, groundedStrict: tagged.some((line) => STRICT_GOAL_THREAD.has(line.anchorKind ?? '')), groundedModel: tagged.some((line) => !line.authored),
    anchorsUsed: [...new Set(tagged.map((line) => line.anchor as string))],
    ...splitNeedles(kit2.needleHits([...lines.shown.map((line) => line.text), ...base.help, ...base.greyed], meta.needles), base.promptNeedles),
  };
}

export const ltDeclaration = (manifest: Pick<BatchManifest, 'items'>): StopDeclaration => {
  const sendable = manifest.items.filter((item) => item.sha && item.path && !item.problem);
  const anchored = sendable.filter((item) => (item.meta as { arm?: string }).arm === 'anchored').length;
  return {
    N: sendable.length,
    floors: [{ id: 'usable', rate: 0.9, direction: 'atLeast', planned: anchored }, { id: 'grounded', rate: 0.85, direction: 'atLeast', planned: anchored }],
    zeroFloors: ['leak'],
    needsAll: true,
  };
};

export const ltStopItem = (row: Pick<LtRow, 'arm' | 'usable' | 'grounded' | 'needles'>): StopItem => ({
  metrics: { leak: row.needles.length, ...(row.arm === 'anchored' ? { usable: row.usable, grounded: row.grounded } : {}) },
});

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function seededRandom(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

export function pairedBootstrap(deltas: number[], seed: string, resamples = 1000): { low: number; high: number } | null {
  if (!deltas.length) return null;
  const random = seededRandom(seed);
  const means = Array.from({ length: resamples }, () => {
    let sum = 0;
    for (let index = 0; index < deltas.length; index += 1) sum += deltas[Math.floor(random() * deltas.length)];
    return sum / deltas.length;
  }).sort((a, b) => a - b);
  return { low: means[Math.floor(0.025 * resamples)], high: means[Math.min(resamples - 1, Math.ceil(0.975 * resamples) - 1)] };
}

const count = (rows: LtRow[], test: (row: LtRow) => boolean) => ({ hits: rows.filter(test).length, of: rows.length });

export async function ltRows(dir: string, manifest: BatchManifest, records: ResponseRecord[], kit: BatchKit): Promise<LtRow[]> {
  const kit2 = await loadScenarioKit();
  const ok = latestOk(records);
  const rows: LtRow[] = [];
  for (const item of manifest.items) rows.push(await ltRow(dir, manifest, item, ok.get(item.id), kit, kit2));
  return rows;
}

export async function ltPlayerView(dir: string, item: BatchItem): Promise<unknown> {
  const sha = (item.inPage as { contextSha?: string } | null)?.contextSha;
  return sha ? ((await contextOf(dir, sha)).record as { playerView?: unknown } | null)?.playerView ?? null : null;
}

async function scoreLt(dir: string, manifest: BatchManifest, records: ResponseRecord[], kit: BatchKit, args: MeasureArgs) {
  const rows = await ltRows(dir, manifest, records, kit);
  const { readRater } = await import('./promptBatchRater.mts');
  const rater = await readRater(dir);
  const arm = (name: LtArm) => rows.filter((row) => row.arm === name);
  const anchored = arm('anchored');
  const current = arm('current');
  const planned = Number(manifest.args.situations ?? anchored.length);
  const raterA = (row: LtRow) => rater.passA[row.situation]?.[row.arm] ?? null;
  const raterUsable = (row: LtRow) => { const a = raterA(row); return a ? a.lines.filter((line) => line.usable).length >= 3 : null; };
  const raterB = (row: LtRow) => row.shown.some((line, index) => line.anchor && rater.passB[`${row.situation}#${index}`]?.engages === true);
  const passADone = anchored.every((row) => raterA(row)) && current.every((row) => raterA(row));
  const passBDone = anchored.every((row) => row.shown.every((line, index) => !line.anchor || rater.passB[`${row.situation}#${index}`]));
  const f1 = passADone ? count(anchored, (row) => row.answered && raterUsable(row) === true) : null;
  const f2 = passBDone ? count(anchored, (row) => row.answered && row.grounded && raterB(row)) : null;
  const leakRows = rows.filter((row) => row.needles.length || (raterA(row)?.lines.some((line) => line.leak) ?? false));
  const deltas = passADone ? anchored.flatMap((row) => {
    const mine = raterA(row);
    const theirs = rater.passA[row.situation]?.current;
    return mine && theirs ? [mine.usefulness - theirs.usefulness] : [];
  }) : [];
  const meanDelta = deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null;
  const oneCall = rows.every((row) => row.asks === 1);
  const floors = {
    F1_usable: { rater: f1, floor: '>= 36/40', mechanical: count(anchored, (row) => row.usable), currentMechanical: count(current, (row) => row.usable), pass: f1 ? f1.hits >= Math.ceil(0.9 * planned) && f1.of === planned : null },
    F2_grounded: {
      rater: f2, floor: '>= 34/40', mechanical: count(anchored, (row) => row.grounded), strictMechanical: count(anchored, (row) => row.groundedStrict), modelOnlyMechanical: count(anchored, (row) => row.groundedModel),
      pass: f2 ? f2.hits >= Math.ceil(0.85 * planned) && f2.of === planned : null,
    },
    F3_leaks: {
      needleHits: rows.filter((row) => row.needles.length).map((row) => ({ id: row.id, needles: row.needles })),
      visibleNeedleHits: rows.filter((row) => row.visibleNeedles.length).map((row) => ({ id: row.id, needles: row.visibleNeedles })), raterFlags: passADone ? rows.filter((row) => raterA(row)?.lines.some((line) => line.leak)).map((row) => row.id) : null,
      promptNeedles: rows.filter((row) => row.promptNeedles.length).map((row) => ({ id: row.id, needles: row.promptNeedles })), floor: '0', adjudicate: 'visibleNeedleHits repeat a needle the prompt already shows the player; each needs an adjudicator before F3 can pass',
      pass: leakRows.length ? false : passADone && !rows.some((row) => row.visibleNeedles.length) ? true : null,
    },
    F4_usefulness: {
      pairs: deltas.length, meanDelta, medianDelta: median(deltas), wins: deltas.filter((value) => value > 0).length, ties: deltas.filter((value) => value === 0).length, losses: deltas.filter((value) => value < 0).length,
      ci95: pairedBootstrap(deltas, String(manifest.args.corpus ?? '')), floor: '>= +0.5', pass: passADone && deltas.length === planned ? (meanDelta ?? 0) >= 0.5 : null,
    },
    F5_one_call: { rows: count(rows, (row) => row.asks === 1), floor: 'every row exactly 1', pass: oneCall && rows.length === 2 * planned },
  };
  const verdicts = Object.values(floors).map((floor) => floor.pass);
  const verdict = verdicts.includes(false) ? false : verdicts.every((value) => value === true) ? true : null;
  return {
    ok: verdict,
    report: {
      measurement: 'lt06', corpus: manifest.args.corpus, situations: planned, answered: rows.filter((row) => row.answered).length, of: rows.length,
      rater: { passA: passADone ? 'complete' : `${Object.keys(rater.passA).length} situation(s)`, passB: passBDone ? 'complete' : `${Object.keys(rater.passB).length} line(s)`, routes: rater.routes },
      floors, abstentions: { anchored: anchored.filter((row) => !row.usable).map((row) => row.situation), current: current.filter((row) => !row.usable).map((row) => row.situation) },
      anchors: anchored.map((row) => ({ situation: row.situation, offered: row.anchorsOffered.map((entry) => entry.kind), used: row.anchorsUsed.length })),
      ...(text(args, 'rows') === 'off' ? {} : { results: rows }),
    },
  };
}

export const lt06: Measurement & { capture: (ctx: CaptureContext) => Promise<CaptureResult> } = {
  id: 'lt06',
  synthetic: true,
  async plan(args) {
    const { dir, corpusSha, frozen, situations } = await ltCorpus(text(args, 'corpus-dir') ?? LT_DIR);
    const only = text(args, 'only')?.split(',');
    const items: PlannedItem[] = [];
    for (const situation of situations.filter((entry) => !only || only.includes(entry.id))) {
      for (const arm of armOrder(situation.id)) {
        const file = ltFile(dir, arm, situation.id);
        const name = file.split(/[\\/]/).pop() as string;
        const fileSha = lfSha(await readFile(file, 'utf-8'));
        if (frozen.corpus.scenarios.sha256[arm][name] !== fileSha) throw new Error(`refused: ${name} hashes to ${fileSha}, frozen.json says ${frozen.corpus.scenarios.sha256[arm][name]}`);
        items.push({
          id: `${situation.id}/${arm}`, kind: 'scenario', canned: backendJson(`${THOUGHT}${LT_CANNED[arm].join('\n')}`),
          spec: { file, situation: situation.id, arm, story: situation.story, needles: situation.leakNeedles ?? [] } satisfies LtSpec,
          meta: { situation: situation.id, arm, mix: situation.mix, fileSha, needles: situation.leakNeedles ?? [], corpus: corpusSha },
        });
      }
    }
    args.corpus = corpusSha;
    args.situations = String(new Set(items.map((item) => (item.meta as { situation: string }).situation)).size);
    return items;
  },
  keep: (result) => result,
  async selfCheck() { return { ok: true }; },
  capture: captureLt,
  stop(dir, manifest, kit) {
    let kit2: ScenarioKit | null = null;
    const items: StopItem[] = [];
    const seen = new Set<string>();
    const declaration = ltDeclaration(manifest);
    const callback: StopCallback = async ({ item, record, total, index }) => {
      kit2 ??= await loadScenarioKit();
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(ltStopItem(await ltRow(dir, manifest, item, record, kit, kit2)));
      }
      const decision = evaluateStop({ ...declaration, N: total }, items);
      if (!decision.stop) return null;
      return { stop: true, rule: decision.stop.rule, verdict: decision.stop.verdict, detail: `${decision.stop.reason} (after ${item.id}, ${index + 1}/${total})` };
    };
    return callback;
  },
  score: (dir, manifest, records, kit, args) => scoreLt(dir, manifest, records, kit, args),
};

export const SAGA_FIXTURE = join(REPO_ROOT, 'test', 'scenarios', 'live-v28-45-seal.json');
export const SAGA_STORY = join(REPO_ROOT, 'test', 'scenarios', 'v28-45-carry-source.story.json');
export const SAGA_RULES = { saga: 'The story below has ended; write its epilogue\\.', record: 'You are writing the record of a finished chapter\\.', map: 'You are condensing part \\d+ of \\d+ of the notes of a finished chapter', era: "You are compressing a story's history\\." } as const;

export const DEFAULT_RECORD_REPLIES = [
  [
    'SUMMARY:',
    'The harbour lanterns guttered in the wind as the chapter opened, and the player came to the quay to learn why the lights kept failing. Arin, the harbourmaster, met them by the lamp posts and spoke plainly about the boats that could not find the channel after dark. Luke, a lamplighter, joined them and admitted that the oil stores had run low and that the old keeper had kept a ledger nobody could find. Together they searched the sheds along the water, asked the night watch what they had seen, and followed the trail of spilled oil toward the old tower. By the end of the chapter the player had earned the trust of the lamplighters, the missing ledger had been found, and the three of them stood at the foot of the tower with the last lantern still dark above them.',
    'SHORT:',
    'The player learned why the harbour lanterns failed, found the keeper\'s ledger and won the lamplighters\' trust.',
    'CONSEQUENCES:',
    'PEOPLE:',
    '- Arin: grateful to the player and ready to climb the tower with them.',
    '- Luke: trusts the player after the ledger was found.',
    'OPEN:',
  ].join('\n'),
  [
    'SUMMARY:',
    'The chapter began at the foot of the lantern tower with the wind rising off the sea. Arin and Luke led the player up the narrow stair, stopping at each landing to check the old wicks and the empty oil jars. At the top they found the great lamp cold, its glass cracked but whole enough to burn. Luke refilled the reservoir from the oil they had carried up, Arin steadied the frame against the gusts, and the player struck the light. The flame caught, the lens turned, and a beam swept across the water for the first time in weeks. Below, the boats turned toward the channel. The coast was lit again, the harbour was grateful, and the pact the three of them had sworn on the stair held.',
    'SHORT:',
    'The player relit the last lantern with Arin and Luke and the coast was lit again.',
    'CONSEQUENCES:',
    'PEOPLE:',
    '- Arin: proud of the player and of the lit coast.',
    '- Luke: keeps the lamp burning and honours the pact.',
    'OPEN:',
  ].join('\n'),
];

export const DEFAULT_SAGA_REPLY = 'The wind still came off the sea, but the harbour no longer feared the dark. It had begun on a night when the lanterns guttered and the boats could not find the channel, and it had ended with a beam sweeping the water from the top of the old tower. Arin had been there from the first evening, standing by the lamp posts on the quay and speaking plainly about what the failing lights meant for the boats. Luke had come next, honest about the empty oil stores and the keeper whose ledger nobody could find. Together they searched the sheds, asked the night watch what they had seen, and followed the trail of spilled oil until the ledger was found and the lamplighters trusted the player at last. Then came the long climb. At every landing they checked the old wicks and the empty jars, and at the top they found the great lamp cold, its glass cracked but whole enough to burn. Luke filled the reservoir, Arin held the frame against the gusts, and the player struck the light. The flame caught and the lens turned. Out on the water the boats turned toward the channel, one after another, and the coast was lit again. In the weeks that followed the harbour remembered who had climbed the stair. Arin spoke of it on the quay, Luke kept the lamp burning through every storm, and the pact the three of them had sworn on the stair was never broken.';

const SEAL_STEP = (step: Record<string, unknown>) => typeof step.eval === 'string' && step.eval.includes('the final chapter did not seal');

export const SAGA_CONTEXT_EVAL = "const s = globalThis.__soPromptBatch; if (!s) throw new Error('prompt-batch recorder missing'); s.armed = false; const rt = globalThis.storyOrchestratorRuntime; const ctx = SillyTavern.getContext(); const chapters = rt.extras.memory.chapters ?? []; const final = chapters.find((entry) => entry.final === true) ?? null; s.context = JSON.parse(JSON.stringify({ records: chapters, playerName: String(ctx.name1 ?? '').trim(), epilogue: final?.epilogue ?? null, status: final?.status ?? null, blackboardAt: final?.blackboardAt ?? null })); return { context: true, chapters: chapters.length, epilogueWords: String(final?.epilogue ?? '').trim().split(/\\s+/).filter(Boolean).length };";

interface SagaSpec { file: string; story: unknown; repeat: number; longRepeat: number; recordReplies: string[]; sagaReply: string }

export function sagaPlan(spec: Pick<SagaSpec, 'recordReplies' | 'sagaReply'>): RecorderPlan {
  return {
    rules: [
      { id: 'saga', source: SAGA_RULES.saga, replies: [backendJson(`${THOUGHT}The harbour lanterns guttered in the wind, and the story of how they were relit began`, { stop: true, stopped_eos: false, stopped_limit: true, stop_type: 'limit' }), backendJson(`${THOUGHT}${spec.sagaReply}`)] },
      { id: 'record', source: SAGA_RULES.record, replies: spec.recordReplies.map((reply) => backendJson(`${THOUGHT}${reply}`)) },
      { id: 'map', source: SAGA_RULES.map, replies: [backendJson(`${THOUGHT}- The lanterns failed and the player went to find out why.`)] },
      { id: 'era', source: SAGA_RULES.era, replies: [backendJson(`${THOUGHT}The player relit the harbour's lanterns with Arin and Luke.`)] },
    ],
    canned: OTHER_REPLY,
  };
}

async function captureSaga(ctx: CaptureContext): Promise<CaptureResult> {
  const kit2 = await loadScenarioKit();
  const { captureVariant, runScenarioItem } = await import('./promptBatchScenario.mts');
  const [unit] = ctx.items;
  const spec = unit.spec as SagaSpec;
  const scenario = await readJson<{ steps: Array<Record<string, unknown>> }>(spec.file);
  const variant = captureVariant(scenario, {
    armBefore: (_step, index) => index === 0, contextAfter: SEAL_STEP, contextEval: SAGA_CONTEXT_EVAL, truncate: true,
    edits: [{ step: SEAL_STEP, from: 'i < 300', to: 'i < 20' }], sourceDir: dirname(spec.file),
    note: 'so-prompt-batch saga capture variant of test/scenarios/live-v28-45-seal.json up to the final seal: every model call answered by the recorder (chapter records and epilogue canned), no model.',
  });
  const run = await runScenarioItem(ctx.page, join(ctx.out, 'variants', 'saga-seal.json'), variant as never, sagaPlan(spec), { reload: false });
  const bodies = new Map<string, string>();
  const problems: string[] = [];
  if (!run.stepsOk) problems.push(`${run.notRunnable ? 'not runnable' : 'scenario'}: ${run.error}`);
  const sagaCalls = run.calls.filter((call) => call.rule === 'saga');
  const frozen = sagaCalls.flatMap((call) => { try { return [freezeRequest(call)]; } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); return []; } });
  const distinct = [...new Map(frozen.map((entry) => [entry.sha, entry])).values()];
  const normal = distinct[0] ?? null;
  const long = distinct[1] ?? null;
  if (!normal) problems.push('no epilogue request was made');
  if (distinct.length > 2) problems.push(`${distinct.length} distinct epilogue bodies (at most 2 expected: the ask and its larger-token retry)`);
  const context = run.context as { records: Array<Record<string, unknown>>; playerName: string; epilogue: string | null; status: string | null; blackboardAt: Record<string, unknown> | null } | null;
  if (!context?.records?.length) problems.push('no chapter records captured');
  let selfCheck: { ok: boolean; detail?: string } | null = null;
  let builderInBody: boolean | null = null;
  let contextSha: string | null = null;
  const tokens = (entry: { body: string } | null) => (entry ? (JSON.parse(entry.body) as { n_predict?: number; max_tokens?: number }).n_predict ?? (JSON.parse(entry.body) as { max_tokens?: number }).max_tokens ?? null : null);
  if (normal && context?.records?.length) {
    const cast = await kit2.sagaCast(spec.story, context.playerName);
    const full = { story: spec.story, records: context.records, cast, blackboardAt: context.blackboardAt ?? {}, playerName: context.playerName };
    const offline = await kit2.sagaPrompt(full);
    builderInBody = distinct.every((entry) => promptOf(entry.body).includes(offline.prompt));
    if (!builderInBody) problems.push('the offline-rebuilt epilogue prompt is not inside every epilogue body');
    const reply = ctx.kit.textCompletionReply(JSON.parse(backendJson(`${THOUGHT}${spec.sagaReply}`)), ctx.instruct);
    const verdict = kit2.sagaVerdict(reply.ok ? reply.text : '', reply.finish, full);
    const pageAccepted = typeof context.epilogue === 'string' && context.epilogue === verdict.reply;
    selfCheck = verdict.accepted === pageAccepted ? { ok: true } : { ok: false, detail: `offline verifySaga says ${verdict.accepted ? 'accepted' : `refused (${verdict.reasons.join('; ')})`}, the page ${pageAccepted ? 'kept the canned epilogue' : 'fell back'}` };
    if (!selfCheck.ok) problems.push(`self-check: ${selfCheck.detail}`);
    const contextText = `${JSON.stringify(full)}\n`;
    contextSha = sha256(contextText);
    await mkdir(join(ctx.out, 'contexts'), { recursive: true });
    await writeFile(join(ctx.out, 'contexts', `${contextSha}.json`), contextText, 'utf-8');
  }
  for (const entry of distinct) bodies.set(entry.sha, entry.body);
  const flow = run.calls.map((call) => call.rule ?? 'other');
  const shared = { calls: sagaCalls.length, builderInBody, selfCheck, inPage: { contextSha, flow, maxTokens: { normal: tokens(normal), long: tokens(long) }, status: context?.status ?? null, refused: modelRefusals(run.refused).map((call) => call.url), ...(run.stepsOk && !run.ok ? { cleanupWarning: run.error } : {}) }, ...(problems.length ? { problem: problems.join('; ') } : {}) };
  const rows: BatchItem[] = [
    ...Array.from({ length: spec.repeat }, (_, index): BatchItem => ({ id: `saga#${index + 1}`, sha: normal?.sha ?? null, path: normal?.path ?? null, meta: { kind: 'saga', sample: index + 1 }, ...shared })),
    ...(long ? Array.from({ length: spec.longRepeat }, (_, index): BatchItem => ({ id: `saga-long#${index + 1}`, sha: long.sha, path: long.path, meta: { kind: 'saga-long', sample: index + 1 }, ...shared })) : []),
  ];
  ctx.log(`${problems.length ? 'FAIL' : 'ok  '} saga ${normal ? normal.sha.slice(0, 12) : '(no call)'}${long ? ` long ${long.sha.slice(0, 12)}` : ''} flow ${flow.join(',')}${problems.length ? ` ${problems.join('; ')}` : ''}`);
  return { rows, bodies };
}

export const SEAL_CALL_BUDGET = 6;

async function scoreSaga(dir: string, manifest: BatchManifest, records: ResponseRecord[], kit: BatchKit) {
  const kit2 = await loadScenarioKit();
  const ok = latestOk(records);
  const first = manifest.items.find((item) => (item.inPage as { contextSha?: string } | null)?.contextSha);
  const contextSha = (first?.inPage as { contextSha?: string } | undefined)?.contextSha;
  if (!contextSha) throw new Error('no captured epilogue context in this batch');
  const context = await contextOf(dir, contextSha) as { records: unknown[]; cast: string[] };
  interface SagaRow { id: string; kind: string; answered: boolean; finish?: Finish; tokens?: ResponseRecord['tokens']; ms?: number; accepted?: boolean; reasons?: string[]; words?: number; invented?: string[]; properNouns?: string[]; replyRefused?: string }
  const results = manifest.items.map((item): SagaRow => {
    const record = ok.get(item.id);
    if (!record) return { id: item.id, answered: false, kind: (item.meta as { kind: string }).kind };
    const reply = kit.textCompletionReply(JSON.parse(record.raw), manifest.route.instruct);
    const verdict = kit2.sagaVerdict(reply.ok ? reply.text : '', reply.finish, context);
    return {
      id: item.id, kind: (item.meta as { kind: string }).kind, answered: true, finish: record.finish, tokens: record.tokens, ms: Math.round(record.ms),
      accepted: verdict.accepted, reasons: reply.ok ? verdict.reasons : [`reply refused before verifySaga: ${reply.message}`], words: verdict.words, invented: verdict.invented, properNouns: verdict.properNouns,
      ...(reply.ok ? {} : { replyRefused: reply.kind }),
    };
  });
  const normals = results.filter((row) => row.kind === 'saga' && row.answered);
  const longs = results.filter((row) => row.kind === 'saga-long' && row.answered);
  const flows: Array<{ attempts: string[]; outcome: 'epilogue' | 'fallback' }> = [];
  let longAt = 0;
  for (let index = 0; index < normals.length; index += 2) {
    const attempts: string[] = [];
    let outcome: 'epilogue' | 'fallback' = 'fallback';
    for (const row of normals.slice(index, index + 2)) {
      attempts.push(row.id);
      if (row.accepted) { outcome = 'epilogue'; break; }
      if (row.finish === 'length' && longs[longAt]) {
        const retry = longs[longAt];
        longAt += 1;
        attempts.push(retry.id);
        if (retry.accepted) { outcome = 'epilogue'; break; }
      }
    }
    flows.push({ attempts, outcome });
  }
  const tally = (key: (row: typeof results[number]) => string[]) => Object.entries(results.flatMap((row) => (row.answered ? key(row) : [])).reduce<Record<string, number>>((acc, reason) => ({ ...acc, [reason]: (acc[reason] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const inPage = (first?.inPage ?? {}) as { flow?: string[]; maxTokens?: unknown };
  return {
    ok: null,
    report: {
      measurement: 'saga', answered: results.filter((row) => row.answered).length, of: results.length, accepted: results.filter((row) => row.accepted).length,
      reasons: tally((row) => (row.reasons ?? []).map((reason) => reason.replace(/: .*/, ''))), invented: tally((row) => row.invented ?? []),
      flows, maxTokens: inPage.maxTokens, sealBudget: { calls: SEAL_CALL_BUDGET, captureFlow: inPage.flow, note: 'one seal run shares the budget across its record writes (2 attempts, each with a larger-token retry on a cut) and the epilogue; a spent budget makes the epilogue ask return "" and the fallback follows' },
      results,
    },
  };
}

export const saga: Measurement & { capture: (ctx: CaptureContext) => Promise<CaptureResult> } = {
  id: 'saga',
  synthetic: true,
  roles: ['synthesis', 'read'],
  pinMemory: true,
  async plan(args) {
    const replies = text(args, 'record-replies');
    const recordReplies = replies ? await readJson<string[]>(replies) : DEFAULT_RECORD_REPLIES;
    if (!Array.isArray(recordReplies) || !recordReplies.length || recordReplies.some((entry) => typeof entry !== 'string')) throw new Error('--record-replies must name a JSON array of chapter-record reply texts');
    const sagaReply = text(args, 'saga-reply') ? await readFile(text(args, 'saga-reply') as string, 'utf-8') : DEFAULT_SAGA_REPLY;
    const repeat = Number(text(args, 'repeat') ?? '4');
    const longRepeat = Number(text(args, 'long-repeat') ?? '1');
    if (!(repeat >= 1 && longRepeat >= 0)) throw new Error('--repeat >= 1, --long-repeat >= 0');
    const story = await readJson<unknown>(SAGA_STORY);
    return [{ id: 'saga', kind: 'scenario', canned: '', spec: { file: SAGA_FIXTURE, story, repeat, longRepeat, recordReplies, sagaReply } satisfies SagaSpec, meta: {} }];
  },
  keep: (result) => result,
  async selfCheck() { return { ok: true }; },
  capture: captureSaga,
  score: (dir, manifest, records, kit) => scoreSaga(dir, manifest, records, kit),
};

export const hasContexts = (dir: string) => existsSync(join(dir, 'contexts'));
