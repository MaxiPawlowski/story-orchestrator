import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { PROJECT_ROOT } from './lib/connection.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { coveredToOf, cutFor, WINDOW_HIGH, WINDOW_LOW } from './lib/historyWindow.mts';
import {
  belowCut, draftPrompt, DRAFT_SYSTEM, h6Verdict, installWindow, parseRecall, recallRaterPrompt, RECALL_RATER_SYSTEM, removeWindow, validateRecallSet,
  type RecallKind, type RecallRating, type RecallReply, type RecallSet,
} from './lib/historyRecall.mts';
import { connectThroughRelay, installReplyRelay, RELAY_MODEL_ID } from './lib/replyRelay.mts';
import { askSolAgent, mapLimit, parseJsonObject, withRetry } from './lib/solCall.mts';
import { waitForIdle } from './st-actions.mts';

const USAGE = `Usage: node scripts/debug/so-history-recall.mts <command> [options]

v2.8 63 H6 / H6r: recall about events below the stepped window's cut, window on vs off. The window is not built
(plan 63 B is the owner's call), so "on" is simulated harness-side: a wrapper around the extension's generate
interceptor marks every row below the cut ignored on ST's copies (the chapter-fold mechanism), loud generations only.
The cut is the plan's formula (lib/historyWindow.mts: steps of (high - low) x budget, high ${WINDOW_HIGH}, low ${WINDOW_LOW}, clamped to
durable coverage = max(shortTermSummaryEnd, last sealed chapter end), snapped forward to a player message).

  plan --probes <file> [--overhead <tokens>] [--kind H6|H6r]
        on the open chat: budget = max_context - response - overhead (default 3000), the cut, coverage, and whether
        every probe's source message is below the cut
  draft --out <file> [--count 30] [--overhead <tokens>]
        Sol drafts candidate probes from the rows below the cut into a PRIVATE file (pick 10 + 10, or 10 critical)
  ask --probes <file> --arm on|off --out <dir> [--relay sol|none] [--overhead <tokens>] [--kind H6|H6r] [--cut <row>]
        each probe: post the question, draft the responder, record the reply, then /del the pair so every probe sees
        the same history. --relay sol (H6, CL) serves replies from Sol; none (H6r) uses the lane's own model.
        --cut forces the cut (plumbing on a chat without durable coverage; the record says plumbing, never a result)
  rate --run <dir> --probes <file> [--concurrency 3]
        blind Sol rater: question, established answer, reply
  floors --run <dir> --probes <file> [--kind H6|H6r]
        H6: on >= 16/20 and >= 9/10 critical, and on >= off - 1 per stratum; H6r: recorded

Probe files and run folders are private (campaign text): keep them under test/sessions/hist63/ (gitignored).`;

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
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(abs(path), 'utf-8'));
const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(abs(path)), { recursive: true });
  writeFileSync(abs(path), `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};
const kindOf = (args: string[]): RecallKind => {
  const kind = option(args, '--kind') ?? 'H6';
  if (kind !== 'H6' && kind !== 'H6r') throw new Error('--kind is H6 or H6r');
  return kind;
};
const PRIVATE = /test[\\/]sessions[\\/]/;
const privateOnly = (path: string) => {
  if (!PRIVATE.test(abs(path))) throw new Error(`${path}: probe files and runs hold campaign text; keep them under test/sessions/ (gitignored)`);
};

interface ChatRows { rows: Array<{ index: number; name: string; user: boolean; system: boolean; tokens: number; text: string }>; maxContext: number; amountGen: number; memory: unknown; chat: string; group: string | null }

async function readRows(page: Page, withText: boolean): Promise<ChatRows> {
  return page.evaluate(async (text) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const blob = ctx.chatMetadata?.story_orchestrator;
    const storyId = rt?.getSnapshot?.()?.storyId ?? null;
    const memory = storyId ? blob?.stories?.[storyId]?.extras?.memory ?? null : null;
    const rows = [];
    for (const [index, message] of ctx.chat.entries()) {
      const body = String(message.mes ?? '');
      rows.push({ index, name: String(message.name ?? ''), user: Boolean(message.is_user), system: Boolean(message.is_system), tokens: message.is_system ? 0 : await ctx.getTokenCountAsync(body), text: text ? body : '' });
    }
    return { rows, maxContext: ctx.maxContext, amountGen: Number((document.querySelector('#amount_gen') as HTMLInputElement | null)?.value ?? 0), memory: memory ? { shortTermSummaryEnd: memory.shortTermSummaryEnd, chapters: (memory.chapters ?? []).map((record: any) => ({ status: record.status, range: record.range })) } : null, chat: ctx.chatId, group: ctx.groupId ?? null };
  }, withText);
}

export function planFrom(chat: ChatRows, overhead: number) {
  const budget = Math.max(0, chat.maxContext - chat.amountGen - overhead);
  const coverage = coveredToOf(chat.memory as never);
  const cut = cutFor({ tokens: chat.rows.map((row) => row.tokens), user: chat.rows.map((row) => row.user), budget, coveredTo: coverage.coveredTo });
  return { chat: chat.chat, group: chat.group, rows: chat.rows.length, maxContext: chat.maxContext, amountGen: chat.amountGen, overhead, budget, coverage, ...cut };
}

async function planCommand(page: Page, args: string[]) {
  const overhead = Number(option(args, '--overhead') ?? 3000);
  const plan = planFrom(await readRows(page, false), overhead);
  const probesPath = option(args, '--probes');
  let problems: string[] = [];
  if (probesPath) {
    privateOnly(probesPath);
    const set = readJson<RecallSet>(probesPath);
    problems = [...validateRecallSet(set, kindOf(args)), ...(set.chat !== plan.chat ? [`the probe file is for chat ${set.chat}, the open chat is ${plan.chat}`] : []), ...belowCut(set, plan.cut)];
  }
  console.log(JSON.stringify({ ...plan, problems }, null, 2));
  return { ok: plan.over && plan.cut > 0 && !problems.length };
}

const RATER = { id: 'so-h63-rater', system: RECALL_RATER_SYSTEM };
const DRAFT = { id: 'so-h63-draft', system: DRAFT_SYSTEM };
const sol = (agent: { id: string; system: string }, prompt: string, dir: string) => withRetry(() => askSolAgent(agent, prompt, dir));

async function draftCommand(page: Page, args: string[]) {
  const out = need(args, '--out');
  privateOnly(out);
  const count = Number(option(args, '--count') ?? 30);
  const chat = await readRows(page, true);
  const plan = planFrom(chat, Number(option(args, '--overhead') ?? 3000));
  if (!plan.over || plan.cut <= 0) throw new Error(`nothing is below a cut on this chat: ${JSON.stringify({ total: plan.total, limit: plan.limit, cut: plan.cut })}`);
  const below = chat.rows.filter((row) => row.index < plan.cut && !row.system);
  const chunks: typeof below[] = [];
  for (let index = 0; index < below.length; index += 60) chunks.push(below.slice(index, index + 60));
  const per = Math.max(2, Math.ceil(count / chunks.length));
  const drafted = (await mapLimit(chunks, 2, async (rows) => {
    const answer = await sol(DRAFT, draftPrompt(rows, per), join(dirname(abs(out)), 'sol'));
    const parsed = parseJsonObject(answer.text);
    return Array.isArray(parsed?.probes) ? parsed.probes as Array<Record<string, unknown>> : [];
  })).flat().filter((probe) => Number.isInteger(probe.source) && (probe.source as number) < plan.cut);
  writeJson(out, { chat: plan.chat, group: plan.group, responder: '', cut: plan.cut, note: 'Sol draft candidates: pick 10 critical + 10 detail (H6) or 10 critical (H6r), set responder, give each an id, and keep the file private.', candidates: drafted });
  console.log(JSON.stringify({ out, candidates: drafted.length, cut: plan.cut }));
  return { ok: drafted.length > 0 };
}

async function askCommand(page: Page, args: string[]) {
  const probesPath = need(args, '--probes');
  const outDir = need(args, '--out');
  privateOnly(probesPath);
  privateOnly(outDir);
  const arm = option(args, '--arm');
  if (arm !== 'on' && arm !== 'off') throw new Error('--arm is on or off');
  const relayMode = option(args, '--relay') ?? 'sol';
  const kind = kindOf(args);
  const set = readJson<RecallSet>(probesPath);
  const chat = await readRows(page, false);
  const computed = planFrom(chat, Number(option(args, '--overhead') ?? 3000));
  const forced = option(args, '--cut');
  const plan = forced === null ? { ...computed, plumbing: false } : { ...computed, cut: Number(forced), plumbing: true };
  const problems = [...validateRecallSet(set, kind), ...(set.chat !== plan.chat ? [`the probe file is for chat ${set.chat}, the open chat is ${plan.chat}`] : []), ...belowCut(set, plan.cut)];
  if (problems.length) throw new Error(`refused: ${problems.join('; ')}`);
  const file = join(outDir, `${arm}.json`);
  const done: RecallReply[] = existsSync(abs(file)) ? readJson<{ replies: RecallReply[] }>(file).replies : [];
  const relay = relayMode === 'sol' ? await installReplyRelay(page, { mode: 'sol', workDir: join(abs(outDir), 'sol') }) : null;
  if (relay) {
    const connected = await connectThroughRelay(page);
    if (connected.online !== RELAY_MODEL_ID) throw new Error(`the page did not connect through the relay: ${JSON.stringify(connected)}`);
  }
  if (arm === 'on') await page.evaluate(installWindow, plan.cut);
  const base = chat.rows.length;
  try {
    for (const probe of set.probes) {
      if (done.some((reply) => reply.id === probe.id)) continue;
      const started = Date.now();
      const before = await page.evaluate(() => (globalThis as any).__h63Window?.applied?.length ?? 0);
      await page.evaluate(async ({ question, responder }) => {
        const ctx = (globalThis as any).SillyTavern.getContext();
        await ctx.executeSlashCommandsWithOptions(`/send ${question}`);
        await ctx.executeSlashCommandsWithOptions(`/trigger await=true ${JSON.stringify(responder)}`);
      }, { question: probe.question, responder: set.responder });
      await waitForIdle(page, 900000);
      const read = await page.evaluate(async ({ from, base }) => {
        const root = globalThis as any;
        const ctx = root.SillyTavern.getContext();
        const last = ctx.chat[ctx.chat.length - 1];
        const text = last && !last.is_user ? String(last.mes ?? '') : '';
        const applied = root.__h63Window?.applied?.slice(from) ?? [];
        const extra = ctx.chat.length - base;
        if (extra > 0) await ctx.executeSlashCommandsWithOptions(`/del ${extra}`);
        await new Promise((resolveWait) => setTimeout(resolveWait, 2500));
        return { text, marked: applied.length ? applied[applied.length - 1].marked : null, length: ctx.chat.length };
      }, { from: before, base });
      if (read.length !== base) throw new Error(`the chat did not return to ${base} rows after ${probe.id} (now ${read.length})`);
      done.push({ id: probe.id, arm, text: read.text, cut: arm === 'on' ? plan.cut : null, marked: read.marked, ms: Date.now() - started });
      writeJson(file, { arm, plan, relay: relayMode, replies: done });
      console.log(`${probe.id} (${probe.stratum}) ${arm}: ${read.text.length} chars, marked ${read.marked ?? '-'}`);
    }
  } finally {
    if (arm === 'on') await page.evaluate(removeWindow);
    await relay?.stop();
  }
  return { ok: done.length === set.probes.length && done.every((reply) => reply.text.trim()) };
}

export async function rateCommand(args: string[], ask = sol) {
  const run = need(args, '--run');
  const probesPath = need(args, '--probes');
  privateOnly(run);
  const set = readJson<RecallSet>(probesPath);
  const path = join(run, 'ratings.json');
  const stored: RecallRating[] = existsSync(abs(path)) ? readJson<{ ratings: RecallRating[] }>(path).ratings.filter((rating) => !rating.error) : [];
  const limit = Math.max(1, Number(option(args, '--concurrency') ?? 3) || 3);
  for (const arm of ['on', 'off'] as const) {
    const file = join(run, `${arm}.json`);
    if (!existsSync(abs(file))) continue;
    const replies = readJson<{ replies: RecallReply[] }>(file).replies.filter((reply) => !stored.some((rating) => rating.id === reply.id && rating.arm === arm));
    const rated = await mapLimit(replies, limit, async (reply): Promise<RecallRating> => {
      const probe = set.probes.find((entry) => entry.id === reply.id);
      if (!probe) return { id: reply.id, arm, correct: false, contradicts: false, error: 'no such probe' };
      try {
        const parsed = parseRecall(parseJsonObject((await ask(RATER, recallRaterPrompt(probe, reply.text), join(abs(run), 'rater'))).text));
        return parsed ? { id: reply.id, arm, ...parsed } : { id: reply.id, arm, correct: false, contradicts: false, error: 'unparsed' };
      } catch (error) {
        return { id: reply.id, arm, correct: false, contradicts: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    stored.push(...rated);
  }
  writeJson(path, { ratings: stored });
  return { ok: stored.every((rating) => !rating.error), ratings: stored.length };
}

export function floorsCommand(args: string[]) {
  const run = need(args, '--run');
  const set = readJson<RecallSet>(need(args, '--probes'));
  const verdict = h6Verdict(set, readJson<{ ratings: RecallRating[] }>(join(run, 'ratings.json')).ratings, kindOf(args));
  writeJson(join(run, 'floors.json'), verdict);
  console.log(JSON.stringify(verdict, null, 2));
  return { ok: verdict.verdict !== 'incomplete' };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasHelpFlag(args)) {
    console.log(USAGE);
    return;
  }
  if (command === 'rate') {
    process.exitCode = (await rateCommand(args)).ok ? 0 : 1;
    return;
  }
  if (command === 'floors') {
    process.exitCode = floorsCommand(args).ok ? 0 : 1;
    return;
  }
  if (command === 'plan') return runCli((page) => planCommand(page, args), { pageCapture: 'h63-plan' });
  if (command === 'draft') return runCli((page) => draftCommand(page, args), { pageCapture: 'h63-draft' });
  if (command === 'ask') return runCli((page) => askCommand(page, args), { pageCapture: 'h63-ask' });
  throw new Error(`unknown command ${command}\n${USAGE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
