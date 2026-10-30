import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { hasHelpFlag, runCli, stripCommonArgs } from './lib/cli.mts';
import { askSolAgent, withRetry, parseJsonObject } from './lib/solCall.mts';
import { SOL_MODEL } from './lib/e0LabelRun.mts';
import { CONTROL_LINE, SKIP_RATE_FORMAT, packLeaks, parseVerdict, ratePrompt, summarize, unseal, type ArmReply, type CapturedState, type RatedRow } from './lib/skipRate.mts';

const USAGE = `Usage: node scripts/debug/so-skip-rate.mts <command> [...]

v3.0 plan 32 RP rating arm: Skip ahead vs a typed "${CONTROL_LINE}" from the same states, blind Sol pairs.

  capture --out <dir> --lines <file.json> [--n 25]
      on the open story chat of a MODEL lane (talk.skipAhead on, a narrator in the cast): for each state, run Skip ahead,
      record the reply, delete it, send "${CONTROL_LINE}", record the reply, delete both, then advance the chat with the
      next player line of <file.json> (a JSON array of strings) and its reply. Writes <dir>/states.jsonl.
  rate --out <dir> [--salt <s>] [--model ${SOL_MODEL}]
      one Sol call per state, pair order by sha256(salt:id); resumes; writes <dir>/rated.jsonl and <dir>/summary.json
  summary --out <dir>          recompute summary.json from rated.jsonl

Floors (declared before any candidate output, docs/plans/v3.0/32-player-skip-ahead.md): >= 25 rated, no category below
-0.2, flags <= control + 2, thinking closure no worse than control, landsAtThreshold >= 20, decidesForPlayer <= 1,
undisclosedReveal 0.`;

const arg = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };
const readJsonl = async <T,>(file: string): Promise<T[]> => (existsSync(file) ? (await readFile(file, 'utf-8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T) : []);
const append = (file: string, row: unknown) => writeFile(file, `${JSON.stringify(row)}\n`, { flag: 'a' });

const SYSTEM = 'You rate roleplay replies for a blind comparison. Answer only the JSON the prompt asks for.';

const lastReply = (page: Page): Promise<ArmReply & { speaker: string; rows: number }> => page.evaluate(() => {
  const ctx = (globalThis as unknown as { SillyTavern: { getContext(): { chat: Array<Record<string, unknown>> } } }).SillyTavern.getContext();
  const last = ctx.chat.at(-1) ?? {};
  const extra = (last.extra ?? {}) as Record<string, unknown>;
  const reasoning = typeof extra.reasoning === 'string' ? extra.reasoning : '';
  return { text: String(last.mes ?? ''), reasoning, closed: !reasoning || String(last.mes ?? '').trim().length > 0, speaker: String(last.name ?? ''), rows: ctx.chat.length };
});

const settle = (page: Page, rows: number, timeoutMs = 300000) => page.evaluate(async ({ rows, timeoutMs }) => {
  const ctx = (globalThis as unknown as { SillyTavern: { getContext(): { chat: unknown[] } } }).SillyTavern.getContext();
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && (document.body.dataset.generating || ctx.chat.length < rows)) await sleep(250);
  await sleep(2000);
  return ctx.chat.length;
}, { rows, timeoutMs });

const slash = (page: Page, command: string) => page.evaluate(async (command) => {
  const ctx = (globalThis as unknown as { SillyTavern: { getContext(): { executeSlashCommandsWithOptions(text: string): Promise<unknown> } } }).SillyTavern.getContext();
  await ctx.executeSlashCommandsWithOptions(command);
}, command);

const visibleOf = (page: Page) => page.evaluate(() => {
  const rt = (globalThis as unknown as { storyOrchestratorRuntime: { getNarrativeStatus(): { title: string; text: string } } }).storyOrchestratorRuntime;
  const status = rt.getNarrativeStatus();
  return `${status.title}\n${status.text}`;
});

const chatTail = (page: Page, count = 8) => page.evaluate((count) => {
  const ctx = (globalThis as unknown as { SillyTavern: { getContext(): { chat: Array<Record<string, unknown>> } } }).SillyTavern.getContext();
  return ctx.chat.slice(-count).map((row) => `${String(row.name ?? '')}: ${String(row.mes ?? '')}`);
}, count);

async function capture(page: Page, out: string, lines: string[], n: number) {
  await mkdir(out, { recursive: true });
  const file = join(out, 'states.jsonl');
  const done = (await readJsonl<CapturedState>(file)).length;
  for (let index = done; index < n; index += 1) {
    const chat = await chatTail(page);
    const visible = await visibleOf(page);
    const start = await page.evaluate(() => (globalThis as unknown as { SillyTavern: { getContext(): { chat: unknown[] } } }).SillyTavern.getContext().chat.length);
    const outcome = await page.evaluate(() => (globalThis as unknown as { storyOrchestratorRuntime: { skipAhead(): Promise<{ ok: boolean; reason?: string }> } }).storyOrchestratorRuntime.skipAhead());
    if (!outcome.ok) throw new Error(`state ${index}: Skip ahead refused: ${outcome.reason}`);
    await settle(page, start + 1);
    const skip = await lastReply(page);
    await slash(page, '/del 1');
    await settle(page, start);
    await slash(page, `/send ${CONTROL_LINE} | /trigger`);
    await settle(page, start + 2);
    const control = await lastReply(page);
    await slash(page, '/del 2');
    await settle(page, start);
    const id = `s${String(index).padStart(2, '0')}`;
    await append(file, { id, speaker: skip.speaker, chat, visible, skip, control } satisfies CapturedState);
    console.log(`${id} captured (skip ${skip.text.length} chars, control ${control.text.length} chars)`);
    const line = lines[index % lines.length];
    await slash(page, `/send ${line} | /trigger`);
    await settle(page, start + 2);
  }
  return { ok: true, states: n };
}

async function rate(out: string, salt: string, model: string) {
  const states = await readJsonl<CapturedState>(join(out, 'states.jsonl'));
  const ratedFile = join(out, 'rated.jsonl');
  const rated = new Set((await readJsonl<RatedRow>(ratedFile)).map((row) => row.id));
  const leaks = packLeaks(states.map((state) => ratePrompt(state, salt)));
  if (leaks.length) throw new Error(`the pack names an arm: ${leaks.join('; ')}`);
  const work = join(out, 'rater');
  for (const state of states.filter((entry) => !rated.has(entry.id))) {
    const reply = await withRetry(() => askSolAgent({ id: 'skip-rater', system: SYSTEM }, ratePrompt(state, salt), work, undefined, model));
    const verdict = parseVerdict(parseJsonObject(reply.text));
    if (!verdict) { console.error(`${state.id}: no verdict`); continue; }
    await append(ratedFile, unseal(state, verdict, salt));
    console.log(`${state.id} rated`);
  }
  return summaryOf(out);
}

async function summaryOf(out: string) {
  const summary = summarize(await readJsonl<RatedRow>(join(out, 'rated.jsonl')));
  await writeFile(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  return { ok: summary.pass, format: SKIP_RATE_FORMAT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs();
  const [command] = args;
  const out = arg(args, '--out');
  if (hasHelpFlag() || !command || !out) {
    console.log(USAGE);
    process.exitCode = hasHelpFlag() ? 0 : 1;
  } else if (command === 'capture') {
    const linesFile = arg(args, '--lines');
    if (!linesFile) { console.log(USAGE); process.exitCode = 1; } else {
      const lines = JSON.parse(await readFile(linesFile, 'utf-8')) as string[];
      await runCli((page) => capture(page, out, lines, Number(arg(args, '--n') ?? 25)));
    }
  } else if (command === 'rate') {
    process.exitCode = (await rate(out, arg(args, '--salt') ?? 'v30-32', arg(args, '--model') ?? SOL_MODEL)).ok ? 0 : 1;
  } else if (command === 'summary') {
    process.exitCode = (await summaryOf(out)).ok ? 0 : 1;
  } else {
    console.log(USAGE);
    process.exitCode = 1;
  }
}
