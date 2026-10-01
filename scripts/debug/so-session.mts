import { execFile, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, statSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredStRoot, lanesRootFor, REPO_ROOT } from '../lib/stRoot.mjs';
import {
  BLIND_GATES, comfyRefusal, nextSessionNumber, renderCard, renderCardsDocument, rubricProblems, rubricSummary, rubricTemplate, settingsPatch, storyEntry, validateCardDoc,
  type BlindGate, type Card, type CardDoc, type MediaKind, type Premise, type StoryIndex, type StoryIndexEntry,
} from './lib/sessionCharters.mts';
import { digestSession, parseJsonl, parseLines, registerRows, renderFindings, REQUIRED_CAPTURES, type ChatMessage } from './lib/sessionDigest.mts';
import {
  archiveLane, DEFAULT_LANES, dependencyRefusal, laneFor, leaseFor, leaseRefusal, outstandingDependents, planDrift, planLanes, readLease, reseedRefusal, restoreLane, rootOf, sessionsUnder, writeLease,
  type LanePlan, type SessionOnLane,
} from './lib/sessionLanes.mts';
import { applyOverBaseline, baselineProblems, effectiveProblems, effectiveSettings, hostSwipesProblems, loadBaseline, mediaPlan, overrideChain } from './lib/sessionBaseline.mts';
import {
  artifactInventory, artifactProblems, comfyCalls, featureProblems, newChats, requiredArtifacts, runtimeProblems, storyFeatures, trackChat, type ChatRef,
} from './lib/sessionArtifacts.mts';
import { ackPaths, readTailAcks, tailProblems, TAIL_FILES, TAIL_NAMES, waitFor, READY_TIMEOUT_MS, DRAIN_TIMEOUT_MS } from './lib/sessionTails.mts';
import { headerDiffArgs, stopSequence } from './lib/sessionStop.mts';
import { buildPack, candidatesFromTurns, packLeaks, storyCandidate, type Candidate, type Verdict } from './lib/ratingPack.mts';
import { LIVE_VERBS, type LiveChat, type LiveRequest, type LiveVerb } from './lib/sessionDriver.mts';
import { DEFAULT_MAIN_PROFILE, DEFAULT_ORCHESTRATOR, judgeExpectation, pinVerdict } from './lib/sessionPin.mts';
import { scoreRow } from './lib/sessionRubric.mts';
import { meterSession, updateBudgetDocument, type BudgetRow } from './lib/sessionSpend.mts';
import { renderRunbook } from './lib/sessionRunbook.mts';

const USAGE = `Usage: node scripts/debug/so-session.mts <command> [...]

v2.6 plan 14: one human play session per charter card, on its own adolion-fresh lane, headed.

  start <charterId> [--lane n] [--profile <name>] [--orchestrator <regex>] [--age <hours>]
        [--media off|on] [--allow-comfy] [--no-seed] [--force-waiting] [--arm <label>] [--break-lease]
      preflight the card (structure, the story data it exercises, the session it continues, the
      lane lease), seed the lane with adolion-fresh, write test/sessions/baseline-settings.json
      plus the card's overrides over the lane's settings (install-owned paths kept), reload and
      assert the settings the runtime reads back, pin the routing (main profile selected and
      probed, every orchestrator role on DeepSeek, judge state and key, reasoning), open its story
      in a fresh chat (or the chat it continues; --age backdates it so the away recap fires),
      capture a run header, start the journal, payload and console tails and wait for each to
      acknowledge it is capturing. ANY blocking discrepancy (lane build, settings, pin, page,
      recap, header, tails) fails the start with exit 2 and start-failed.json. --media off (the
      default) is the recorded no-media variant: images off, sprites only when the lane holds
      pre-rendered ones; the card's image/sprite rubric rows are marked unexercised. --media on
      needs --allow-comfy. --arm tags the session for a blind-rating pack (W6 wizard arms).
  setting <dir> <path> <json>                write one install-wide setting mid-session (a rating arm)
  turn <dir> "<line>" [--chat id] [--timeout-ms n] [--no-expect-reply] [--arm <label> [--gate C3|R4|Q-M]]
      one real turn: send, wait for the reply(ies) and the scheduler, append to turns.jsonl with the
      chat it landed in, the transcript revision (transcripts.jsonl, swipes included) and, with
      --arm, the rating arm (swipe-new and regen take --arm too)
  swipe-new <dir> | regen <dir> | edit <dir> <mesid|last> "<text>" | delete <dir> <mesid|last>
  switch-chat-mid-gen <dir> "<line>" --to <chatId> | reload-mid-gen <dir> "<line>"
      mutations: each records what it did and the rollback the product performed in turns.jsonl
  flag <dir> "<note>" [--via drawer|slash]   press the drawer flag (or /story flag)
  shot <dir> <label>                         screenshot into <dir>/shots/
  age <dir> <hours>                          backdate the open chat's last session and reload it
  adopt <dir>                                record the open chat as the session's chat (wizard cards)
  score <dir> <row|n> <works|annoying|broken|not-noticed> "<note>" --evidence <path:line|png> ...
  score <dir> <row|n> --record "<note>" --evidence ...   (rows recorded for the user's review)
  stop [<dir>] [--stop-lane]   export every visited or created chat (full persisted runtime with engine
                               history, effect ledger and chapter store, transcript with swipes,
                               evidence slices) and the wizard drafts, check the player surface,
                               diff the run header, ask each tail to drain and wait for its
                               acknowledgement, only then stop the tails, verify the card's
                               required artifacts and the ComfyUI guard, meter the spend, write
                               rubric.json, rebuild the card's blind-rating packs and the lane
                               lease. An invalid session exits 1.
  digest [<dir>]               write findings.md + findings.json (flags with context, anomalies);
                               a missing capture file makes the session invalid (exit 1)
  plan [--lanes 1,2,3,4] [--only T0-1,...] [--write|--check]   lanes from the continuation graph, tier by tier
  lane archive <n> | lane restore <n> <archiveDir> | lane lease <n>   keep a leased lane's chats across reseeds
  rating-pack [<gate>]         rebuild test/sessions/rating-pack/<gate>/ (paired, shuffled, unlabelled; verdicts reserved)
  budget                       rebuild test/sessions/BUDGET.md from every stopped session
  runbook [--write|--check]    render docs/plans/v2.6/14-autonomous-runbook.md from the cards and the lane plan
  cards [--write|--check]      render every card to docs/plans/v2.6/14-cards.md
  validate                     check charters.json against the story index, the pin and each card's story data
  index                        rebuild test/sessions/adolion-stories.json AND 14-cards.md from the pinned campaign`;

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
export const TRANSCRIPTS_FILE = 'transcripts.jsonl';
export const RATING_PACK_ROOT = resolve(SESSIONS_ROOT, 'rating-pack');

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));
export const loadIndex = async (): Promise<StoryIndex> => readJson(INDEX_PATH);
export const loadCards = async (): Promise<CardDoc> => readJson(CHARTERS_PATH);
export const loadPremises = async (): Promise<Premise[]> => (await readJson(PREMISES_PATH)).premises ?? [];
const rel = (path: string) => relative(REPO_ROOT, path).replace(/\\/g, '/');

const laneInfo = (n: number) => {
  const root = resolve(lanesRootFor(process.env, REPO_ROOT), String(n));
  return { root, debug: resolve(root, 'debug'), log: resolve(root, 'server.log'), url: `http://127.0.0.1:${8100 + n}/`, env: { ST_URL: `http://127.0.0.1:${8100 + n}/`, ST_DEBUG_CDP_PORT: String(9300 + n), SO_DEBUG_DIR: resolve(root, 'debug'), SO_LANE: String(n) } };
};

const logSize = (path: string) => (existsSync(path) ? statSync(path).size : 0);

const TAIL_COMMANDS = (dir: string) => ({
  journal: ['scripts/debug/so-journal.mts', 'follow', '--out', resolve(dir, TAIL_FILES.journal), '--ack'],
  payloads: ['scripts/debug/st-payload.mts', 'arm', '--persist', '--out', resolve(dir, TAIL_FILES.payloads), '--ack'],
  console: ['scripts/debug/so-session.mts', '_console', resolve(dir, TAIL_FILES.console)],
});

async function killTails(pids: Record<string, unknown> | undefined) {
  for (const name of TAIL_NAMES) {
    const pid = Number(pids?.[name]);
    if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) await killTree(pid);
  }
}

const allAcked = (dir: string, key: 'ready' | 'drained') => async () => {
  const acks = await readTailAcks(dir);
  return TAIL_NAMES.every((name) => acks[name][key]) ? acks : null;
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
  profile?: string; orchestrator?: string; age?: number | null; media?: 'on' | 'off'; arm?: string | null; breakLease?: boolean;
}

export function planStart(doc: CardDoc, index: StoryIndex, card: Card, options: StartOptions, previous: { session: any } | null, sessions: SessionOnLane[] = []) {
  const media = options.media ?? 'off';
  const refusal = comfyRefusal(card, options.allowComfy, media);
  if (refusal) return { refused: refusal } as const;
  if (card.waits && !options.forceWaiting) return { refused: `${card.id} waits: ${card.waits} Start it with --force-waiting only once that exists.` } as const;
  const continuing = card.setup.chat === 'continue';
  if (continuing && !previous) return { refused: `${card.id} continues ${card.setup.continues}, and no ${card.setup.continues} session exists yet: play that one first.` } as const;
  const unsettled = dependencyRefusal(doc, card, sessions);
  if (unsettled) return { refused: unsettled } as const;
  const missingData = featureProblems(doc, card, index);
  if (missingData.length) return { refused: `${card.id} cannot run on this pin: the story lacks the data the card exercises.\n- ${missingData.join('\n- ')}` } as const;
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
    chain: overrideChain(doc, card),
    media,
    arm: options.arm ?? null,
    viewport: card.setup.settings?.viewport ?? null,
  } as const;
}

export function startProblems(input: {
  laneCommit: string | null; indexCommit: string; effective: string[]; pin: { ok: boolean; problems: string[] } | null; page: string[]; age: { fired?: boolean; reason?: string; error?: string } | null;
  ageAsked: boolean; header: { code: number; output: string } | null; tails: string[];
}): string[] {
  const out: string[] = [];
  if (input.laneCommit !== input.indexCommit) out.push(`lane was seeded from ${input.laneCommit ?? 'an unknown build'}, the story index is ${input.indexCommit}`);
  out.push(...input.effective);
  if (input.pin && !input.pin.ok) out.push(...(input.pin.problems.length ? input.pin.problems : ['the routing pin failed']));
  out.push(...input.page);
  if (input.ageAsked && !input.age?.fired) out.push(`--age: the away recap did not fire (${input.age?.reason ?? input.age?.error ?? 'no recap after the reload'})`);
  if (input.header && input.header.code !== 0) out.push(`run header capture failed: ${input.header.output.slice(-300)}`);
  out.push(...input.tails);
  return out;
}

async function start(id: string, options: StartOptions) {
  const [doc, index, premises, baseline] = await Promise.all([loadCards(), loadIndex(), loadPremises(), loadBaseline()]);
  const problems = [...validateCardDoc(doc, index, premises), ...baselineProblems(baseline)];
  if (problems.length) throw new Error(`charters.json or the settings baseline is invalid:\n- ${problems.join('\n- ')}`);
  const card = findCard(doc, id);
  const previous = card.setup.chat === 'continue' ? await latestSession(findCard(doc, card.setup.continues!)) : null;
  const lanePlan: LanePlan | null = existsSync(LANE_PLAN_PATH) ? await readJson(LANE_PLAN_PATH) : null;
  const sessions = (await allSessions()).map(({ session }) => session as SessionOnLane);
  const plan = planStart(doc, index, card, { ...options, planned: laneFor(lanePlan, card.id) }, previous, sessions);
  if (plan.refused) { console.error(plan.refused); process.exitCode = 2; return null; }
  const lane = laneInfo(plan.lane);
  if (plan.seed && !options.breakLease) {
    const leased = leaseRefusal(await readLease(lane.root), sessions, card.id);
    if (leased) { console.error(leased); process.exitCode = 2; return null; }
  }
  const number = nextSessionNumber(await sessionDirsOf(card.tier, card.id), card.id);
  const dir = resolve(SESSIONS_ROOT, card.tier, `${card.id}-${number}`);
  const viewportEnv: Record<string, string> = plan.viewport ? { ST_DEBUG_VIEWPORT: plan.viewport } : {};
  const warnings: string[] = [];
  let pids: Record<string, number | null> = {};
  const fail = async (stage: string, blocking: string[]) => {
    await killTails(pids);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'start-failed.json'), JSON.stringify({ charter: card.id, stage, at: new Date().toISOString(), problems: blocking, warnings }, null, 2), 'utf-8');
    console.error(`${card.id} did not start (${stage}); nothing is recorded as a session (${rel(resolve(dir, 'start-failed.json'))}):\n- ${blocking.join('\n- ')}`);
    process.exitCode = 2;
    return null;
  };
  console.log(`[1/8] ${card.id} ${card.title} -> ${rel(dir)} on lane ${plan.lane}`);
  if (plan.seed) {
    console.log('[2/8] adolion-fresh seed (headed); images and sprites stay off');
    await must('adolion-fresh seed', ['scripts/debug/adolion-fresh.mts', 'seed', String(plan.lane), '--headed', '--for', card.id, ...(options.breakLease ? ['--break-lease'] : [])], {}, true);
  } else {
    console.log('[2/8] no seed: bring the lane up headed');
    const status = existsSync(resolve(lane.debug, 'session.json')) ? await readJson(resolve(lane.debug, 'session.json')).catch(() => null) : null;
    if (status && status.headed !== true) await inLane(plan.lane, ['scripts/debug/st-session.mts', 'stop']);
    await must('st-lanes start', ['scripts/debug/st-lanes.mts', 'start', String(plan.lane), '--headed']);
  }
  const inventoryPath = resolve(lane.root, 'adolion-fresh', 'inventory-latest.json');
  const inventory = existsSync(inventoryPath) ? await readJson(inventoryPath) : null;
  const laneCommit = inventory?.commit ?? null;
  if (laneCommit !== index.commit) return fail('lane', startProblems({ laneCommit, indexCommit: index.commit, effective: [], pin: null, page: [], age: null, ageAsked: false, header: null, tails: [] }));
  const media = mediaPlan(card.setup.settings ?? {}, plan.media, Number(inventory?.sprites?.prerendered ?? 0));
  const expected = effectiveSettings(baseline, plan.chain, media);
  console.log(`[3/8] baseline settings + card overrides (${media.variant}${media.unexercised.length ? `, unexercised: ${media.unexercised.join(', ')}` : ''}), reload`);
  await mkdir(dir, { recursive: true });
  const planPath = resolve(dir, 'start-plan.json');
  await writeFile(planPath, JSON.stringify({ card: card.id, ...plan, mediaPlan: media, expected, installOwned: baseline.installOwned, baselineVersion: baseline.version }, null, 2), 'utf-8');
  const settings = await inLane(plan.lane, ['scripts/debug/so-session.mts', '_page', 'settings', planPath, resolve(dir, 'page-settings.json')], viewportEnv, true);
  if (settings.code !== 0) return fail('settings', [`settings phase failed: ${settings.output.slice(-1200)}`]);
  const reload = await inLane(plan.lane, ['scripts/debug/st-session.mts', 'reload'], viewportEnv);
  if (reload.code !== 0) return fail('reload', [`reload failed: ${reload.output.slice(-800)}`]);
  console.log('[4/8] read the effective settings back, pin the routing');
  const effectiveRun = await inLane(plan.lane, ['scripts/debug/so-session.mts', '_page', 'effective', planPath, resolve(dir, 'effective-settings.json')], viewportEnv);
  const effectiveRead = existsSync(resolve(dir, 'effective-settings.json')) ? await readJson(resolve(dir, 'effective-settings.json')) : null;
  const effectiveIssues = effectiveRun.code !== 0 || !effectiveRead?.settings ? [`could not read the effective settings back: ${effectiveRun.output.slice(-600)}`] : [...effectiveProblems(expected, effectiveRead.settings, baseline.installOwned), ...hostSwipesProblems(effectiveRead.host)];
  if (effectiveIssues.length) return fail('effective-settings', effectiveIssues);
  const pinned = await inLane(plan.lane, ['scripts/debug/so-session.mts', '_page', 'pin', planPath, resolve(dir, 'page-pin.json')], viewportEnv, true);
  const pin = existsSync(resolve(dir, 'page-pin.json')) ? await readJson(resolve(dir, 'page-pin.json')) : null;
  if (pinned.code !== 0 || !pin?.verdict?.ok) return fail('pin', pin?.verdict?.problems?.length ? pin.verdict.problems : [`routing pin failed: ${pinned.output.slice(-800)}`]);
  console.log('[5/8] open the story');
  const opened = await inLane(plan.lane, ['scripts/debug/so-session.mts', '_page', 'open', planPath, resolve(dir, 'page-open.json')], viewportEnv, true);
  if (opened.code !== 0) return fail('open', [`open phase failed: ${opened.output.slice(-1200)}`]);
  const page = await readJson(resolve(dir, 'page-open.json'));
  if ((page.problems ?? []).length) return fail('open', page.problems);
  let age: any = null;
  if (plan.age) {
    const primary = (page.chats ?? []).filter((chat: any) => chat.primary).pop();
    age = await liveInLane(plan.lane, viewportEnv, { verb: 'age', dir, chat: primary ? { chatId: primary.chatId, group: primary.group ?? null } : null, args: { hours: plan.age } });
    await appendTurn(dir, age);
    if (!age?.fired) return fail('age', startProblems({ laneCommit, indexCommit: index.commit, effective: [], pin: null, page: [], age, ageAsked: true, header: null, tails: [] }));
  }
  const playFrom = new Date().toISOString();
  console.log('[6/8] run header');
  const header = await inLane(plan.lane, ['scripts/debug/so-run-header.mts', 'capture', '--label', `${card.id}-${number}-start`, '--out', resolve(dir, 'run-header-start.json')], viewportEnv);
  if (header.code !== 0) return fail('run-header', [`run header capture failed: ${header.output.slice(-300)}`]);
  console.log('[7/8] tails (each must acknowledge it is capturing)');
  const commands = TAIL_COMMANDS(dir);
  pids = Object.fromEntries(TAIL_NAMES.map((name) => [name, spawnTail(plan.lane, commands[name], resolve(dir, `${name}.log`), viewportEnv)]));
  const ready = (await waitFor(allAcked(dir, 'ready'), READY_TIMEOUT_MS)) ?? await readTailAcks(dir);
  const tailIssues = tailProblems(ready, 'start');
  if (tailIssues.length) return fail('tails', tailIssues);
  const session = {
    charter: card.id, tier: card.tier, title: card.title, number, dir: rel(dir), lane: plan.lane, laneUrl: lane.url,
    story: card.story, mode: card.setup.mode, startedAt: new Date().toISOString(), playFrom, stoppedAt: null,
    build: { ...servedBuild(), laneCampaign: laneCommit, indexCommit: index.commit }, pids, viewport: plan.viewport, settingsPatch: plan.patch,
    settings: { baselineVersion: baseline.version, chain: plan.chain.map((step) => step.card), effective: 'effective-settings.json' },
    media, arm: plan.arm, logOffset: logSize(lane.log), host: effectiveRead.host,
    pin: { profile: plan.pin.profile, orchestrator: plan.pin.orchestrator, judge: plan.pin.judge, verdict: pin.verdict, probe: pin.probe, routing: pin.routing },
    age, premise: plan.open.premise,
    chatsBefore: page.chatsBefore ?? [], chats: page.chats ?? [], continues: card.setup.continues ?? null, problems: [] as string[], warnings,
  };
  await writeFile(resolve(dir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
  console.log(`[8/8] ${rel(resolve(dir, 'session.json'))}${warnings.length ? `\nRECORDED:\n- ${warnings.join('\n- ')}` : ''}`);
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

async function readJsonl(path: string) {
  return existsSync(path) ? parseJsonl(await readFile(path, 'utf-8')).map((row) => row.value) : [];
}

export async function verifySession(dir: string, session: any, doc: CardDoc, card: Card) {
  const invalid: string[] = [];
  for (const name of REQUIRED_CAPTURES) if (!existsSync(resolve(dir, name))) invalid.push(`${name} is missing`);
  const names = existsSync(dir) ? await readdir(dir) : [];
  const runtimes: Record<string, any> = {};
  for (const name of names) {
    const match = /^runtime-(.+)\.json$/.exec(name);
    if (match) runtimes[match[1]] = await readJson(resolve(dir, name));
  }
  const required = requiredArtifacts(doc, card);
  const playsStory = card.story.kind !== 'wizard';
  for (const chat of session.chats ?? []) {
    if (!(chat.chatId in runtimes)) { invalid.push(`chat ${chat.chatId} was tracked but its persisted runtime was not exported`); continue; }
    if (chat.how === 'created' && !runtimes[chat.chatId]) continue;
    invalid.push(...runtimeProblems(chat.chatId, runtimes[chat.chatId], { story: playsStory || Boolean(chat.adopted), chapters: Boolean(required.chapterRecords) }));
  }
  const drafts = existsSync(resolve(dir, 'wizard-drafts.json')) ? await readJson(resolve(dir, 'wizard-drafts.json')) : null;
  const inventory = artifactInventory({
    turns: await readJsonl(resolve(dir, TURNS_FILE)),
    payloads: await readJsonl(resolve(dir, TAIL_FILES.payloads)),
    runtimes,
    shots: existsSync(resolve(dir, 'shots')) ? (await readdir(resolve(dir, 'shots'))).filter((name) => name.endsWith('.png')).length : 0,
    wizardDrafts: (drafts?.sessions?.length ?? 0) + (drafts?.openDraft?.checkpoints?.length ? 1 : 0),
  });
  invalid.push(...artifactProblems(required, inventory));
  return { invalid, inventory, required };
}

async function comfyGuard(session: any) {
  const log = laneInfo(Number(session.lane)).log;
  if (!existsSync(log)) return [] as string[];
  const text = (await readFile(log)).subarray(Number(session.logOffset ?? 0)).toString('utf-8');
  return comfyCalls(text).map((line) => `the lane contacted ComfyUI during the session: ${line.slice(0, 200)}`);
}

async function stop(arg: string | undefined, stopLane: boolean) {
  const { dir, session } = await openSessionDir(arg, arg ? null : false);
  const doc = await loadCards();
  const card = findCard(doc, session.charter);
  const viewportEnv: Record<string, string> = session.viewport ? { ST_DEBUG_VIEWPORT: session.viewport } : {};
  let pageEnd: any = {};
  let diffOutput = '';
  const outcome = await stopSequence({
    endPhase: async () => {
      const end = await inLane(session.lane, ['scripts/debug/so-session.mts', '_page', 'end', resolve(dir, 'session.json'), resolve(dir, 'page-end.json')], viewportEnv, true);
      pageEnd = existsSync(resolve(dir, 'page-end.json')) ? await readJson(resolve(dir, 'page-end.json')) : {};
      return { ok: end.code === 0 && Array.isArray(pageEnd.ends), problems: [...(end.code !== 0 ? [`end phase failed: ${end.output.slice(-600)}`] : []), ...(pageEnd.problems ?? [])] };
    },
    headerDiff: async () => {
      const diff = await inLane(session.lane, headerDiffArgs(resolve(dir, 'run-header-start.json'), resolve(dir, 'run-header-end.json'), pageEnd.chats ?? session.chats ?? []), viewportEnv);
      diffOutput = diff.output;
      await writeFile(resolve(dir, 'run-header-diff.txt'), diff.output, 'utf-8');
      return diff;
    },
    requestDrain: async () => {
      for (const name of TAIL_NAMES) await writeFile(ackPaths(resolve(dir, TAIL_FILES[name])).drain, new Date().toISOString(), 'utf-8');
    },
    waitDrained: async () => (await waitFor(allAcked(dir, 'drained'), DRAIN_TIMEOUT_MS)) ?? readTailAcks(dir),
    killTails: () => killTails(session.pids),
    verify: async () => {
      const merged = { ...session, chats: pageEnd.chats ?? session.chats };
      const verified = await verifySession(dir, merged, doc, card);
      await writeFile(resolve(dir, 'artifacts.json'), JSON.stringify({ required: verified.required, inventory: verified.inventory }, null, 2), 'utf-8');
      return [...verified.invalid, ...await comfyGuard(session)];
    },
  });
  const spend = await meterDir(dir, session);
  const rubricPath = resolve(dir, 'rubric.json');
  const unexercised: MediaKind[] = session.media?.unexercised ?? [];
  const rubric = existsSync(rubricPath) ? await readJson(rubricPath) : rubricTemplate(card, { dir: session.dir, lane: session.lane, startedAt: session.startedAt, media: session.media?.variant ?? 'full' }, unexercised);
  rubric.playerClean = pageEnd.playerClean ?? (session.mode === 'player' ? { ok: false, error: 'the player surface was not checked' } : { skipped: 'author-mode card' });
  await writeFile(rubricPath, JSON.stringify(rubric, null, 2), 'utf-8');
  const stopped = {
    ...session, stoppedAt: new Date().toISOString(), chats: pageEnd.chats ?? session.chats, runHeaderDiff: outcome.runHeaderDiff,
    evidence: { files: pageEnd.files ?? [], problems: pageEnd.evidenceProblems ?? {} }, playerClean: rubric.playerClean, spend,
    tails: outcome.acks, valid: outcome.valid, invalid: outcome.invalid,
    problems: [...(session.problems ?? []), ...outcome.problems],
    warnings: [...(session.warnings ?? []), ...outcome.warnings],
  };
  await writeFile(resolve(dir, 'session.json'), JSON.stringify(stopped, null, 2), 'utf-8');
  await writeBudget();
  const gates = card.rubric.map((row) => row.gate).filter((gate): gate is BlindGate => Boolean(gate));
  const packs = gates.length ? await buildRatingPacks([...new Set(gates)]) : [];
  const root = rootOf(doc, card);
  const rootSession = root.id === card.id ? stopped : (await allSessions()).map((entry) => entry.session).filter((entry) => entry.charter === root.id).pop();
  const lease = leaseFor(doc, root, Number(session.lane), String(rootSession?.dir ?? session.dir), (rootSession?.chats ?? []).map((chat: any) => chat.chatId), await sessionsUnder(SESSIONS_ROOT));
  await writeLease(laneInfo(Number(session.lane)).root, lease);
  if (stopLane) await run(['scripts/debug/st-lanes.mts', 'stop', String(session.lane)]);
  console.log(JSON.stringify({
    dir: session.dir, stoppedAt: stopped.stoppedAt, valid: outcome.valid, invalid: outcome.invalid, steps: outcome.steps, runHeaderDiff: outcome.runHeaderDiff,
    runHeaderDiffTail: outcome.runHeaderDiff.ok ? undefined : diffOutput.slice(-600), chats: stopped.chats.map((chat: any) => chat.chatId), evidence: stopped.evidence,
    playerClean: rubric.playerClean?.ok ?? rubric.playerClean, spend, rubric: rel(rubricPath), rubricSummary: rubricSummary(rubric), packs, lease, problems: stopped.problems, warnings: outcome.warnings, laneStopped: stopLane,
  }, null, 2));
  if (!outcome.valid) process.exitCode = 1;
  return stopped;
}

export async function buildRatingPacks(gates: readonly BlindGate[] = BLIND_GATES, root = RATING_PACK_ROOT) {
  const doc = await loadCards();
  const sessions = await allSessions();
  const out: Array<Record<string, unknown>> = [];
  for (const gate of gates) {
    const cards = new Set(doc.cards.filter((card) => card.rubric.some((row) => row.gate === gate)).map((card) => card.id));
    const candidates: Candidate[] = [];
    for (const { dir, session } of sessions.filter((entry) => cards.has(entry.session.charter))) {
      const sessionDir = rel(dir);
      candidates.push(...candidatesFromTurns(gate, parseJsonl(existsSync(resolve(dir, TURNS_FILE)) ? await readFile(resolve(dir, TURNS_FILE), 'utf-8') : ''), sessionDir));
      if (gate === 'W6' && session.arm && existsSync(resolve(dir, 'wizard-drafts.json'))) {
        const drafts = await readJson(resolve(dir, 'wizard-drafts.json'));
        const story = drafts.openDraft ?? null;
        const candidate = storyCandidate(gate, String(session.arm), String(session.premise?.id ?? session.charter), story, `${sessionDir}/wizard-drafts.json`);
        if (candidate) candidates.push(candidate);
      }
    }
    const gateDir = resolve(root, gate);
    await mkdir(gateDir, { recursive: true });
    await mkdir(resolve(root, '.keys'), { recursive: true });
    const previous: Verdict[] = existsSync(resolve(gateDir, 'verdicts.json')) ? (await readJson(resolve(gateDir, 'verdicts.json'))).verdicts ?? [] : [];
    const pack = buildPack(gate, candidates, `${gate}-pack-v1`, previous);
    const leaks = packLeaks(pack.pairs);
    if (leaks.length) throw new Error(`rating pack ${gate} would leak its labels:\n- ${leaks.join('\n- ')}`);
    await writeFile(resolve(gateDir, 'pairs.json'), `${JSON.stringify({ gate, instructions: 'Rate each pair blind: pick left, right or tie in verdicts.json and write your name as rater. Do not open .keys/.', pairs: pack.pairs }, null, 2)}\n`, 'utf-8');
    await writeFile(resolve(gateDir, 'verdicts.json'), `${JSON.stringify({ gate, verdicts: pack.verdicts }, null, 2)}\n`, 'utf-8');
    await writeFile(resolve(gateDir, 'status.json'), `${JSON.stringify({ ...pack.status, candidates: candidates.length, unmatched: pack.unmatched }, null, 2)}\n`, 'utf-8');
    await writeFile(resolve(root, '.keys', `${gate}.json`), `${JSON.stringify({ gate, key: pack.key }, null, 2)}\n`, 'utf-8');
    out.push({ ...pack.status, candidates: candidates.length, unmatched: pack.unmatched });
  }
  return out;
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

export interface LiveCli { verb: LiveVerb; dir: string | undefined; args: LiveRequest['args']; chat: string | null; options: LiveRequest['options']; tag?: LiveRequest['tag'] }

export const ARM_VERBS: readonly string[] = ['turn', 'swipe-new', 'regen'];

export function parseLiveArgs(verb: LiveVerb, rest: string[]): LiveCli {
  const flags = new Set(['--chat', '--timeout-ms', '--to', '--via', '--quiet-ms', '--arm', '--gate']);
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
  const arm = argValue(rest, '--arm');
  const gate = argValue(rest, '--gate');
  if ((arm || gate) && !ARM_VERBS.includes(verb)) throw new Error(`--arm/--gate tag a generated reply: ${ARM_VERBS.join(', ')} only`);
  if (gate && !(BLIND_GATES as readonly string[]).includes(gate)) throw new Error(`--gate must be one of ${BLIND_GATES.join(', ')}`);
  return { verb, dir, args, chat: argValue(rest, '--chat'), options, ...(arm || gate ? { tag: { ...(arm ? { arm } : {}), ...(gate ? { gate } : {}) } } : {}) };
}

async function live(cli: LiveCli) {
  const { dir, session } = await openSessionDir(cli.dir, null);
  if (session.stoppedAt) throw new Error(`${session.dir} is stopped; start a new session to play more`);
  const viewportEnv: Record<string, string> = session.viewport ? { ST_DEBUG_VIEWPORT: session.viewport } : {};
  const chat = cli.verb === 'adopt' ? null : sessionChat(session, cli.chat);
  const args = cli.verb === 'shot' ? { ...cli.args, seq: await nextSeq(dir) } : cli.args;
  const gates = findCard(await loadCards(), session.charter).rubric.map((row) => row.gate).filter(Boolean);
  const tag = cli.tag?.arm && !cli.tag.gate && gates.length === 1 ? { ...cli.tag, gate: gates[0] } : cli.tag;
  if (tag?.arm && !tag.gate) throw new Error(`${session.charter} feeds ${gates.length ? gates.join(' and ') : 'no blind gate'}: name the gate with --gate`);
  const record = await liveInLane(session.lane, viewportEnv, { verb: cli.verb, dir, chat, args, options: cli.options, ...(tag ? { tag } : {}) });
  const row = await appendTurn(dir, record);
  let chats: ChatRef[] = session.chats ?? [];
  if (cli.verb === 'adopt' && record.ok && record.chat?.chatId) {
    const adopted = { chatId: record.chat.chatId, groupId: record.chat.groupId, group: record.chat.group, storyId: record.chat.storyId, activeCheckpointId: record.chat.activeCheckpointId, primary: true, adopted: true };
    chats = [...chats.map((existing: any) => ({ ...existing, primary: false })).filter((existing: any) => existing.chatId !== adopted.chatId), adopted];
  }
  chats = trackChat(chats, record.observe ?? null, cli.verb);
  if (JSON.stringify(chats) !== JSON.stringify(session.chats ?? [])) await writeFile(resolve(dir, 'session.json'), JSON.stringify({ ...session, chats }, null, 2), 'utf-8');
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
  const missing = REQUIRED_CAPTURES.filter((name) => !existsSync(resolve(dir, name)));
  return {
    files: {
      session, journal: parseJsonl(await text('journal.jsonl')), payloads: parseJsonl(await text('payloads.jsonl')), console: parseJsonl(await text('console.jsonl')), logs, chats, states, story,
      turns: parseJsonl(await text(TURNS_FILE)), missing,
    },
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
  console.log(JSON.stringify({ dir: sessionDir, valid: result.valid, invalid: result.invalid, counts: result.counts, unverifiable: result.unverifiable, wrote: [`${sessionDir}/findings.md`, `${sessionDir}/findings.json`] }, null, 2));
  if (!result.valid) process.exitCode = 1;
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

export const pinProblems = (pinCommit: string, index: StoryIndex, doc: CardDoc) => [
  ...(index.commit !== pinCommit ? [`the story index is ${index.commit}, the adolion-fresh pin is ${pinCommit}: run so-session index`] : []),
  ...(doc.pin !== pinCommit ? [`charters.json pins ${doc.pin}, the adolion-fresh pin is ${pinCommit}: run so-session index`] : []),
];

async function validate() {
  const [doc, index, premises, pin, baseline] = await Promise.all([loadCards(), loadIndex(), loadPremises(), readJson(PIN_FILE), loadBaseline()]);
  const plan: LanePlan | null = existsSync(LANE_PLAN_PATH) ? await readJson(LANE_PLAN_PATH) : null;
  const problems = [...validateCardDoc(doc, index, premises), ...pinProblems(pin.commit, index, doc), ...baselineProblems(baseline), ...planDrift(plan, planLanes(doc))];
  const storyData = doc.cards.flatMap((card) => featureProblems(doc, card, index));
  console.log(JSON.stringify({ cards: doc.cards.length, pin: pin.commit, problems, storyData, startable: doc.cards.length - new Set(storyData.map((line) => line.split(':')[0])).size }, null, 2));
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
    features: storyFeatures(raw),
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
  const chartersText = await readFile(CHARTERS_PATH, 'utf-8');
  const repinned = repinCharters(chartersText, pin.commit);
  if (repinned !== chartersText) await writeFile(CHARTERS_PATH, repinned, 'utf-8');
  const doc = await loadCards();
  await writeFile(CARDS_DOC_PATH, renderCardsDocument(doc, index), 'utf-8');
  const storyData = doc.cards.flatMap((card) => featureProblems(doc, card, index));
  console.log(JSON.stringify({
    wrote: [rel(INDEX_PATH), ...(repinned !== chartersText ? [rel(CHARTERS_PATH)] : []), rel(CARDS_DOC_PATH)], pin: pin.commit, stories: Object.keys(stories).length, examples: Object.keys(examples).length,
    features: Object.fromEntries(Object.entries(sorted).map(([id, entry]) => [id, entry.features])), storyData,
  }, null, 2));
}

export function repinCharters(text: string, commit: string): string {
  const match = /("pin"\s*:\s*")([0-9a-f]+)(")/.exec(text);
  if (!match) throw new Error('charters.json has no "pin" field');
  return match[2] === commit ? text : `${text.slice(0, match.index)}${match[1]}${commit}${match[3]}${text.slice(match.index + match[0].length)}`;
}

async function planCommand(rest: string[]) {
  const doc = await loadCards();
  const lanes = (argValue(rest, '--lanes') ?? DEFAULT_LANES.join(',')).split(',').map(Number).filter((lane) => Number.isInteger(lane) && lane > 0);
  const only = argValue(rest, '--only')?.split(',').map((id) => id.trim()).filter(Boolean) ?? null;
  const plan = planLanes(doc, lanes, only);
  if (rest.includes('--check')) {
    const drift = planDrift(existsSync(LANE_PLAN_PATH) ? await readJson(LANE_PLAN_PATH) : null, plan);
    console.log(JSON.stringify({ drift, problems: plan.problems }, null, 2));
    if (drift.length || plan.problems.length) process.exitCode = 1;
    return plan;
  }
  if (rest.includes('--write')) await writeFile(LANE_PLAN_PATH, `${JSON.stringify({ ...plan, writtenAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
  console.log(JSON.stringify({ queues: plan.queues, reservations: plan.reservations, waves: plan.waves, problems: plan.problems, wrote: rest.includes('--write') ? rel(LANE_PLAN_PATH) : null }, null, 2));
  if (plan.problems.length) process.exitCode = 1;
  return plan;
}

async function settingRecord(page: any, path: string, value: unknown) {
  const [{ evaluateInST }, { saveSettingsNow }] = await Promise.all([import('./lib/evaluate.mts'), import('./lib/settingsSave.mts')]);
  const before = await evaluateInST(page, ({ path, value }: { path: string; value: unknown }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const root = (ctx.extensionSettings['story-orchestrator'] ||= {}) as Record<string, any>;
    const settings = (root.settings ||= {}) as Record<string, any>;
    const keys = path.split('.');
    let node = settings;
    for (const key of keys.slice(0, -1)) node = (node[key] = node[key] && typeof node[key] === 'object' ? node[key] : {});
    const previous = node[keys[keys.length - 1]];
    node[keys[keys.length - 1]] = value;
    return previous === undefined ? null : previous;
  }, { path, value });
  await saveSettingsNow(page);
  const after = await evaluateInST(page, (path: string) => path.split('.').reduce((node: any, key) => (node && typeof node === 'object' ? node[key] : undefined), (globalThis as any).storyOrchestratorRuntime?.getGlobalSettings?.() ?? null) ?? null, path);
  const landed = JSON.stringify(after) === JSON.stringify(value);
  return { kind: 'setting', at: new Date().toISOString(), path, before, value, after, ok: landed, ...(landed ? {} : { problems: [`the runtime reads ${JSON.stringify(after)} for ${path}, ${JSON.stringify(value)} was written`] }) };
}

async function liveChild(input: string, output: string) {
  const [{ runCli }, { defaultLiveDeps, runLive }, reads] = await Promise.all([import('./lib/cli.mts'), import('./lib/sessionDriver.mts'), import('./lib/sessionPageReads.mts')]);
  const request: LiveRequest & { verb: LiveVerb | 'setting' } = await readJson(input);
  await runCli(async (page) => {
    let record: Record<string, any>;
    try {
      record = request.verb === 'setting'
        ? await settingRecord(page, String((request.args as any).path), (request.args as any).value)
        : await runLive(page, request as LiveRequest, await defaultLiveDeps());
    } catch (error) {
      record = { kind: request.verb, at: new Date().toISOString(), ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    try {
      const [observed, transcript] = await Promise.all([reads.readObservation(page), reads.readTranscript(page)]);
      const context = reads.contextOf(transcript.messages);
      record = { ...record, observe: { ...observed, context }, ...(request.tag ?? {}) };
      if (request.verb === 'flag') record = { ...record, context: { chatId: transcript.chatId, messageId: transcript.messages.length - 1, messages: context } };
      await appendFile(resolve(request.dir, TRANSCRIPTS_FILE), `${JSON.stringify({ at: new Date().toISOString(), verb: request.verb, chatId: transcript.chatId, messages: transcript.messages })}\n`, 'utf-8');
    } catch (error) {
      record = { ...record, observeError: error instanceof Error ? error.message : String(error) };
    }
    await writeFile(output, JSON.stringify(record), 'utf-8');
    return { ok: record.ok !== false };
  });
}

async function settingCommand(dirArg: string | undefined, path: string | undefined, raw: string | undefined) {
  if (!dirArg || !path || raw === undefined) throw new Error('setting needs <dir> <path> <json value>');
  const { dir, session } = await openSessionDir(dirArg, null);
  if (session.stoppedAt) throw new Error(`${session.dir} is stopped`);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`setting value must be JSON (got ${raw})`); }
  const viewportEnv: Record<string, string> = session.viewport ? { ST_DEBUG_VIEWPORT: session.viewport } : {};
  const record = await liveInLane(session.lane, viewportEnv, { verb: 'setting' as LiveVerb, dir, chat: null, args: { path, value } as any });
  const row = await appendTurn(dir, record);
  console.log(JSON.stringify(row, null, 2));
  if (record.ok === false) process.exitCode = 1;
  return row;
}

async function pagePhase(phase: 'settings' | 'effective' | 'pin' | 'open' | 'end', input: string, output: string) {
  const [{ runCli }, { evaluateInST }, navigation, { saveSettingsNow }, { renderMarkdown }, evidenceLib, pinLib, reads] = await Promise.all([
    import('./lib/cli.mts'), import('./lib/evaluate.mts'), import('./st-navigation.mts'), import('./lib/settingsSave.mts'), import('./so-journal.mts'),
    import('./lib/sessionEvidence.mts'), import('./lib/sessionPin.mts'), import('./lib/sessionPageReads.mts'),
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
      const current = await evaluateInST(page, () => {
        const ctx = SillyTavern.getContext();
        const root = ctx.extensionSettings['story-orchestrator'] as Record<string, any> | undefined;
        return root?.settings ? JSON.parse(JSON.stringify(root.settings)) : {};
      });
      const written = applyOverBaseline(current, plan.expected, plan.installOwned);
      out.before = current;
      out.written = written;
      await evaluateInST(page, (settings: Record<string, any>) => {
        const ctx = SillyTavern.getContext();
        const root = (ctx.extensionSettings['story-orchestrator'] ||= {}) as Record<string, any>;
        root.settings = settings;
        return true;
      }, written);
      await saveSettingsNow(page);
    }

    if (phase === 'effective') {
      out.settings = await reads.readEffectiveSettings(page);
      out.host = await reads.readHostSwipes(page);
      out.problems = [...(out.settings ? effectiveProblems(plan.expected, out.settings, plan.installOwned) : ['the runtime returned no settings']), ...hostSwipesProblems(out.host as { swipes: boolean | null })];
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
      out.chatsBefore = await reads.readChatInventory(page);
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
      const created = newChats(session.chatsBefore ?? [], await reads.readChatInventory(page)).filter((chat) => !(session.chats ?? []).some((known: any) => known.chatId === chat.chatId));
      const tracked: ChatRef[] = [...(session.chats ?? []), ...created.map((chat) => ({ ...chat, primary: false, how: 'created' }))];
      out.chats = tracked;
      if (session.story?.kind === 'wizard') {
        const drafts = await reads.readWizardDrafts(page);
        await writeFile(resolve(dir, 'wizard-drafts.json'), JSON.stringify(drafts, null, 1), 'utf-8');
        files.push('wizard-drafts.json');
      }
      const ordered = [...tracked].sort((a: any, b: any) => Number(Boolean(a.primary)) - Number(Boolean(b.primary)));
      for (const chat of ordered as Array<{ chatId: string; group: string | null }>) {
        try {
          if (!chat.group) throw new Error('the chat belongs to no group the session knows');
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
              payloadEpoch: (globalThis as any).__soDebugPayloads?.epoch ?? null,
            },
          };
        });
        if (!read.chatId) { problems.push(`no chat open after reopening ${chat.chatId}`); continue; }
        if (read.chatId !== chat.chatId) { problems.push(`reopening ${chat.chatId} landed in ${read.chatId}`); continue; }
        await writeFile(resolve(dir, `runtime-${read.chatId}.json`), JSON.stringify(await reads.readRuntimeBlob(page), null, 1), 'utf-8');
        files.push(`runtime-${read.chatId}.json`);
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
  const [{ runCli }, tails] = await Promise.all([import('./lib/cli.mts'), import('./lib/sessionTails.mts')]);
  await tails.clearAcks(outFile);
  await runCli(async (page) => {
    let rows = 0;
    let pending: Promise<unknown> = Promise.resolve();
    const write = (row: Record<string, unknown>) => {
      rows += 1;
      pending = pending.then(() => appendFile(outFile, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`, 'utf-8')).catch(() => undefined);
    };
    page.on('console', (message) => {
      const type = message.type();
      if (type !== 'error' && type !== 'warning') return;
      const location = message.location();
      write({ type, text: message.text(), location: location?.url ? `${location.url}:${location.lineNumber}` : null });
    });
    page.on('pageerror', (error) => write({ type: 'pageerror', text: error.message, stack: error.stack ?? null }));
    write({ type: 'info', text: 'console tail attached' });
    await pending;
    await tails.writeAck(tails.ackPaths(outFile).ready, { tail: 'console' });
    const requested = tails.drainRequested(outFile);
    while (!requested()) await new Promise((done) => setTimeout(done, 250));
    await pending;
    await tails.writeAck(tails.ackPaths(outFile).drained, { tail: 'console', ok: true, rows });
  }, { keepOpen: true });
}

async function laneCommand(rest: string[]) {
  const [action, laneArg, archiveArg] = rest;
  const n = Number(laneArg);
  if (!['archive', 'restore', 'lease'].includes(action) || !Number.isInteger(n) || n < 1) throw new Error('lane archive <n> | lane restore <n> <archiveDir> | lane lease <n> (lane 0 is the user\'s)');
  const lane = laneInfo(n);
  const sessions = await sessionsUnder(SESSIONS_ROOT);
  const lease = await readLease(lane.root);
  if (action === 'lease') {
    console.log(JSON.stringify({ lane: n, lease, outstanding: outstandingDependents(lease, sessions) }, null, 2));
    return;
  }
  const pidFile = resolve(lane.root, 'server.pid');
  const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf-8').trim()) : null;
  if (pid && isAlive(pid)) throw new Error(`lane ${n} is running (pid ${pid}): stop it first (st-lanes.mts stop ${n})`);
  if (action === 'archive') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = resolve(lanesRootFor(process.env, REPO_ROOT), 'archive', `${n}-${lease?.holder ?? 'lane'}-${stamp}`);
    const record = await archiveLane(lane.root, target, { lane: n, lease, outstanding: outstandingDependents(lease, sessions) });
    console.log(JSON.stringify({ archived: target, ...record }, null, 2));
    return;
  }
  if (!archiveArg) throw new Error('lane restore needs the archive directory');
  const waiting = outstandingDependents(lease, sessions);
  if (waiting.length) throw new Error(`lane ${n} holds a leased chat that ${waiting.join(', ')} still continue: archive it before restoring over it`);
  console.log(JSON.stringify({ restored: archiveArg, into: lane.root, ...(await restoreLane(resolve(archiveArg), lane.root)) }, null, 2));
}

const argValue = (args: string[], name: string) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : null;
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(USAGE); return; }
  if (command === '_page') { await pagePhase(rest[0] as 'settings' | 'effective' | 'pin' | 'open' | 'end', rest[1], rest[2]); return; }
  if (command === '_live') { await liveChild(rest[0], rest[1]); return; }
  if (command === '_console') { await consoleTail(rest[0]); return; }
  if (command === 'start') {
    if (!rest[0] || rest[0].startsWith('--')) { console.log(USAGE); process.exitCode = 2; return; }
    const lane = argValue(rest, '--lane');
    const age = argValue(rest, '--age');
    const media = argValue(rest, '--media') ?? 'off';
    if (media !== 'on' && media !== 'off') { console.error('--media must be on or off'); process.exitCode = 2; return; }
    await start(rest[0], {
      lane: lane === null ? null : Number(lane), allowComfy: rest.includes('--allow-comfy'), seed: !rest.includes('--no-seed'), forceWaiting: rest.includes('--force-waiting'),
      profile: argValue(rest, '--profile') ?? DEFAULT_MAIN_PROFILE, orchestrator: argValue(rest, '--orchestrator') ?? DEFAULT_ORCHESTRATOR.source, age: age === null ? null : Number(age),
      media, arm: argValue(rest, '--arm'), breakLease: rest.includes('--break-lease'),
    });
  } else if ((LIVE_VERBS as readonly string[]).includes(command)) await live(parseLiveArgs(command as LiveVerb, rest));
  else if (command === 'setting') await settingCommand(rest[0], rest[1], rest[2]);
  else if (command === 'lane') await laneCommand(rest);
  else if (command === 'rating-pack') {
    const gate = rest.find((arg) => !arg.startsWith('--'));
    if (gate && !(BLIND_GATES as readonly string[]).includes(gate)) throw new Error(`rating-pack gate must be one of ${BLIND_GATES.join(', ')}`);
    console.log(JSON.stringify(await buildRatingPacks(gate ? [gate as BlindGate] : BLIND_GATES), null, 2));
  }
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

