import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEntry, REPO_ROOT } from './bundleEntry.mts';
import { askSol, SOL_MODEL, type ModelReply } from './e0LabelRun.mts';

export const FRONTIERS_FORMAT = 'so-scene-frontiers/1';
export const LOCK_FORMAT = 'so-scene-frontiers-lock/1';
export const DRAFT_FORMAT = 'so-scene-replay/1';
export const FRONTIERS_FILE = join(REPO_ROOT, 'test', 'measurements', 'v2.8', '48-scene-test', 'frontiers.json');
export const LOCK_FILE = join(REPO_ROOT, 'test', 'measurements', 'v2.8', '48-scene-test', 'frontiers.lock.json');
export const OUTCOMES = ['expected', 'altered', 'interrupt'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const ROUTE = { harness: 'opencode', model: SOL_MODEL, via: 'opencode run --standalone, tools off (askSol)' } as const;

export type Asker = (prompt: string, workDir: string) => Promise<ModelReply>;

export interface Frontier {
  id: string;
  story: Record<string, any>;
  frontierId: string;
  state: { visitedPath: string[]; values: Record<string, any> };
  inputs: { canon: string; openThreads: string[]; resolvedThreads: string[]; plans: string[]; refused: string | null; playerNames: string[]; tension: string | null };
  ids: { chatId: string; storyId: string };
  plannedAt: number;
}

export interface FrontierSet { format: string; plan: string; synthetic: boolean; frontiers: Frontier[] }

export const loadSceneModule = () => loadEntry<any>('scripts/debug/lib/sceneReplayEntry.ts');

export const frontierDigest = (set: unknown): string => createHash('sha256').update(JSON.stringify(set)).digest('hex');

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');
  await rename(temp, file);
}

export function checkFrontierSet(raw: unknown): FrontierSet {
  const set = raw as FrontierSet;
  if (!set || set.format !== FRONTIERS_FORMAT) throw new Error(`frontiers file is not ${FRONTIERS_FORMAT}`);
  if (set.synthetic !== true) throw new Error('frontiers file: the set must be synthetic (no campaign content)');
  if (!Array.isArray(set.frontiers) || !set.frontiers.length) throw new Error('frontiers file: no frontiers');
  const ids = new Set<string>();
  for (const frontier of set.frontiers) {
    if (typeof frontier?.id !== 'string' || ids.has(frontier.id)) throw new Error(`frontiers file: bad or repeated id ${JSON.stringify(frontier?.id)}`);
    ids.add(frontier.id);
    if (!frontier.story || typeof frontier.frontierId !== 'string' || !Array.isArray(frontier.inputs?.openThreads) || !frontier.inputs.openThreads.length) {
      throw new Error(`frontiers file: ${frontier.id} needs story, frontierId and at least one open thread`);
    }
  }
  return set;
}

export function freezeRecord(set: FrontierSet, file: string) {
  return { format: LOCK_FORMAT, file: file.replace(/\\/g, '/').replace(`${REPO_ROOT.replace(/\\/g, '/')}/`, ''), frontiers: set.frontiers.length, sha256: frontierDigest(set) };
}

export function frozenRefusal(set: FrontierSet, lock: { format?: string; sha256?: string; frontiers?: number } | null): string | null {
  if (!lock || lock.format !== LOCK_FORMAT || typeof lock.sha256 !== 'string') return `refused: no ${LOCK_FORMAT} lock`;
  const now = frontierDigest(set);
  if (now !== lock.sha256) return `refused: the frontier set changed since it was frozen (sha256 ${now}, frozen ${lock.sha256})`;
  if (set.frontiers.length !== lock.frontiers) return `refused: ${set.frontiers.length} frontiers, frozen ${lock.frontiers}`;
  return null;
}

export async function loadFrozen(file = FRONTIERS_FILE, lockFile = LOCK_FILE): Promise<{ set: FrontierSet; sha256: string }> {
  const set = checkFrontierSet(await readJson(file));
  const refused = frozenRefusal(set, existsSync(lockFile) ? await readJson(lockFile) : null);
  if (refused) throw new Error(refused);
  return { set, sha256: frontierDigest(set) };
}

export function prepareFrontier(mod: any, frontier: Frontier) {
  const story = mod.parseStoryOrThrow(frontier.story);
  const engine = new mod.StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const base = engine.serialize();
  const state = { ...base, visitedPath: frontier.state.visitedPath, blackboard: { ...base.blackboard, values: { ...base.blackboard.values, ...frontier.state.values } } };
  const inputs = { ...frontier.inputs, restatesSecret: () => false, scrub: (text: string) => text };
  return { story, state, inputs };
}

export function forcedSceneRecord(mod: any, frontier: Frontier, story: any, outcome: Outcome) {
  const threads = mod.focusCandidates({ arcs: frontier.inputs.openThreads, unknownNames: [] }).filter((candidate: any) => candidate.kind === 'arc');
  const parts = (tag: string) => mod.sceneDrawParts(frontier.ids, frontier.frontierId, frontier.plannedAt, tag);
  const focus = outcome === 'interrupt' ? mod.focusPick(threads, mod.unitDraw(parts(`${mod.SCENE_DRAW_TAG}:focus`)))?.text : undefined;
  return {
    frontierId: frontier.frontierId, plannedAt: frontier.plannedAt, messageId: frontier.plannedAt * 2, chaos: null, p: null, unit: null, drawn: outcome, applied: outcome, forced: true,
    ...(focus ? { focus } : {}), expected: { from: story.checkpointById[frontier.frontierId]?.name ?? frontier.frontierId, thread: threads.at(-1)?.text ?? null },
  };
}

export function directorInputFor(mod: any, frontier: Frontier, outcome: Outcome) {
  const { story, state, inputs } = prepareFrontier(mod, frontier);
  const record = forcedSceneRecord(mod, frontier, story, outcome);
  const input = mod.directorInput({ story, raw: frontier.story, frontierId: frontier.frontierId, state, sealsOn: true, inputs, model: null, debugResponse: null, sceneTest: record });
  return { story, state, inputs, record, input };
}

export function buildDirectorPrompt(mod: any, frontier: Frontier, outcome: Outcome): string {
  const { story, state, input } = directorInputFor(mod, frontier, outcome);
  return mod.renderDirectorPrompt({ ...input, ending: mod.endingFor(story, state.blackboard.values) });
}

const FRONTIER_LINE = /^The current turning point \(the new one follows it\): "([^"]+)"/m;
const FOCUS_LINE = /advances the open thread "([^"]+)"/;
const OPEN_LINE = /Threads the player has opened and is still pursuing \(build on one of these first\):\n- ([^\n]+)/;

export function plumbingAnswer(prompt: string): string {
  if (prompt.startsWith('Review one generated turning point')) return JSON.stringify({ pass: true, issues: [] });
  const scene = /Scene signal: altered/.test(prompt) ? { changed: 'timing' }
    : /Scene signal: interrupt/.test(prompt) ? { advances: FOCUS_LINE.exec(prompt)?.[1] ?? OPEN_LINE.exec(prompt)?.[1] ?? '' } : {};
  const after = FRONTIER_LINE.exec(prompt)?.[1] ?? 'the scene';
  return JSON.stringify({
    name: 'A Knock Before Dawn', objective: `A runner arrives before dawn with word that things at ${after} have shifted.`, tension: 'stirring', snapshot: {},
    opens_when: { new: { key: 'runner_heard', rubric: 'Has anyone heard the runner out?' } }, new_qualities: [], builds_on: null, new_chapter: false, chapter_title: null, final: false,
    reason: 'plumbing answer, never a measurement', ...scene,
  });
}

export const plumbingAsk: Asker = async (prompt) => ({ text: plumbingAnswer(prompt), model: 'plumbing' });

export const solAsk: Asker = (prompt, workDir) => askSol(prompt, workDir);

const draftView = (draft: any) => (draft ? { name: draft.anchor.name, objective: draft.anchor.objective, ...(draft.changed ? { changed: draft.changed } : {}), ...(draft.advances ? { advances: draft.advances } : {}) } : null);

export function analyseAttempts(mod: any, ctx: { story: any; raw: any; frontierId: string; values: any; latched: any; input: any; playerNames: string[] }, calls: Array<{ pass: string; text: string }>, outcome: any) {
  const ending = mod.endingFor(ctx.story, ctx.values);
  const directorCalls = calls.map((call, index) => ({ ...call, index })).filter((call) => call.pass !== 'critic');
  return directorCalls.map((call, at) => {
    const next = directorCalls[at + 1];
    const critic = calls.slice(call.index + 1, next ? next.index : calls.length).find((entry) => entry.pass === 'critic') ?? null;
    const parsed = mod.parseDirectorDraft(call.text, ctx.story);
    if (!parsed.ok) return { attempt: at + 1, stage: 'parse', parse: { ok: false, issues: parsed.issues }, ops: [], guard: [], scene: [], critic: null, narrated: false, draft: null };
    const draft = { ...parsed.draft, anchor: { ...parsed.draft.anchor, final: ending.finalRequired || (ending.finalAllowed && parsed.draft.anchor.final) } };
    const plan = mod.planChapter(ctx.story, ctx.frontierId, { sealsOn: true, final: draft.anchor.final, newChapter: draft.newChapter, title: draft.chapterTitle });
    const built = mod.buildDirectorOps(ctx.story, ctx.frontierId, draft, plan);
    const answer = { changed: draft.changed, advances: draft.advances };
    const checked = mod.checkDirectorOps({ raw: ctx.raw, story: ctx.story, frontierId: ctx.frontierId, ops: built.ops, values: ctx.values, latched: ctx.latched, scene: { signal: ctx.input.sceneTest, answer, threads: ctx.input.openThreads } });
    const guard = mod.guardDraft(draft, { playerNames: ctx.playerNames, restatesSecret: () => false });
    const scene = mod.sceneAnswerIssues(ctx.input.sceneTest, answer, ctx.input.openThreads);
    const narrated = mod.narratesPlayer(draft.anchor.objective, ctx.playerNames) || mod.narratesPlayer(draft.anchor.name, ctx.playerNames);
    const ops = [...built.issues, ...checked.issues];
    const criticRefused = Boolean(critic) && (Boolean(next) || outcome.status === 'refused');
    const verdict = critic ? mod.parseCriticVerdict(critic.text) : null;
    const stage = ops.length ? 'ops' : guard.length ? 'guard' : criticRefused ? 'critic' : critic || !next ? 'ok' : 'unexplained';
    return {
      attempt: at + 1, stage, parse: { ok: true, issues: [] }, ops, guard, scene, narrated,
      critic: critic ? { refused: criticRefused, pass: verdict?.pass ?? null, issues: verdict?.issues ?? [], raw: critic.text } : null,
      draft: draftView(draft),
    };
  });
}

export async function replayOne(mod: any, frontier: Frontier, outcome: Outcome, ask: Asker, workDir: string) {
  const { story, state, record, input } = directorInputFor(mod, frontier, outcome);
  const calls: Array<{ pass: string; prompt: string; text: string; model: string | null; ms: number }> = [];
  const model = async (prompt: string, request: { pass: string }) => {
    const started = Date.now();
    const reply = await ask(prompt, workDir);
    calls.push({ pass: request.pass, prompt, text: reply.text, model: reply.model, ms: Date.now() - started });
    return { text: reply.text, finish: 'stop', model: reply.model };
  };
  const latched = state.blackboard.latched ?? {};
  const playerNames = frontier.inputs.playerNames;
  const result = await mod.runDirector({
    story, raw: frontier.story, frontierId: frontier.frontierId, values: state.blackboard.values, latched, sealsOn: true, input,
    guard: { playerNames, restatesSecret: () => false }, critic: true,
  }, model, { role: 'authoring', pass: 'living', debugResponse: null, refuseIncomplete: true });
  const attempts = analyseAttempts(mod, { story, raw: frontier.story, frontierId: frontier.frontierId, values: state.blackboard.values, latched, input, playerNames }, calls, result);
  const lastParsed = [...attempts].reverse().find((attempt) => attempt.draft);
  const delivered = result.status === 'ok' ? { ...draftView(result.draft), accepted: true } : lastParsed ? { ...lastParsed.draft, accepted: false } : null;
  return {
    status: result.status, attempts, calls, record, signal: input.sceneTest ? mod.sceneSignalLine(input.sceneTest) : null,
    refusal: result.status === 'refused' ? { stage: result.refusal.stage, issues: result.issues } : null, delivered,
  };
}

export const draftFile = (out: string, run: number, frontierId: string, outcome: Outcome) => join(out, `run${run}`, 'drafts', `${frontierId}-${outcome}.json`);

export interface ReplayOptions { out: string; run: number; plumbing: boolean; ask?: Asker; only?: string[]; outcomes?: readonly Outcome[]; frontiersFile?: string; lockFile?: string; log?: (line: string) => void }

export async function replayAll(options: ReplayOptions) {
  const log = options.log ?? console.log;
  if (![1, 2].includes(options.run)) throw new Error('--run must be 1 or 2');
  const { set, sha256 } = await loadFrozen(options.frontiersFile, options.lockFile);
  const mod = await loadSceneModule();
  const ask = options.ask ?? (options.plumbing ? plumbingAsk : solAsk);
  const dir = join(options.out, `run${options.run}`, 'drafts');
  const workDir = join(options.out, 'work');
  await mkdir(dir, { recursive: true });
  await mkdir(workDir, { recursive: true });
  const counts = { written: 0, kept: 0, failed: 0 };
  for (const frontier of set.frontiers.filter((entry) => !options.only?.length || options.only.includes(entry.id))) {
    for (const outcome of options.outcomes ?? OUTCOMES) {
      const file = draftFile(options.out, options.run, frontier.id, outcome);
      if (existsSync(file)) {
        const held = await readJson(file);
        if (held.plumbing !== options.plumbing) throw new Error(`refused: ${file} is ${held.plumbing ? 'plumbing' : 'a real run'}; do not mix modes in one --out`);
        if (held.frontiersSha256 !== sha256) throw new Error(`refused: ${file} was replayed on another frontier set`);
        counts.kept += 1;
        continue;
      }
      try {
        const replay = await replayOne(mod, frontier, outcome, ask, workDir);
        await writeJsonAtomic(file, {
          format: DRAFT_FORMAT, plan: 'v2.8 48', run: options.run, frontierId: frontier.id, outcome, synthetic: true, plumbing: options.plumbing,
          ...(options.plumbing ? { note: 'plumbing: canned answers, no model call, never a measurement' } : {}),
          route: options.plumbing ? { harness: 'plumbing', model: null } : ROUTE, frontiersSha256: sha256, at: new Date().toISOString(), ...replay,
        });
        counts.written += 1;
        log(`${frontier.id} ${outcome}: ${replay.status} after ${replay.attempts.length} attempt(s)`);
      } catch (error) {
        counts.failed += 1;
        log(`${frontier.id} ${outcome}: failed (${error instanceof Error ? error.message : String(error)}); rerun to resume`);
      }
    }
  }
  return { run: options.run, plumbing: options.plumbing, frontiersSha256: sha256, ...counts };
}

export async function readDrafts(out: string, run: number): Promise<any[]> {
  const dir = join(out, `run${run}`, 'drafts');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map((file) => readJson(join(dir, file))));
}
