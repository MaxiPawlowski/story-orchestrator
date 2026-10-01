import { execFile, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredStRoot, lanesRootFor, REPO_ROOT } from '../lib/stRoot.mjs';
import {
  comfyRefusal, nextSessionNumber, renderCard, renderCardsDocument, rubricProblems, rubricTemplate, settingsPatch, storyEntry, validateCardDoc,
  type Card, type CardDoc, type Premise, type StoryIndex, type StoryIndexEntry,
} from './lib/sessionCharters.mts';
import { digestSession, parseJsonl, parseLines, registerRows, renderFindings, type ChatMessage } from './lib/sessionDigest.mts';
import { DEFAULT_LANES, laneFor, planLanes, reseedRefusal, type LanePlan, type SessionOnLane } from './lib/sessionLanes.mts';
import { LIVE_VERBS, type LiveChat, type LiveRequest, type LiveVerb } from './lib/sessionDriver.mts';
import { DEFAULT_MAIN_PROFILE, DEFAULT_ORCHESTRATOR, judgeExpectation, pinVerdict } from './lib/sessionPin.mts';
import { scoreRow } from './lib/sessionRubric.mts';
import { meterSession, updateBudgetDocument, type BudgetRow } from './lib/sessionSpend.mts';
import { renderRunbook } from './lib/sessionRunbook.mts';

const USAGE = `Usage: node scripts/debug/so-session.mts <command> [...]

v2.6 plan 14: one human play session per charter card, on its own adolion-fresh lane, headed.

  start <charterId> [--lane n] [--profile <name>] [--orchestrator <regex>] [--age <hours>]
        [--allow-comfy] [--no-seed] [--force-waiting]
      seed the lane with adolion-fresh (images and sprites off unless the card asks; refused when
      the lane holds a chat a later card continues), apply the card's settings, pin the routing
      (main profile selected and probed, every orchestrator role on DeepSeek, judge state and key,
      reasoning), open its story in a fresh chat (or the chat it continues; --age backdates it so
      the away recap fires), capture a run header, start the journal, payload and console tails,
      write test/sessions/<tier>/<charterId>-<n>/session.json and print the card. Without --lane
      a fresh card takes its lane from test/sessions/lane-plan.json (see plan).
  turn <dir> "<line>" [--chat id] [--timeout-ms n] [--no-expect-reply]
      one real turn: send, wait for the reply(ies) and the scheduler, append to turns.jsonl
  swipe-new <dir> | regen <dir> | edit <dir> <mesid|last> "<text>" | delete <dir> <mesid|last>
  switch-chat-mid-gen <dir> "<line>" --to <chatId> | reload-mid-gen <dir> "<line>"
      mutations: each records what it did and the rollback the product performed in turns.jsonl
  flag <dir> "<note>" [--via drawer|slash]   press the drawer flag (or /story flag)
  shot <dir> <label>                         screenshot into <dir>/shots/
  age <dir> <hours>                          backdate the open chat's last session and reload it
  adopt <dir>                                record the open chat as the session's chat (wizard cards)
  score <dir> <row|n> <works|annoying|broken|not-noticed> "<note>" --evidence <path:line|png> ...
  score <dir> <row|n> --record "<note>" --evidence ...   (rows recorded for the user's review)
  stop [<dir>] [--stop-lane]   capture the end state (full chat, memory, chapters, canon, queue,
                               model and judge calls, stagecraft, talk, inline, snapshot), check
                               the player surface, diff the run header, stop the tails, meter the
                               spend into session.json and test/sessions/BUDGET.md, write rubric.json
  digest [<dir>]               write findings.md + findings.json (flags with context, anomalies)
  plan [--lanes 1,2,3,4] [--only T0-1,...] [--write]   assign charters to lanes, continuations pinned
  budget                       rebuild test/sessions/BUDGET.md from every stopped session
  runbook [--write|--check]    render docs/plans/v2.6/14-autonomous-runbook.md from the cards and the lane plan
  cards [--write|--check]      render every card to docs/plans/v2.6/14-cards.md
  validate                     check test/sessions/charters.json against the story index
  index                        rebuild test/sessions/adolion-stories.json from the pinned campaign`;

export const SESSIONS_ROOT = resolve(REPO_ROOT, 'test', 'sessions');
export const CHARTERS_PATH = resolve(SESSIONS_ROOT, 'charters.json');
export const INDEX_PATH = resolve(SESSIONS_ROOT, 'adolion-stories.json');
export const CARDS_DOC_PATH = resolve(REPO_ROOT, 'docs', 'plans', 'v2.6', '14-cards.md');
export const RUNBOOK_PATH = resolve(REPO_ROOT, 'docs', 'plans', 'v2.6', '14-autonomous-runbook.md');
const PIN_FILE = resolve(REPO_ROOT, 'scripts', 'debug', 'adolion-fresh.pin.json');
export const LANE_PLAN_PATH = resolve(SESSIONS_ROOT, 'lane-plan.json');
export const BUDGET_PATH = resolve(SESSIONS_ROOT, 'BUDGET.md');
export const PREMISES_PATH = resolve(REPO_ROOT, 'test', 'measurements', '11', 'premises.json');
export const TURNS_FILE = 'turns.jsonl';
const TAILS = ['journal', 'payloads', 'console'] as const;

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));
export const loadIndex = async (): Promise<StoryIndex> => readJson(INDEX_PATH);
export const loadCards = async (): Promise<CardDoc> => readJson(CHARTERS_PATH);
export const loadPremises = async (): Promise<Premise[]> => (await readJson(PREMISES_PATH)).premises ?? [];
const rel = (path: string) => relative(REPO_ROOT, path).replace(/\\/g, '/');

const laneInfo = (n: number) => {
  const root = resolve(lanesRootFor(process.env, REPO_ROOT), String(n));
  return { root, debug: resolve(root, 'debug'), url: `http://127.0.0.1:${8100 + n}/`, env: { ST_URL: `http://127.0.0.1:${8100 + n}/`, ST_DEBUG_CDP_PORT: String(9300 + n), SO_DEBUG_DIR: resolve(root, 'debug'), SO_LANE: String(n) } };
};

const run = (args: string[], env: Record<string, string> = {}, echo = false) => new Promise<{ code: number; output: string }>((done) => {
  const child = spawn(process.execPath, args, { cwd: REPO_ROOT, env: { ...process.env, ...env }, windowsHide: true });
  let output = '';
  const take = (chunk: Buffer) => { output += chunk; if (echo) process.stdout.write(chunk); };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('close', (code) => done({ code: code ?? 1, output }));
});

const must = async (label: string, args: string[], env: Record<string, string> = {}, echo = false) => {
  const result = await run(args, env, echo);
  if (result.code !== 0) throw new Error(`${label} failed (exit ${result.code}): ${result.output.slice(-1500)}`);
  return result.output;
};

const inLane = (n: number, args: string[], extra: Record<string, string> = {}, echo = false) => run(args, { ...laneInfo(n).env, ...extra }, echo);

function spawnTail(n: number, args: string[], logPath: string, extra: Record<string, string>) {
  const fd = openSync(logPath, 'a');
  const child = spawn(process.execPath, args, { cwd: REPO_ROOT, env: { ...process.env, ...laneInfo(n).env, ...extra }, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
  child.unref();
  return child.pid ?? null;
}

const killTree = (pid: number) => new Promise<void>((done) => {
  if (process.platform === 'win32') execFile('taskkill.exe', ['/pid', String(pid), '/t', '/f'], () => done());
  else { try { process.kill(pid, 'SIGTERM'); } catch {} done(); }
});

const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function servedBuild() {
  const stRoot = configuredStRoot(process.env, REPO_ROOT);
  const path = stRoot ? resolve(stRoot, 'public', 'scripts', 'extensions', 'third-party', 'story-orchestrator', 'dist', 'manifest.json') : null;
  const manifest = path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null;
  return {
    flavor: manifest?.flavor ?? null, bundleSha256: manifest?.bundle?.sha256 ?? null, version: manifest?.extension?.version ?? null,
    builtAt: manifest?.builtAt ?? null, sourceSha256: manifest?.source?.sha256 ?? null,
  };
}

export function findCard(doc: CardDoc, id: string): Card {
  const card = doc.cards.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase());
  if (!card) throw new Error(`no charter "${id}" in ${rel(CHARTERS_PATH)} (have ${doc.cards.map((candidate) => candidate.id).join(', ')})`);
  return card;
}

async function sessionDirsOf(tier: string, id: string) {
  const dir = resolve(SESSIONS_ROOT, tier);
  if (!existsSync(dir)) return [] as string[];
  return (await readdir(dir)).filter((name) => new RegExp(`^${id}-\\d+$`).test(name)).sort((a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop()));
}

async function latestSession(card: Card) {
  const dirs = await sessionDirsOf(card.tier, card.id);
  for (const name of dirs.reverse()) {
    const path = resolve(SESSIONS_ROOT, card.tier, name, 'session.json');
    if (existsSync(path)) return { dir: resolve(SESSIONS_ROOT, card.tier, name), session: await readJson(path) };
  }
  return null;
}

export interface StartOptions {
  lane: number | null; allowComfy: boolean; seed: boolean; planned?: number | null; forceWaiting?: boolean;
  profile?: string; orchestrator?: string; age?: number | null;
}

export function planStart(doc: CardDoc, index: StoryIndex, card: Card, options: StartOptions, previous: { session: any } | null, sessions: SessionOnLane[] = []) {
  const refusal = comfyRefusal(card, options.allowComfy);
  if (refusal) return { refused: refusal } as const;
  if (card.waits && !options.forceWaiting) return { refused: `${card.id} waits: ${card.waits} Start it with --force-waiting only once that exists.` } as const;
  const continuing = card.setup.chat === 'continue';
  if (continuing && !previous) return { refused: `${card.id} continues ${card.setup.continues}, and no ${card.setup.continues} session exists yet: play that one first.` } as const;
  if (options.age !== null && options.age !== undefined && !continuing) return { refused: `--age backdates the chat a card continues; ${card.id} plays a fresh chat.` } as const;
  const lane = options.lane ?? (continuing ? Number(previous!.session.lane) : options.planned ?? 1);
  if (!Number.isInteger(lane) || lane < 1 || lane > 50) return { refused: `lane must be 1..50 (lane 0 is the user's), got ${String(options.lane)}` } as const;
  if (continuing && previous && Number(previous.session.lane) !== lane) return { refused: `${card.id} continues the ${card.setup.continues} chat on lane ${previous.session.lane}; start it there (or drop --lane).` } as const;
  const seed = options.seed && !continuing;
  const reseed = seed ? reseedRefusal(doc, lane, sessions, card.id) : null;
  if (reseed) return { refused: reseed } as const;
  const entry = storyEntry(card, index);
  const also = card.setup.also ? index.stories[card.setup.also] : null;
  const carried = continuing ? sessionChat(previous!.session, null) : null;
  if (continuing && !carried) return { refused: `${card.setup.continues} recorded no chat to continue${card.story.kind === 'wizard' ? ': run so-session adopt on its session once the wizard story\'s chat is open' : ''}.` } as const;
  return {
    refused: null,
    lane,
    seed,
    pin: { profile: options.profile ?? DEFAULT_MAIN_PROFILE, orchestrator: options.orchestrator ?? DEFAULT_ORCHESTRATOR.source, judge: judgeExpectation(card.setup.settings?.judge ?? 'defaults') },
    age: continuing ? options.age ?? null : null,
    open: {
      kind: card.story.kind,
      storyId: card.story.id ?? null,
      group: carried?.group ?? entry?.group ?? null,
      start: entry?.start ?? null,
      select: card.setup.select ?? 'auto',
      continueChat: carried?.chatId ?? null,
      startAt: continuing ? null : card.setup.startAt ?? null,
      seed: continuing ? {} : card.setup.seed ?? {},
      chats: card.setup.chats ?? 1,
      also: also ? { storyId: card.setup.also!, group: also.group } : null,
      authorView: card.setup.mode === 'author',
      premise: card.story.kind === 'wizard' ? { id: card.story.premiseId ?? null, text: card.story.premise ?? null } : null,
    },
    patch: settingsPatch(card.setup.settings),
    viewport: card.setup.settings?.viewport ?? null,
  } as const;
}

async function start(id: string, options: StartOptions) {
  const [doc, index, premises] = await Promise.all([loadCards(), loadIndex(), loadPremises()]);
  const problems = validateCardDoc(doc, index, premises);
  if (problems.length) throw new Error(`charters.json is invalid:\n- ${problems.join('\n- ')}`);
  const card = findCard(doc, id);
  const previous = card.setup.chat === 'continue' ? await latestSession(findCard(doc, card.setup.continues!)) : null;
  const lanePlan: LanePlan | null = existsSync(LANE_PLAN_PATH) ? await readJson(LANE_PLAN_PATH) : null;
  const sessions = (await allSessions()).map(({ session }) => session as SessionOnLane);
  const plan = planStart(doc, index, card, { ...options, planned: laneFor(lanePlan, card.id) }, previous, sessions);
  if (plan.refused) { console.error(plan.refused); process.exitCode = 2; return null; }
  const number = nextSessionNumber(await sessionDirsOf(card.tier, card.id), card.id);
  const dir = resolve(SESSIONS_ROOT, card.tier, `${card.id}-${number}`);
  const lane = laneInfo(plan.lane);
  const viewportEnv: Record<string, string> = plan.viewport ? { ST_DEBUG_VIEWPORT: plan.viewport } : {};
  const sessionProblems: string[] = [];
  console.log(`[1/7] ${card.id} ${card.title} -> ${rel(dir)} on lane ${plan.lane}`);
  if (plan.seed) {
    console.log('[2/7] adolion-fresh seed (headed); images and sprites stay off until the card settings');
    await must('adolion-fresh seed', ['scripts/debug/adolion-fresh.mts', 'seed', String(plan.lane), '--headed'], {}, true);
  } else {
    console.log('[2/7] no seed: bring the lane up headed');
    const status = existsSync(resolve(lane.debug, 'session.json')) ? await readJson(resolve(lane.debug, 'session.json')).catch(() => null) : null;
    if (status && status.headed !== true) await inLane(plan.lane, ['scripts/debug/st-session.mts', 'stop']);
    await must('st-lanes start', ['scripts/debug/st-lanes.mts', 'start', String(plan.lane), '--headed']);
  }
  const inventory = resolve(lane.root, 'adolion-fresh', 'inventory-latest.json');
  const laneCommit = existsSync(inventory) ? (await readJson(inventory)).commit ?? null : null;
  if (laneCommit !== index.commit) sessionProblems.push(`lane ${plan.lane} was seeded from ${laneCommit ?? 'an unknown build'}, the story index is ${index.commit}`);
  console.log('[3/7] card settings, reload, pin the routing');
  await mkdir(dir, { recursive: true });
  const planPath = resolve(dir, 'start-plan.json');
  await writeFile(planPath, JSON.stringify({ card: card.id, ...plan }, null, 2), 'utf-8');
  const settings = await inLane(plan.lane, ['scripts/debug/so-session.mts', '_page', 'settings', planPath, resolve(dir, 'page-settings.json')], viewportEnv, true);
  if (settings.code !== 0) throw new Error(`settings phase failed: ${settings.output.slice(-1200)}`);
  const reload = await inLane(plan.lane, ['scripts/debug/st-session.mts', 'reload'], viewportEnv);
  if (reload.code !== 0) throw new Error(`reload failed: ${reload.output.slice(-800)}`);
  const pinned = await inLane(plan.lane, ['scripts/debug/so-session.mts', '_page', 'pin', planPath, resolve(dir, 'page-pin.json')], viewportEnv, true);
  const pin = existsSync(resolve(dir, 'page-pin.json')) ? await readJson(resolve(dir, 'page-pin.json')) : null;
  if (pinned.code !== 0 || !pin?.verdict?.ok) {
    console.error(`routing pin failed, nothing was opened (see ${rel(resolve(dir, 'page-pin.json'))}):\n- ${(pin?.verdict?.problems ?? [pinned.output.slice(-800)]).join('\n- ')}`);
    process.exitCode = 2;
    return null;
  }
  console.log('[4/7] open the story');
  const opened = await inLane(plan.lane, ['scripts/debug/so-session.mts', '_page', 'open', planPath, resolve(dir, 'page-open.json')], viewportEnv, true);
  if (opened.code !== 0) throw new Error(`open phase failed: ${opened.output.slice(-1200)}`);
  const page = await readJson(resolve(dir, 'page-open.json'));
  sessionProblems.push(...(page.problems ?? []));
  let age: unknown = null;
  if (plan.age) {
    const primary = (page.chats ?? []).filter((chat: any) => chat.primary).pop();
    const aged = await liveInLane(plan.lane, viewportEnv, { verb: 'age', dir, chat: primary ? { chatId: primary.chatId, group: primary.group ?? null } : null, args: { hours: plan.age } });
    age = aged;
    await appendTurn(dir, aged);
    if (!aged?.fired) sessionProblems.push(`--age ${plan.age}: the away recap did not fire (${aged?.reason ?? aged?.error ?? 'no recap after the reload'})`);
  }
  const playFrom = new Date().toISOString();
  console.log('[5/7] run header');
  const header = await inLane(plan.lane, ['scripts/debug/so-run-header.mts', 'capture', '--label', `${card.id}-${number}-start`, '--out', resolve(dir, 'run-header-start.json')], viewportEnv);
  if (header.code !== 0) sessionProblems.push(`run header capture failed: ${header.output.slice(-300)}`);
  console.log('[6/7] tails');
  const pids = {
    journal: spawnTail(plan.lane, ['scripts/debug/so-journal.mts', 'follow', '--out', resolve(dir, 'journal.jsonl')], resolve(dir, 'journal.log'), viewportEnv),
    payloads: spawnTail(plan.lane, ['scripts/debug/st-payload.mts', 'arm', '--persist', '--out', resolve(dir, 'payloads.jsonl')], resolve(dir, 'payloads.log'), viewportEnv),
    console: spawnTail(plan.lane, ['scripts/debug/so-session.mts', '_console', resolve(dir, 'console.jsonl')], resolve(dir, 'console.log'), viewportEnv),
  };
  const session = {
    charter: card.id, tier: card.tier, title: card.title, number, dir: rel(dir), lane: plan.lane, laneUrl: lane.url,
    story: card.story, mode: card.setup.mode, startedAt: new Date().toISOString(), playFrom, stoppedAt: null,
    build: { ...servedBuild(), laneCampaign: laneCommit, indexCommit: index.commit }, pids, viewport: plan.viewport, settingsPatch: plan.patch,
    pin: { profile: plan.pin.profile, orchestrator: plan.pin.orchestrator, judge: plan.pin.judge, verdict: pin.verdict, probe: pin.probe, routing: pin.routing },
    age, premise: plan.open.premise,
    chats: page.chats ?? [], continues: card.setup.continues ?? null, problems: sessionProblems,
  };
  await writeFile(resolve(dir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
  console.log(`[7/7] ${rel(resolve(dir, 'session.json'))}${sessionProblems.length ? `\nWARNINGS:\n- ${sessionProblems.join('\n- ')}` : ''}`);
  console.log(`\nDrive it: node scripts/debug/so-session.mts turn ${rel(dir)} "<line>" (lane ${plan.lane}, ${lane.url}). Flag with: flag ${rel(dir)} "<note>". When done: node scripts/debug/so-session.mts stop ${rel(dir)}\n`);
  console.log(renderCard(card, index));
  return session;
}

async function allSessions() {
  const found: Array<{ dir: string; session: any }> = [];
  if (existsSync(SESSIONS_ROOT)) for (const tier of await readdir(SESSIONS_ROOT)) {
    const tierDir = resolve(SESSIONS_ROOT, tier);
    if (!/^T\d$/.test(tier)) continue;
    for (const name of await readdir(tierDir)) {
      const path = resolve(tierDir, name, 'session.json');
      if (existsSync(path)) found.push({ dir: resolve(tierDir, name), session: await readJson(path) });
    }
  }
  return found;
}

async function openSessionDir(arg: string | undefined, wantStopped: boolean | null) {
  if (arg) {
    const dir = resolve(REPO_ROOT, arg);
    if (!existsSync(resolve(dir, 'session.json'))) throw new Error(`${arg} has no session.json`);
    return { dir, session: await readJson(resolve(dir, 'session.json')) };
  }
  const found = await allSessions();
  const eligible = found.filter((entry) => wantStopped === null || Boolean(entry.session.stoppedAt) === wantStopped)
    .sort((a, b) => String(a.session.startedAt).localeCompare(String(b.session.startedAt)));
  const latest = eligible.pop();
  if (!latest) throw new Error(`no ${wantStopped === false ? 'running ' : ''}session under ${rel(SESSIONS_ROOT)}`);
  return latest;
}

export async function readEvidenceFiles(dir: string) {
  const names = existsSync(dir) ? await readdir(dir) : [];
  const out: Record<string, any> = {};
  for (const name of names) {
    const match = /^evidence-(.+)\.json$/.exec(name);
    if (match) out[match[1]] = await readJson(resolve(dir, name));
  }
  return out;
}

export async function meterDir(dir: string, session: any) {
  const evidence = await readEvidenceFiles(dir);
  const payloads = existsSync(resolve(dir, 'payloads.jsonl')) ? parseJsonl(await readFile(resolve(dir, 'payloads.jsonl'), 'utf-8')) : [];
  const modelCalls = Object.values(evidence).flatMap((entry: any) => entry?.slices?.modelCalls ?? []);
  const judgeCalls = Object.values(evidence).flatMap((entry: any) => entry?.slices?.judgeCalls ?? []);
  const orchestratorRoutes = (session.pin?.routing?.roles ?? []).map((role: any) => role.profileId).filter(Boolean);
  const pattern = session.pin?.orchestrator ? new RegExp(session.pin.orchestrator, 'i') : DEFAULT_ORCHESTRATOR;
  return meterSession({ payloads, modelCalls, judgeCalls, playFrom: session.playFrom ?? null, pattern, orchestratorRoutes });
}

export async function writeBudget(budgetPath = BUDGET_PATH) {
  const rows: BudgetRow[] = (await allSessions()).filter(({ session }) => session.spend).map(({ session }) => ({ session: String(session.dir), lane: Number(session.lane), stoppedAt: session.stoppedAt ?? null, spend: session.spend }));
  const current = existsSync(budgetPath) ? await readFile(budgetPath, 'utf-8') : null;
  await writeFile(budgetPath, updateBudgetDocument(current, rows), 'utf-8');
  return rows.length;
}

async function stop(arg: string | undefined, stopLane: boolean) {
  const { dir, session } = await openSessionDir(arg, arg ? null : false);
  const card = findCard(await loadCards(), session.charter);
  const viewportEnv: Record<string, string> = session.viewport ? { ST_DEBUG_VIEWPORT: session.viewport } : {};
  const problems: string[] = [];
  const end = await inLane(session.lane, ['scripts/debug/so-session.mts', '_page', 'end', resolve(dir, 'session.json'), resolve(dir, 'page-end.json')], viewportEnv, true);
  if (end.code !== 0) problems.push(`end phase failed: ${end.output.slice(-600)}`);
  const pageEnd = existsSync(resolve(dir, 'page-end.json')) ? await readJson(resolve(dir, 'page-end.json')) : {};
  problems.push(...(pageEnd.problems ?? []));
  const diff = await inLane(session.lane, ['scripts/debug/so-run-header.mts', 'diff', resolve(dir, 'run-header-start.json'), '--allow', 'chatId,chat,story,group,inventory.journal', '--allow-warnings', '--out', resolve(dir, 'run-header-end.json')], viewportEnv);
  await writeFile(resolve(dir, 'run-header-diff.txt'), diff.output, 'utf-8');
  for (const name of TAILS) {
    const pid = Number(session.pids?.[name]);
    if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) await killTree(pid);
  }
  const spend = await meterDir(dir, session);
  const rubricPath = resolve(dir, 'rubric.json');
  const rubric = existsSync(rubricPath) ? await readJson(rubricPath) : rubricTemplate(card, { dir: session.dir, lane: session.lane, startedAt: session.startedAt });
  rubric.playerClean = pageEnd.playerClean ?? (session.mode === 'player' ? { ok: false, error: 'the player surface was not checked' } : { skipped: 'author-mode card' });
  await writeFile(rubricPath, JSON.stringify(rubric, null, 2), 'utf-8');
  const stopped = {
    ...session, stoppedAt: new Date().toISOString(), runHeaderDiff: { exit: diff.code, ok: diff.code === 0 },
    evidence: { files: pageEnd.files ?? [], problems: pageEnd.evidenceProblems ?? {} }, playerClean: rubric.playerClean, spend,
    problems: [...(session.problems ?? []), ...problems],
  };
  await writeFile(resolve(dir, 'session.json'), JSON.stringify(stopped, null, 2), 'utf-8');
  await writeBudget();
  if (stopLane) await run(['scripts/debug/st-lanes.mts', 'stop', String(session.lane)]);
  console.log(JSON.stringify({ dir: session.dir, stoppedAt: stopped.stoppedAt, runHeaderDiff: stopped.runHeaderDiff, evidence: stopped.evidence, playerClean: rubric.playerClean?.ok ?? rubric.playerClean, spend, rubric: rel(rubricPath), rubricOpen: rubricProblems(rubric).length, problems: stopped.problems, laneStopped: stopLane }, null, 2));
  return stopped;
}

export async function appendTurn(dir: string, record: Record<string, unknown>) {
  const path = resolve(dir, TURNS_FILE);
  const existing = existsSync(path) ? (await readFile(path, 'utf-8')).split(/\r?\n/).filter((line) => line.trim()).length : 0;
  const row = { seq: existing + 1, ...record };
  await appendFile(path, `${JSON.stringify(row)}\n`, 'utf-8');
  return row;
}

export const nextSeq = async (dir: string) => (existsSync(resolve(dir, TURNS_FILE)) ? (await readFile(resolve(dir, TURNS_FILE), 'utf-8')).split(/\r?\n/).filter((line) => line.trim()).length + 1 : 1);

export function sessionChat(session: any, wanted: string | null): LiveChat | null {
  const chats = (session.chats ?? []) as Array<{ chatId: string; group?: string | null; primary?: boolean }>;
  if (wanted) {
    const found = chats.find((chat) => chat.chatId === wanted);
    if (!found) throw new Error(`chat ${wanted} is not one of this session's chats (${chats.map((chat) => chat.chatId).join(', ') || 'none'})`);
    return { chatId: found.chatId, group: found.group ?? null };
  }
  const primary = chats.filter((chat) => chat.primary).pop() ?? chats[chats.length - 1];
  return primary ? { chatId: primary.chatId, group: primary.group ?? null } : null;
}

async function liveInLane(lane: number, viewportEnv: Record<string, string>, request: LiveRequest): Promise<any> {
  const io = resolve(request.dir, '.live-request.json');
  const out = resolve(request.dir, '.live-result.json');
  await writeFile(io, JSON.stringify(request, null, 2), 'utf-8');
  if (existsSync(out)) await writeFile(out, '', 'utf-8');
  const result = await inLane(lane, ['scripts/debug/so-session.mts', '_live', io, out], viewportEnv);
  const text = existsSync(out) ? (await readFile(out, 'utf-8')).trim() : '';
  if (text) return JSON.parse(text);
  return { kind: request.verb, at: new Date().toISOString(), ok: false, error: result.output.slice(-1500) || `exit ${result.code}` };
}

export interface LiveCli { verb: LiveVerb; dir: string | undefined; args: LiveRequest['args']; chat: string | null; options: LiveRequest['options'] }

export function parseLiveArgs(verb: LiveVerb, rest: string[]): LiveCli {
  const flags = new Set(['--chat', '--timeout-ms', '--to', '--via', '--quiet-ms']);
  const positional: string[] = [];
  for (let at = 0; at < rest.length; at += 1) {
    if (flags.has(rest[at])) { at += 1; continue; }
    if (rest[at].startsWith('--')) continue;
    positional.push(rest[at]);
  }
  const [dir, ...more] = positional;
  const timeout = argValue(rest, '--timeout-ms');
  const quiet = argValue(rest, '--quiet-ms');
  const options = { ...(timeout ? { timeoutMs: Number(timeout) } : {}), ...(quiet ? { quietMs: Number(quiet) } : {}), ...(rest.includes('--no-expect-reply') ? { expectReply: false } : {}) };
  const messageId = (value: string | undefined) => (value === undefined || value === 'last' ? 'last' as const : Number(value));
  const args: LiveRequest['args'] = {};
  if (verb === 'turn' || verb === 'switch-chat-mid-gen' || verb === 'reload-mid-gen') args.line = more[0];
  if (verb === 'switch-chat-mid-gen') args.to = argValue(rest, '--to');
  if (verb === 'edit') { args.messageId = messageId(more[0]); args.text = more[1]; }
  if (verb === 'delete') args.messageId = messageId(more[0]);
  if (verb === 'flag') { args.note = more[0]; args.via = argValue(rest, '--via') === 'slash' ? 'slash' : 'drawer'; }
  if (verb === 'shot') args.label = more[0];
  if (verb === 'age') args.hours = Number(more[0]);
  const missing = (verb === 'turn' || verb === 'switch-chat-mid-gen' || verb === 'reload-mid-gen') && !args.line ? 'a player line'
    : verb === 'edit' && !args.text ? 'the message id and the new text'
      : verb === 'flag' && !args.note ? 'a note'
        : verb === 'shot' && !args.label ? 'a label'
          : verb === 'age' && !(Number(args.hours) > 0) ? 'a number of hours'
            : verb === 'switch-chat-mid-gen' && !args.to ? '--to <chatId>'
              : !dir ? 'the session dir' : null;
  if (missing) throw new Error(`${verb} needs ${missing}`);
  return { verb, dir, args, chat: argValue(rest, '--chat'), options };
}

async function live(cli: LiveCli) {
  const { dir, session } = await openSessionDir(cli.dir, null);
  if (session.stoppedAt) throw new Error(`${session.dir} is stopped; start a new session to play more`);
  const viewportEnv: Record<string, string> = session.viewport ? { ST_DEBUG_VIEWPORT: session.viewport } : {};
  const chat = cli.verb === 'adopt' ? null : sessionChat(session, cli.chat);
  const args = cli.verb === 'shot' ? { ...cli.args, seq: await nextSeq(dir) } : cli.args;
  const record = await liveInLane(session.lane, viewportEnv, { verb: cli.verb, dir, chat, args, options: cli.options });
  const row = await appendTurn(dir, record);
  if (cli.verb === 'adopt' && record.ok && record.chat?.chatId) {
    const adopted = { chatId: record.chat.chatId, groupId: record.chat.groupId, group: record.chat.group, storyId: record.chat.storyId, activeCheckpointId: record.chat.activeCheckpointId, primary: true, adopted: true };
    const chats = [...(session.chats ?? []).map((existing: any) => ({ ...existing, primary: false })).filter((existing: any) => existing.chatId !== adopted.chatId), adopted];
    await writeFile(resolve(dir, 'session.json'), JSON.stringify({ ...session, chats }, null, 2), 'utf-8');
  }
  console.log(JSON.stringify(row, null, 2));
  if (record.ok === false) process.exitCode = 1;
  return row;
}

export async function scoreCommand(dirArg: string, rest: string[], at = new Date().toISOString()) {
  const dir = resolve(REPO_ROOT, dirArg);
  const rubricPath = resolve(dir, 'rubric.json');
  if (!existsSync(rubricPath)) throw new Error(`${dirArg} has no rubric.json yet: stop the session first`);
  const record = rest.includes('--record');
  const evidence: string[] = [];
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--evidence') { if (rest[index + 1]) evidence.push(rest[index + 1]); index += 1; continue; }
    if (rest[index] === '--record') continue;
    positional.push(rest[index]);
  }
  const [row, ...tail] = positional;
  const score = record ? null : tail[0] ?? null;
  const note = (record ? tail[0] : tail[1]) ?? '';
  if (!row) throw new Error('score needs a row (number or feature name)');
  const scored = scoreRow(await readJson(rubricPath), dir, { row, score, note, evidence, record, at });
  await writeFile(rubricPath, JSON.stringify(scored.rubric, null, 2), 'utf-8');
  return { row: scored.index, feature: scored.row.feature, score: scored.row.score, open: rubricProblems(scored.rubric) };
}

export async function loadSessionFiles(dir: string, index: StoryIndex) {
  const session = await readJson(resolve(dir, 'session.json'));
  const text = async (name: string) => (existsSync(resolve(dir, name)) ? readFile(resolve(dir, name), 'utf-8') : '');
  const names = await readdir(dir);
  const chats: Record<string, ChatMessage[]> = {};
  const states: Record<string, any> = {};
  for (const name of names) {
    const chat = /^chat-(?!full-)(.+)\.json$/.exec(name);
    if (chat) chats[chat[1]] = await readJson(resolve(dir, name));
    const state = /^state-end-(.+)\.json$/.exec(name);
    if (state) states[state[1]] = await readJson(resolve(dir, name));
  }
  const logs: Record<string, any> = {};
  const logPaths: Record<string, string> = {};
  for (const name of names.filter((candidate) => candidate.endsWith('.log'))) { logs[name] = parseLines(await text(name)); logPaths[name] = name; }
  const story: StoryIndexEntry | null = session.story?.kind === 'adolion' ? index.stories[session.story.id] ?? null : null;
  return {
    files: { session, journal: parseJsonl(await text('journal.jsonl')), payloads: parseJsonl(await text('payloads.jsonl')), console: parseJsonl(await text('console.jsonl')), logs, chats, states, story },
    paths: { journal: 'journal.jsonl', payloads: 'payloads.jsonl', console: 'console.jsonl', logs: logPaths },
  };
}

async function digest(arg: string | undefined) {
  const { dir } = await openSessionDir(arg, arg ? null : true);
  const index = await loadIndex();
  const { files, paths } = await loadSessionFiles(dir, index);
  const result = digestSession(files, paths);
  const sessionDir = rel(dir);
  await writeFile(resolve(dir, 'findings.json'), JSON.stringify({ ...result, sessionDir, register: registerRows(result, sessionDir) }, null, 2), 'utf-8');
  await writeFile(resolve(dir, 'findings.md'), renderFindings(result, sessionDir), 'utf-8');
  console.log(JSON.stringify({ dir: sessionDir, counts: result.counts, wrote: [`${sessionDir}/findings.md`, `${sessionDir}/findings.json`] }, null, 2));
  return result;
}

async function cards(mode: 'print' | 'write' | 'check') {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const rendered = renderCardsDocument(doc, index);
  if (mode === 'print') { process.stdout.write(rendered); return; }
  if (mode === 'write') { await writeFile(CARDS_DOC_PATH, rendered, 'utf-8'); console.log(`Wrote ${rel(CARDS_DOC_PATH)}`); return; }
  const current = existsSync(CARDS_DOC_PATH) ? (await readFile(CARDS_DOC_PATH, 'utf-8')).replace(/\r\n/g, '\n') : '';
  if (current !== rendered) { console.error(`${rel(CARDS_DOC_PATH)} is out of date: run so-session.mts cards --write`); process.exitCode = 1; }
}

async function runbook(mode: 'print' | 'write' | 'check') {
  const doc = await loadCards();
  const plan: LanePlan | null = existsSync(LANE_PLAN_PATH) ? await readJson(LANE_PLAN_PATH) : null;
  const rendered = renderRunbook(doc, plan);
  if (mode === 'print') { process.stdout.write(rendered); return; }
  if (mode === 'write') { await writeFile(RUNBOOK_PATH, rendered, 'utf-8'); console.log(`Wrote ${rel(RUNBOOK_PATH)}`); return; }
  const current = existsSync(RUNBOOK_PATH) ? (await readFile(RUNBOOK_PATH, 'utf-8')).replace(/\r\n/g, '\n') : '';
  if (current !== rendered) { console.error(`${rel(RUNBOOK_PATH)} is out of date: run so-session.mts runbook --write`); process.exitCode = 1; }
}

async function validate() {
  const [doc, index, premises] = await Promise.all([loadCards(), loadIndex(), loadPremises()]);
  const problems = validateCardDoc(doc, index, premises);
  console.log(JSON.stringify({ cards: doc.cards.length, problems }, null, 2));
  if (problems.length) process.exitCode = 1;
}

const git = (repo: string, args: string[]) => new Promise<string>((done, fail) => execFile('git', ['-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => (error ? fail(error) : done(stdout))));

export function indexEntry(raw: any, group: string | null): StoryIndexEntry {
  const checkpoints = (raw.checkpoints ?? []).map((checkpoint: any) => ({ id: String(checkpoint.id), name: String(checkpoint.name ?? checkpoint.id) }));
  const start = (raw.checkpoints ?? []).find((checkpoint: any) => checkpoint.start === true)?.id ?? checkpoints[0]?.id ?? '';
  const edges = [...new Set((raw.transitions ?? []).map((transition: any) => `${transition.from}>${transition.to}`))].map((pair) => String(pair).split('>') as [string, string]);
  return {
    title: String(raw.title ?? raw.id), group, start, checkpoints, edges,
    qualities: (raw.qualities ?? []).map((quality: any) => String(quality.key)), roster: (raw.roster ?? []).map((member: any) => String(member.name)),
  };
}

async function buildIndex() {
  const pin = await readJson(PIN_FILE);
  const repo = process.env.ADOLION_CAMPAIGN || pin.repo;
  const files = (await git(repo, ['ls-tree', '--name-only', `${pin.commit}:build/story`])).split(/\r?\n/).filter((name) => name.endsWith('.story.json'));
  const { parseGroupScript } = await import('./lib/adolionFresh.mts');
  const groups = parseGroupScript(await git(repo, ['show', `${pin.commit}:build/st-groups.js`]));
  const stories: Record<string, StoryIndexEntry> = {};
  for (const file of files) {
    const raw = JSON.parse(await git(repo, ['show', `${pin.commit}:build/story/${file}`]));
    stories[raw.id] = indexEntry(raw, groups.find((group) => group.story === raw.id)?.name ?? null);
  }
  const examples: Record<string, StoryIndexEntry & { path: string }> = {};
  const exampleRoot = resolve(REPO_ROOT, 'examples');
  for (const dir of existsSync(exampleRoot) ? await readdir(exampleRoot, { withFileTypes: true }) : []) {
    if (!dir.isDirectory()) continue;
    for (const name of await readdir(resolve(exampleRoot, dir.name))) {
      if (!name.endsWith('.json')) continue;
      const raw = await readJson(resolve(exampleRoot, dir.name, name)).catch(() => null);
      if (raw?.format === 2 || (raw?.id && Array.isArray(raw?.checkpoints) && Array.isArray(raw?.transitions))) examples[raw.id] = { ...indexEntry(raw, null), path: `examples/${dir.name}/${name}` };
    }
  }
  const sorted = Object.fromEntries(Object.entries(stories).sort(([a], [b]) => a.localeCompare(b)));
  const index: StoryIndex = { commit: pin.commit, stories: sorted, examples };
  await writeFile(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`, 'utf-8');
  console.log(`Wrote ${rel(INDEX_PATH)}: ${Object.keys(stories).length} stories at ${pin.commit}, ${Object.keys(examples).length} example(s)`);
}

async function planCommand(rest: string[]) {
  const doc = await loadCards();
  const lanes = (argValue(rest, '--lanes') ?? DEFAULT_LANES.join(',')).split(',').map(Number).filter((lane) => Number.isInteger(lane) && lane > 0);
  const only = argValue(rest, '--only')?.split(',').map((id) => id.trim()).filter(Boolean) ?? null;
  const plan = planLanes(doc, lanes, only);
  if (rest.includes('--write')) await writeFile(LANE_PLAN_PATH, `${JSON.stringify({ ...plan, writtenAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
  console.log(JSON.stringify({ queues: plan.queues, reservations: plan.reservations, problems: plan.problems, wrote: rest.includes('--write') ? rel(LANE_PLAN_PATH) : null }, null, 2));
  if (plan.problems.length) process.exitCode = 1;
  return plan;
}

async function liveChild(input: string, output: string) {
  const [{ runCli }, { defaultLiveDeps, runLive }] = await Promise.all([import('./lib/cli.mts'), import('./lib/sessionDriver.mts')]);
  const request: LiveRequest = await readJson(input);
  await runCli(async (page) => {
    try {
      const record = await runLive(page, request, await defaultLiveDeps());
      await writeFile(output, JSON.stringify(record), 'utf-8');
      return { ok: true };
    } catch (error) {
      await writeFile(output, JSON.stringify({ kind: request.verb, at: new Date().toISOString(), ok: false, error: error instanceof Error ? error.message : String(error) }), 'utf-8');
      return { ok: false };
    }
  });
}

async function pagePhase(phase: 'settings' | 'pin' | 'open' | 'end', input: string, output: string) {
  const [{ runCli }, { evaluateInST }, navigation, { saveSettingsNow }, { renderMarkdown }, evidenceLib, pinLib] = await Promise.all([
    import('./lib/cli.mts'), import('./lib/evaluate.mts'), import('./st-navigation.mts'), import('./lib/settingsSave.mts'), import('./so-journal.mts'),
    import('./lib/sessionEvidence.mts'), import('./lib/sessionPin.mts'),
  ]);
  const plan = await readJson(input);
  await runCli(async (page) => {
    const problems: string[] = [];
    const out: Record<string, unknown> = { phase, problems };
    const settle = async () => {
      await navigation.waitForSettledChat(page, { quietMs: 1500, timeoutMs: 60000 });
      const started = Date.now();
      while (Date.now() - started < 30000) {
        const saving = await evaluateInST(page, async () => Boolean(((await import(/* webpackIgnore: true */ '/script.js' as string)) as { isChatSaving?: boolean }).isChatSaving));
        if (!saving) break;
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(2000);
    };
    const where = () => evaluateInST(page, () => {
      const ctx = SillyTavern.getContext();
      const snapshot = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.() ?? {};
      return {
        chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, storyId: snapshot.storyId ?? null,
        activeCheckpointId: snapshot.activeCheckpointId ?? null, requirementsReady: snapshot.requirements?.ready ?? null,
      };
    });

    if (phase === 'settings') {
      out.settings = await evaluateInST(page, (patch: Record<string, any>) => {
        const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
        const merge = (base: Record<string, any>, next: Record<string, any>): Record<string, any> => {
          const result: Record<string, any> = { ...base };
          for (const [key, value] of Object.entries(next)) result[key] = isRecord(value) && isRecord(base[key]) ? merge(base[key], value) : value;
          return result;
        };
        const ctx = SillyTavern.getContext();
        const root = (ctx.extensionSettings['story-orchestrator'] ||= {}) as Record<string, any>;
        root.settings = merge(isRecord(root.settings) ? root.settings : {}, patch);
        return { image: root.settings.image?.enabled ?? null, sprites: root.settings.sprites?.enabled ?? null, judge: root.settings.judge?.enabled ?? null };
      }, plan.patch);
      await saveSettingsNow(page);
    }

    if (phase === 'pin') {
      const selected = await pinLib.selectMainProfile(page, plan.pin.profile);
      if (!selected.ok) problems.push(String(selected.reason));
      const probe = await pinLib.probeProfile(page, plan.pin.profile);
      const routing = await pinLib.readRouting(page);
      const verdict = pinLib.pinVerdict(routing, probe, { mainProfile: plan.pin.profile, orchestrator: new RegExp(plan.pin.orchestrator, 'i'), judge: plan.pin.judge });
      out.verdict = { ok: verdict.ok && selected.ok, problems: [...problems, ...verdict.problems] };
      out.probe = probe;
      out.routing = routing;
    }

    if (phase === 'open') {
      const open = plan.open;
      const chats: Array<Record<string, unknown>> = [];
      const selectStory = async (storyId: string) => {
        const result = await evaluateInST(page, async (id: string) => {
          const rt = (globalThis as any).storyOrchestratorRuntime;
          if (rt.getSnapshot()?.storyId !== id) await rt.selectStory(id);
          const started = Date.now();
          while (Date.now() - started < 30000 && rt.getSnapshot()?.storyId !== id) await new Promise((done) => setTimeout(done, 250));
          return rt.getSnapshot()?.storyId ?? null;
        }, storyId);
        if (result !== storyId) problems.push(`story ${storyId} did not load (snapshot says ${String(result)})`);
      };
      const groupListed = async (group: string) => {
        const started = Date.now();
        while (Date.now() - started < 90000) {
          const listed = await evaluateInST(page, async (name: string) => {
            const ctx = SillyTavern.getContext();
            if (!(ctx.groups ?? []).some((candidate) => candidate.name === name)) await ctx.getCharacters?.();
            return (ctx.groups ?? []).some((candidate) => candidate.name === name);
          }, group);
          if (listed) return;
          await page.waitForTimeout(1000);
        }
        throw new Error(`the page never listed group "${group}"`);
      };
      const freshChat = async (group: string, storyId: string, primary: boolean) => {
        await groupListed(group);
        await navigation.openGroup(page, group);
        await settle();
        await navigation.startNewChat(page);
        await settle();
        const now = await where();
        if (!now.groupId || !now.chatId) throw new Error(`fresh chat of ${group} did not open: ${JSON.stringify(now)}`);
        if (primary && open.select === 'manual') {
          if (now.storyId) problems.push(`the fresh chat already plays ${now.storyId} (a group binding selected it); the Start entry point cannot be tried from scratch in this chat`);
        } else await selectStory(storyId);
        const loaded = !(primary && open.select === 'manual');
        if (primary && loaded && open.startAt) {
          const moved = await evaluateInST(page, async (id: string) => {
            const rt = (globalThis as any).storyOrchestratorRuntime;
            if (rt.getSnapshot()?.activeCheckpointId !== id) await rt.activateCheckpoint(id);
            return rt.getSnapshot()?.activeCheckpointId ?? null;
          }, open.startAt);
          if (moved !== open.startAt) problems.push(`startAt ${open.startAt} did not take (active ${String(moved)})`);
        }
        if (primary && loaded) for (const [key, value] of Object.entries(open.seed ?? {})) {
          const landed = await evaluateInST(page, async ({ key, value }) => {
            const rt = (globalThis as any).storyOrchestratorRuntime;
            await rt.setQuality(key, String(value));
            return rt.getSnapshot()?.blackboard?.[key] ?? null;
          }, { key, value });
          if (String(landed) !== String(value)) problems.push(`seed ${key}=${String(value)} did not land (blackboard ${String(landed)})`);
        }
        await evaluateInST(page, (authorView: boolean) => (globalThis as any).storyOrchestratorRuntime?.setUiSettings?.({ authorView }), Boolean(open.authorView));
        await settle();
        const done = await where();
        chats.push({ ...done, group, primary });
        return done;
      };
      if (open.kind === 'wizard' && !open.continueChat) {
        out.note = `wizard charter: no story is opened; start from the settings panel (Start -> New story (wizard))${open.premise?.id ? `, premise ${open.premise.id}` : ''}, then run so-session adopt once its chat is open`;
      } else {
        if (open.also) await freshChat(open.also.group, open.also.storyId, false);
        if (open.continueChat) {
          await groupListed(open.group);
          await navigation.openGroup(page, open.group);
          await settle();
          await navigation.openChat(page, open.continueChat);
          await settle();
          await evaluateInST(page, (authorView: boolean) => (globalThis as any).storyOrchestratorRuntime?.setUiSettings?.({ authorView }), Boolean(open.authorView));
          const now = await where();
          if (now.chatId !== open.continueChat) problems.push(`could not reopen ${open.continueChat} (open: ${String(now.chatId)})`);
          chats.push({ ...now, group: open.group, primary: true, continued: true });
        } else {
          for (let at = 0; at < open.chats; at += 1) await freshChat(open.group, open.storyId, true);
        }
      }
      out.chats = chats;
    }

    if (phase === 'end') {
      const session = plan;
      const ends: Array<Record<string, unknown>> = [];
      const files: string[] = [];
      const evidenceProblems: Record<string, string[]> = {};
      const dir = resolve(input, '..');
      const ordered = [...(session.chats ?? [])].sort((a: any, b: any) => Number(Boolean(a.primary)) - Number(Boolean(b.primary)));
      for (const chat of ordered as Array<{ chatId: string; group: string }>) {
        try {
          await navigation.openGroup(page, chat.group);
          await settle();
          await navigation.openChat(page, chat.chatId);
          await settle();
        } catch (error) {
          problems.push(`could not reopen ${chat.chatId}: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        const evidence = await evidenceLib.captureEvidence(page);
        const read = await evaluateInST(page, () => {
          const ctx = SillyTavern.getContext();
          const rt = (globalThis as any).storyOrchestratorRuntime;
          const snapshot = rt?.getSnapshot?.() ?? {};
          const group = (ctx.groups ?? []).find((candidate) => candidate.id === ctx.groupId);
          const members = (group?.members ?? []) as string[];
          return {
            chatId: ctx.chatId ?? null,
            journal: { chatId: ctx.chatId ?? null, storyTitle: snapshot.storyTitle ?? null, activeCheckpoint: snapshot.activeCheckpointName ?? null, boundary: snapshot.boundary ?? 0, events: rt?.getSessionJournal?.() ?? [] },
            chat: (ctx.chat ?? []).map((message, id) => ({ id, name: String(message.name ?? ''), isUser: Boolean(message.is_user), text: String(message.mes ?? '') })),
            state: {
              storyId: snapshot.storyId ?? null, activeCheckpointId: snapshot.activeCheckpointId ?? null, boundary: snapshot.boundary ?? null,
              requirements: snapshot.requirements ?? null, blackboard: snapshot.blackboard ?? null, lastRollback: snapshot.lastRollback ?? null,
              epistemic: rt?.getEpistemic?.() ?? [],
              characters: (ctx.characters ?? []).map((character, index) => ({ index, name: String(character?.name ?? ''), avatar: String(character?.avatar ?? '') })).filter((character) => members.includes(character.avatar)),
            },
          };
        });
        if (!read.chatId) { problems.push(`no chat open after reopening ${chat.chatId}`); continue; }
        await writeFile(resolve(dir, `journal-${read.chatId}.json`), JSON.stringify(read.journal, null, 2), 'utf-8');
        await writeFile(resolve(dir, `journal-${read.chatId}.md`), renderMarkdown(read.journal), 'utf-8');
        await writeFile(resolve(dir, `chat-${read.chatId}.json`), JSON.stringify(read.chat, null, 1), 'utf-8');
        await writeFile(resolve(dir, `state-end-${read.chatId}.json`), JSON.stringify(read.state, null, 2), 'utf-8');
        const split = evidenceLib.splitEvidence(evidence);
        await writeFile(resolve(dir, `chat-full-${read.chatId}.json`), JSON.stringify(split.chatFull, null, 1), 'utf-8');
        await writeFile(resolve(dir, `snapshot-${read.chatId}.json`), JSON.stringify(split.snapshot, null, 1), 'utf-8');
        await writeFile(resolve(dir, `evidence-${read.chatId}.json`), JSON.stringify({ capturedAt: evidence.capturedAt, chatId: evidence.chatId, groupId: evidence.groupId, unread: evidence.unread, slices: split.slices }, null, 1), 'utf-8');
        files.push(...['journal', 'chat', 'chat-full', 'state-end', 'snapshot', 'evidence'].map((kind) => `${kind}-${read.chatId}.json`), `journal-${read.chatId}.md`);
        evidenceProblems[read.chatId] = evidenceLib.evidenceProblems(evidence);
        ends.push({ chatId: read.chatId, events: read.journal.events.length, messages: read.chat.length, swipes: split.chatFull.reduce((total, message) => total + message.swipes.length, 0), reasoning: split.chatFull.filter((message) => message.reasoning).length });
      }
      out.ends = ends;
      out.files = files;
      out.evidenceProblems = evidenceProblems;
      if (session.mode === 'player' && ends.length) {
        try {
          const { assertPlayerClean } = await import('./so-ui.mts');
          out.playerClean = { at: new Date().toISOString(), ...(await assertPlayerClean(page)) };
        } catch (error) {
          out.playerClean = { at: new Date().toISOString(), ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
    }
    await writeFile(output, JSON.stringify(out, null, 2), 'utf-8');
    return { ok: true };
  });
}

async function consoleTail(outFile: string) {
  const { runCli } = await import('./lib/cli.mts');
  await runCli(async (page) => {
    const write = (row: Record<string, unknown>) => void appendFile(outFile, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`, 'utf-8').catch(() => undefined);
    page.on('console', (message) => {
      const type = message.type();
      if (type !== 'error' && type !== 'warning') return;
      const location = message.location();
      write({ type, text: message.text(), location: location?.url ? `${location.url}:${location.lineNumber}` : null });
    });
    page.on('pageerror', (error) => write({ type: 'pageerror', text: error.message, stack: error.stack ?? null }));
    write({ type: 'info', text: 'console tail attached' });
    await new Promise(() => undefined);
  }, { keepOpen: true });
}

const argValue = (args: string[], name: string) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : null;
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(USAGE); return; }
  if (command === '_page') { await pagePhase(rest[0] as 'settings' | 'pin' | 'open' | 'end', rest[1], rest[2]); return; }
  if (command === '_live') { await liveChild(rest[0], rest[1]); return; }
  if (command === '_console') { await consoleTail(rest[0]); return; }
  if (command === 'start') {
    if (!rest[0] || rest[0].startsWith('--')) { console.log(USAGE); process.exitCode = 2; return; }
    const lane = argValue(rest, '--lane');
    const age = argValue(rest, '--age');
    await start(rest[0], {
      lane: lane === null ? null : Number(lane), allowComfy: rest.includes('--allow-comfy'), seed: !rest.includes('--no-seed'), forceWaiting: rest.includes('--force-waiting'),
      profile: argValue(rest, '--profile') ?? DEFAULT_MAIN_PROFILE, orchestrator: argValue(rest, '--orchestrator') ?? DEFAULT_ORCHESTRATOR.source, age: age === null ? null : Number(age),
    });
  } else if ((LIVE_VERBS as readonly string[]).includes(command)) await live(parseLiveArgs(command as LiveVerb, rest));
  else if (command === 'score') {
    if (!rest[0]) { console.log(USAGE); process.exitCode = 2; return; }
    console.log(JSON.stringify(await scoreCommand(rest[0], rest.slice(1)), null, 2));
  } else if (command === 'plan') await planCommand(rest);
  else if (command === 'runbook') await runbook(rest.includes('--write') ? 'write' : rest.includes('--check') ? 'check' : 'print');
  else if (command === 'budget') console.log(`Wrote ${rel(BUDGET_PATH)} (${await writeBudget()} session(s))`);
  else if (command === 'stop') await stop(rest.find((arg) => !arg.startsWith('--')), rest.includes('--stop-lane'));
  else if (command === 'digest') await digest(rest.find((arg) => !arg.startsWith('--')));
  else if (command === 'cards') await cards(rest.includes('--write') ? 'write' : rest.includes('--check') ? 'check' : 'print');
  else if (command === 'validate') await validate();
  else if (command === 'index') await buildIndex();
  else { console.log(USAGE); process.exitCode = 2; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

