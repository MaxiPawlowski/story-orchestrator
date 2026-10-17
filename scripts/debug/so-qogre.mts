import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { PROJECT_ROOT } from './lib/connection.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { deleteLorebooksInPage, WORLD_INFO_MODULE_URL } from './lib/lorebookDelete.mts';
import { connectThroughRelay, installReplyRelay, RELAY_MODEL_ID, type RelayCall } from './lib/replyRelay.mts';
import { askSolAgent, mapLimit, parseJsonObject, withRetry } from './lib/solCall.mts';
import {
  abaScript, agreementPrompt, AGREEMENT_SYSTEM, caseFile, labBook, parseRating, playerLineBefore, QO_BOOK, QO_CASES, QO_DIR, QO_FLOORS, QO_GROUP,
  QO_SESSIONS, QO_SWIPES, raterPrompt, RATER_SYSTEM, scenarioFiles, scoreCase, stringPass, summarize, type QoCase, type QoRating, type QoReply, type QoTranscript,
} from './lib/quantumOgre.mts';
import { runScenario } from './so-scenario.mts';

const USAGE = `Usage: node scripts/debug/so-qogre.mts <command> [options]

v2.8 62 stage 1: the quantum-ogre continuity probe (contradiction, persistence, disclosure; agreement as information).

  scenarios [--check]       write (or check) ${QO_DIR}/quantum-ogre-*.json, the lab story and the lab lorebook
  run --out <dir> [--relay sol|none] [--cases id,id] [--keep-book]
                            on the lane the env points at (st-lanes.mts run <n> -- ...): create the lab lorebook, then
                            run every case scenario in a sandbox chat of "${QO_GROUP}". --relay sol (default) serves
                            every streamed reply from Sol (opencode, openai/gpt-6.1-sol, tools off) and refuses side
                            calls; --relay none leaves replies to the lane's own model (the Artemis leg, Q1r).
                            Writes <dir>/run.json, <dir>/<case>.json (replies, transcript, relay calls).
  rate --run <dir> [--concurrency 3]
                            blind Sol rater per reply (fact, player line and reply only) plus one agreement call per
                            case; resumable, writes <dir>/ratings.json
  score --run <dir> [--asks <n>]
                            Q1, Q2, Q2d, Q2a against the predeclared floors -> <dir>/score.json; --asks 4 reads only
                            ask-0..3 per case (the Q1r shape: 5 cases x 4 replies)
  swipe-aba --out <dir>     Q3: the swipe A->B->A scenario with the scripted relay (no model) -> <dir>/aba.json

Private run folders belong under ${QO_SESSIONS}/ (gitignored).`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
};
const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`${name} is required\n${USAGE}`);
  return value;
};
const abs = (path: string) => resolve(PROJECT_ROOT, path);
const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf-8'));
const fixtureJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function scenariosCommand(check: boolean): { problems: string[]; files: number } {
  const problems: string[] = [];
  const files = scenarioFiles();
  for (const [path, value] of files) {
    const full = abs(path);
    if (!check) {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, fixtureJson(value), 'utf-8');
      continue;
    }
    const current = existsSync(full) ? readFileSync(full, 'utf-8').replace(/\r\n/g, '\n') : null;
    if (current !== fixtureJson(value)) problems.push(`${path} differs from the generator (run so-qogre.mts scenarios)`);
  }
  const extra = existsSync(abs(QO_DIR)) ? readdirSync(abs(QO_DIR)).filter((name) => name.startsWith('quantum-ogre') && !files.some(([path]) => path.endsWith(`/${name}`))) : [];
  for (const name of extra) problems.push(`${QO_DIR}/${name} is not produced by the generator`);
  return { problems, files: files.length };
}

async function servedBundle(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    try {
      const buffer = await (await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js', { cache: 'no-store' })).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
    } catch {
      return null;
    }
  });
}

async function ensureBook(page: Page) {
  return page.evaluate(async ({ name, data, moduleUrl }) => {
    const wi = await import(/* webpackIgnore: true */ moduleUrl);
    await wi.saveWorldInfo(name, data, true);
    await wi.updateWorldInfoList();
    return { listed: wi.world_names.includes(name), entries: Object.keys(data.entries).length };
  }, { name: QO_BOOK, data: labBook(), moduleUrl: WORLD_INFO_MODULE_URL });
}

async function readRecords(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (Array.isArray((globalThis as any).__qoRec) ? (globalThis as any).__qoRec : []));
}

async function resetRecords(page: Page) {
  await page.evaluate(() => { (globalThis as any).__qoRec = []; });
}

export async function runCommand(page: Page, args: string[]) {
  const out = abs(need(args, '--out'));
  const relayMode = option(args, '--relay') ?? 'sol';
  if (!['sol', 'none'].includes(relayMode)) throw new Error('--relay is sol or none');
  const only = option(args, '--cases')?.split(',').map((id) => id.trim()).filter(Boolean) ?? null;
  const cases = QO_CASES.filter((item) => !only || only.includes(item.id));
  if (!cases.length) throw new Error(`no case matches ${only?.join(',')}`);
  mkdirSync(out, { recursive: true });
  const header = { at: new Date().toISOString(), relay: relayMode, served: await servedBundle(page), lane: process.env.SO_LANE ?? null, url: page.url(), cases: cases.map((item) => item.id) };
  writeJson(join(out, 'run.json'), header);
  console.log(JSON.stringify(header));
  const book = await ensureBook(page);
  if (!book.listed) throw new Error(`could not create ${QO_BOOK}`);
  let calls: RelayCall[] = [];
  const relay = relayMode === 'sol' ? await installReplyRelay(page, { mode: 'sol', workDir: join(out, 'sol'), onCall: (call) => console.log(`relay ${call.index} ${call.speaker} ${call.ms}ms ${call.error ? `ERROR ${call.error}` : `${call.text.length} chars`}`) }) : null;
  const results: Array<{ case: string; ok: boolean; error: string | null; replies: number }> = [];
  if (relay) {
    const connected = await connectThroughRelay(page);
    if (connected.online !== RELAY_MODEL_ID) throw new Error(`the page did not connect through the relay: ${JSON.stringify(connected)}`);
  }
  try {
    for (const item of cases) {
      const done = join(out, `${item.id}.json`);
      if (existsSync(done) && readJson<{ ok: boolean }>(done).ok) {
        console.log(`skip ${item.id}: already recorded`);
        continue;
      }
      await resetRecords(page);
      const before = relay ? relay.calls.length : 0;
      const result = await runScenario(page, caseFile(item), { sandbox: true, group: QO_GROUP }) as { ok: boolean; error?: string | null; steps: unknown[]; cleanup?: unknown };
      const records = await readRecords(page);
      calls = relay ? relay.calls.slice(before) : [];
      const replies = records.filter((row) => (row as { tag?: string }).tag !== 'transcript') as QoReply[];
      const transcript = (records.find((row) => (row as { tag?: string }).tag === 'transcript') ?? null) as QoTranscript | null;
      writeJson(done, { case: item.id, ok: result.ok, error: result.error ?? null, served: await servedBundle(page), replies, transcript, relay: calls, steps: result.steps.length, cleanup: result.cleanup ?? null });
      results.push({ case: item.id, ok: result.ok, error: result.error ?? null, replies: replies.length });
      console.log(`${item.id}: ${result.ok ? 'ok' : `FAIL ${result.error}`} (${replies.length} replies)`);
    }
  } finally {
    await relay?.stop();
    const removed = args.includes('--keep-book') ? null : await deleteLorebooksInPage(page, [QO_BOOK]).catch((error) => ({ error: String(error) }));
    writeJson(join(out, 'run-end.json'), { at: new Date().toISOString(), served: await servedBundle(page).catch(() => null), results, refusedSideCalls: relay?.refused() ?? null, book: removed });
  }
  const ok = results.every((row) => row.ok);
  return { ok, results };
}

const RATER = { id: 'so-qo-rater', system: RATER_SYSTEM };
const AGREE = { id: 'so-qo-agree', system: AGREEMENT_SYSTEM };

export async function rateCommand(args: string[], ask = (agent: typeof RATER, prompt: string, dir: string) => withRetry(() => askSolAgent(agent, prompt, dir))) {
  const run = abs(need(args, '--run'));
  const limit = Math.max(1, Number(option(args, '--concurrency') ?? 3) || 3);
  const path = join(run, 'ratings.json');
  const store: { ratings: QoRating[]; agreement: Record<string, { largest_group: number; groups: number } | null> } = existsSync(path) ? readJson(path) : { ratings: [], agreement: {} };
  const key = (rating: { case: string; tag: string }) => `${rating.case}|${rating.tag}`;
  const done = new Set(store.ratings.filter((rating) => !rating.error).map(key));
  store.ratings = store.ratings.filter((rating) => !rating.error);
  for (const item of QO_CASES) {
    const file = join(run, `${item.id}.json`);
    if (!existsSync(file)) continue;
    const { replies } = readJson<{ replies: QoReply[] }>(file);
    const todo = replies.filter((reply) => !done.has(key(reply)));
    const rated = await mapLimit(todo, limit, async (reply) => {
      const base = { case: item.id, tag: reply.tag, speaker: reply.speaker, ...stringPass(item, reply.text) };
      try {
        const answer = await ask(RATER, raterPrompt(item, reply, playerLineBefore(item, reply.tag)), join(run, 'rater'));
        const parsed = parseRating(parseJsonObject(answer.text));
        if (!parsed) return { ...base, statesFact: false, contradicts: false, conflicting: [], detail: null, error: `unparsed: ${answer.text.slice(0, 200)}` };
        return { ...base, ...parsed };
      } catch (error) {
        return { ...base, statesFact: false, contradicts: false, conflicting: [], detail: null, error: error instanceof Error ? error.message : String(error) };
      }
    });
    store.ratings.push(...rated);
    const details = store.ratings.filter((rating) => rating.case === item.id && /^ask-\d+$/.test(rating.tag) && !rating.error).sort((a, b) => a.tag.localeCompare(b.tag)).map((rating) => rating.detail);
    if (store.agreement[item.id] === undefined || store.agreement[item.id] === null) {
      const answered = details.filter(Boolean).length;
      if (answered < 2) store.agreement[item.id] = { largest_group: answered, groups: answered };
      else {
        try {
          const answer = await ask(AGREE, agreementPrompt(item, details), join(run, 'rater'));
          const parsed = parseJsonObject(answer.text);
          store.agreement[item.id] = typeof parsed?.largest_group === 'number' && typeof parsed?.groups === 'number' ? { largest_group: parsed.largest_group, groups: parsed.groups } : null;
        } catch {
          store.agreement[item.id] = null;
        }
      }
    }
    writeJson(path, store);
    console.log(`${item.id}: rated ${rated.length} (${rated.filter((rating) => rating.error).length} errors), agreement ${JSON.stringify(store.agreement[item.id])}`);
  }
  return { ok: store.ratings.every((rating) => !rating.error), ratings: store.ratings.length };
}

export function scoreCommand(args: string[]) {
  const run = abs(need(args, '--run'));
  const store = readJson<{ ratings: QoRating[]; agreement: Record<string, { largest_group: number; groups: number } | null> }>(join(run, 'ratings.json'));
  const header = existsSync(join(run, 'run.json')) ? readJson<Record<string, unknown>>(join(run, 'run.json')) : null;
  const asks = Number(option(args, '--asks') ?? QO_SWIPES + 1);
  const scores = QO_CASES.filter((item) => existsSync(join(run, `${item.id}.json`))).map((item: QoCase) => {
    const { replies } = readJson<{ replies: QoReply[] }>(join(run, `${item.id}.json`));
    return scoreCase(item, store.ratings, replies, store.agreement[item.id] ?? null, asks);
  });
  const result = { header, floors: QO_FLOORS, asks, summary: summarize(scores, scores.length * asks), cases: scores };
  writeJson(join(run, 'score.json'), result);
  console.log(JSON.stringify(result.summary, null, 2));
  return { ok: result.summary.Q1.complete && result.summary.Q2.complete && result.summary.ratingErrors === 0, summary: result.summary };
}

export async function abaCommand(page: Page, args: string[]) {
  const out = abs(need(args, '--out'));
  mkdirSync(out, { recursive: true });
  const relay = await installReplyRelay(page, { mode: 'scripted', workDir: out, script: abaScript });
  try {
    const connected = await connectThroughRelay(page);
    if (connected.online !== RELAY_MODEL_ID) throw new Error(`the page did not connect through the relay: ${JSON.stringify(connected)}`);
    const served = await servedBundle(page);
    const result = await runScenario(page, `${QO_DIR}/quantum-ogre-swipe-aba.json`, { sandbox: true, group: QO_GROUP }) as { ok: boolean; error?: string | null };
    const legs = await page.evaluate(() => ((globalThis as any).__qo3?.legs ?? []).map((leg: { leg: number; swipe: number; equal: boolean }) => ({ leg: leg.leg, swipe: leg.swipe, equal: leg.equal })));
    const record = { at: new Date().toISOString(), served, ok: result.ok, error: result.error ?? null, legs, passed: legs.filter((leg: { equal: boolean }) => leg.equal).length, relayCalls: relay.calls.map((call) => ({ index: call.index, speaker: call.speaker, text: call.text })) };
    writeJson(join(out, 'aba.json'), record);
    console.log(JSON.stringify(record));
    return { ok: result.ok && record.passed === 2 };
  } finally {
    await relay.stop();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasHelpFlag(args)) {
    console.log(USAGE);
    return;
  }
  if (command === 'scenarios') {
    const result = scenariosCommand(args.includes('--check'));
    for (const problem of result.problems) console.log(`FAIL ${problem}`);
    console.log(result.problems.length ? `${result.problems.length} problem(s)` : `${args.includes('--check') ? 'checked' : 'wrote'} ${result.files} files`);
    process.exitCode = result.problems.length ? 1 : 0;
    return;
  }
  if (command === 'rate') {
    const result = await rateCommand(args);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (command === 'score') {
    const result = scoreCommand(args);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (command === 'run') return runCli((page) => runCommand(page, args), { pageCapture: 'qogre' });
  if (command === 'swipe-aba') return runCli((page) => abaCommand(page, args), { pageCapture: 'qogre-aba' });
  throw new Error(`unknown command ${command}\n${USAGE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
