import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { PROJECT_ROOT } from './lib/connection.mts';
import { lanesRootFor } from '../lib/stRoot.mjs';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { waitForIdle } from './st-actions.mts';
import { connectThroughRelay, installReplyRelay, RELAY_MODEL_ID, type Relay } from './lib/replyRelay.mts';
import { installTrimRecorder, scoreTrim, speakerFor, TRIM_ARMS, type TrimArm, type TrimPattern, type TrimRequest, type TrimTurn } from './lib/trimArms.mts';

const USAGE = `Usage: node scripts/debug/so-trim-arms.mts <command> [options]

v2.8 63 H1: front-trim latency arms (queue R2). Runs on a lane whose reply model is the local llama-server (3090 via
the controller, st-lanes start <n> --allow-local) or a pod tunnel; every number comes from llama-server's own timings.

  seed-saga --lane <n> --chat <file.jsonl> --group <name> --story <id> [--profile <name>] [--amount-gen 300]
        stopped, seeded lane: copy a saved group chat (private) into the lane's group, apply its cast ledger to the
        group's disabled members, bind the story, pick the connection profile by name, set the response length, and
        switch off everything that would add model calls beside the loud reply (extraction, curator, meanwhile, reply
        effort, living director and prefetch, inner beat, briefing drafting) and images and sprites
  prep --arm front-trim|fits [--keep <rows>] [--max-context <n>]
        set ST max_context for the arm (front-trim ${TRIM_ARMS['front-trim'].maxContext}, fits ${TRIM_ARMS.fits.maxContext}); fits also cuts the open chat
        to its first --keep rows (default ${TRIM_ARMS.fits.keep}) with /del, an ordinary rollback on the lane copy
  drive --arm front-trim|fits --pattern same|alternating --turns <n> --out <dir> [--run <label>] [--members a,b]
        [--cold-cmd "<shell>"] [--keep-turns] [--plumbing]
        one arm-run: --cold-cmd runs before turn 0 (a server restart, e.g. "node scripts/local/cli.mjs unload &&
        node scripts/local/cli.mjs load"), so turn 0 is the cold turn; every turn posts one player line and drafts one
        member (same: the first member every turn; alternating: members in turn), records sent tokens, reuse, prefill ms,
        first-token ms and the chat's history tokens, then deletes the run's turns (--keep-turns keeps them).
        --plumbing serves scripted replies with made-up timings (no model, no GPU): a harness check, never a measurement
  score <dir...> [--overhead <tokens>] [--out <file>]
        H1: medians per arm x pattern, warm and cold, the would-be step turns of the stepped window (high 0.90, low 0.65
        of the prompt budget) and their cost

Arms: front-trim = ${TRIM_ARMS['front-trim'].note}; fits = ${TRIM_ARMS.fits.note}.`;

export const TRIM_LINES = [
  'I listen for a moment, then ask what we should do next.',
  'I look around carefully before I say anything.',
  'I nod and wait to hear the rest of it.',
  'I ask a quiet question about what just happened.',
  'I keep walking and watch the people around us.',
  'I stop and think it over out loud.',
  'I check my gear and ask if anyone needs anything.',
  'I say that we should be careful from here on.',
  'I ask for a little more detail about that.',
  'I share what I noticed and ask what the others think.',
  'I take a breath and decide to press on.',
  'I ask who we can trust here.',
];

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
const armOf = (value: string | null): TrimArm => {
  if (value !== 'front-trim' && value !== 'fits') throw new Error('--arm is front-trim or fits');
  return value;
};
const patternOf = (value: string | null): TrimPattern => {
  if (value !== 'same' && value !== 'alternating') throw new Error('--pattern is same or alternating');
  return value;
};

async function setMaxContext(page: Page, value: number) {
  return page.evaluate(async (target) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const el = document.querySelector('#max_context') as HTMLInputElement | null;
    if (!el) throw new Error('#max_context missing');
    el.max = String(Math.max(Number(el.max), target));
    el.value = String(target);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((done) => setTimeout(done, 1500));
    return { maxContext: ctx.maxContext, amountGen: Number((document.querySelector('#amount_gen') as HTMLInputElement | null)?.value ?? 0), chat: ctx.chatId, length: ctx.chat.length };
  }, value);
}

export function seedSaga({ userDir, chatFile, group, story, profile = null, amountGen = 300 }: { userDir: string; chatFile: string; group: string; story: string; profile?: string | null; amountGen?: number }) {
  const lines = readFileSync(chatFile, 'utf-8').split(/\r?\n/).filter(Boolean);
  const head = JSON.parse(lines[0]);
  const record = head?.chat_metadata?.story_orchestrator?.stories?.[story];
  if (!record) throw new Error(`${chatFile} carries no story ${story} in its metadata`);
  const chatId = chatFile.replace(/\\/g, '/').split('/').pop()!.replace(/\.jsonl$/, '');
  const groupsDir = join(userDir, 'groups');
  const groupFile = readdirSync(groupsDir).map((name) => join(groupsDir, name)).find((path) => JSON.parse(readFileSync(path, 'utf-8')).name === group);
  if (!groupFile) throw new Error(`no group named ${group} in ${groupsDir}`);
  const entry = JSON.parse(readFileSync(groupFile, 'utf-8'));
  const disabled = new Set<string>(entry.disabled_members ?? []);
  for (const row of record.extras?.effects?.ledger ?? []) {
    if (row.effect !== 'cast' || row.status !== 'applied' || !entry.members.includes(row.target?.member)) continue;
    if (row.after?.disabled) disabled.add(row.target.member);
    else disabled.delete(row.target.member);
  }
  mkdirSync(join(userDir, 'group chats'), { recursive: true });
  writeFileSync(join(userDir, 'group chats', `${chatId}.jsonl`), readFileSync(chatFile));
  if (!entry.chats.includes(chatId)) entry.chats.push(chatId);
  entry.chat_id = chatId;
  entry.disabled_members = [...disabled];
  writeFileSync(groupFile, JSON.stringify(entry, null, 4));
  const settingsPath = join(userDir, 'settings.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  const root = settings.extension_settings['story-orchestrator'] ??= {};
  root.groupStories = { ...(root.groupStories ?? {}), [entry.id]: story };
  const so = root.settings ??= {};
  so.extraction = { ...(so.extraction ?? {}), enabled: false, replyEffort: 'off' };
  so.stagecraft = { ...(so.stagecraft ?? {}), curatorEnabled: false, meanwhileAcceptMode: 'off', livingEnabled: false, prefetchEnabled: false };
  so.memory = { ...(so.memory ?? {}), innerBeat: false };
  so.display = { ...(so.display ?? {}), briefingDraft: false };
  so.image = { ...(so.image ?? {}), enabled: false };
  so.sprites = { ...(so.sprites ?? {}), enabled: false };
  let profileId: string | null = null;
  if (profile) {
    const found = (settings.extension_settings.connectionManager?.profiles ?? []).find((row: { name?: string }) => row.name === profile);
    if (!found) throw new Error(`no connection profile named ${profile}`);
    settings.extension_settings.connectionManager.selectedProfile = found.id;
    profileId = found.id;
  }
  settings.amount_gen = amountGen;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
  return { chatId, rows: lines.length - 1, group: entry.id, members: entry.members.length, enabled: entry.members.length - disabled.size, profileId, amountGen };
}

export async function prepCommand(page: Page, args: string[]) {
  const arm = armOf(option(args, '--arm'));
  const maxContext = Number(option(args, '--max-context') ?? TRIM_ARMS[arm].maxContext);
  const set = await setMaxContext(page, maxContext);
  let cut = null;
  if (arm === 'fits') {
    const keep = Number(option(args, '--keep') ?? TRIM_ARMS.fits.keep);
    cut = await page.evaluate(async (rows) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const extra = ctx.chat.length - rows;
      if (extra > 0) await ctx.executeSlashCommandsWithOptions(`/del ${extra}`);
      await new Promise((done) => setTimeout(done, 3000));
      return { deleted: Math.max(0, extra), length: ctx.chat.length };
    }, keep);
  }
  const result = { arm, ...set, cut };
  console.log(JSON.stringify(result));
  return { ok: set.maxContext === maxContext, result };
}

async function membersOf(page: Page, wanted: string[] | null): Promise<string[]> {
  if (wanted?.length) return wanted;
  return page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const group = ctx.groups.find((entry: any) => entry.id === ctx.groupId);
    if (!group) throw new Error('needs an open group chat');
    const off = new Set(group.disabled_members ?? []);
    return group.members.filter((avatar: string) => !off.has(avatar)).map((avatar: string) => ctx.characters.find((character: any) => character.avatar === avatar)?.name).filter(Boolean);
  });
}

async function historyTokens(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const root = globalThis as any;
    const ctx = root.SillyTavern.getContext();
    root.__trimTokenCache ??= new Map();
    let total = 0;
    for (const [index, message] of ctx.chat.entries()) {
      if (message.is_system) continue;
      const key = `${index}|${message.swipe_id ?? 0}|${String(message.mes ?? '').length}`;
      if (!root.__trimTokenCache.has(key)) root.__trimTokenCache.set(key, await ctx.getTokenCountAsync(String(message.mes ?? '')));
      total += root.__trimTokenCache.get(key);
    }
    return total;
  });
}

export async function driveCommand(page: Page, args: string[]) {
  const arm = armOf(option(args, '--arm'));
  const pattern = patternOf(option(args, '--pattern'));
  const turns = Number(need(args, '--turns'));
  const out = abs(need(args, '--out'));
  const run = option(args, '--run') ?? `${arm}-${pattern}`;
  const coldCmd = option(args, '--cold-cmd');
  mkdirSync(out, { recursive: true });
  const file = join(out, `${run}.jsonl`);
  if (existsSync(file)) throw new Error(`${file} exists: pick another --run label`);
  const members = (await membersOf(page, option(args, '--members')?.split(',').map((name) => name.trim()).filter(Boolean) ?? null));
  const state = await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return { maxContext: ctx.maxContext, amountGen: Number((document.querySelector('#amount_gen') as HTMLInputElement | null)?.value ?? 0), length: ctx.chat.length, chat: ctx.chatId, group: ctx.groupId };
  });
  if (state.maxContext !== TRIM_ARMS[arm].maxContext && !args.includes('--any-context')) throw new Error(`ST max_context is ${state.maxContext}, the ${arm} arm runs at ${TRIM_ARMS[arm].maxContext}: run prep --arm ${arm} first`);
  if (arm === 'fits' && TRIM_ARMS.fits.keep !== null && state.length > TRIM_ARMS.fits.keep && !option(args, '--keep')) throw new Error(`fits arm: the chat has ${state.length} rows, more than ${TRIM_ARMS.fits.keep}: run prep --arm fits first`);
  await page.evaluate(installTrimRecorder);
  let relay: Relay | null = null;
  if (args.includes('--plumbing')) {
    relay = await installReplyRelay(page, { mode: 'scripted', workDir: out, script: ({ index, speaker }) => `${speaker ?? 'Someone'} answers plainly (plumbing ${index}).`, timings: ({ prompt }) => ({ prompt_n: Math.max(1, Math.round(prompt.length / 4)), cache_n: 0, prompt_ms: Math.round(prompt.length / 8), predicted_n: 12, predicted_per_second: 30 }) });
    const connected = await connectThroughRelay(page);
    if (connected.online !== RELAY_MODEL_ID) throw new Error(`the page did not connect through the relay: ${JSON.stringify(connected)}`);
  }
  const startLength = state.length;
  writeFileSync(join(out, `${run}.header.json`), `${JSON.stringify({ at: new Date().toISOString(), arm, pattern, run, turns, members, coldCmd, plumbing: Boolean(relay), ...state, lane: process.env.SO_LANE ?? null }, null, 2)}\n`);
  if (coldCmd) execSync(coldCmd, { stdio: 'inherit', cwd: PROJECT_ROOT });
  try {
    for (let turn = 0; turn < turns; turn += 1) {
      const speaker = speakerFor(pattern, members, turn);
      const line = TRIM_LINES[turn % TRIM_LINES.length];
      const started = Date.now();
      const before = await page.evaluate((tag) => { (globalThis as any).__trimTag = tag; return (globalThis as any).__trimRec.length; }, `turn-${turn}`);
      await page.evaluate(async ({ line, speaker }) => {
        const ctx = (globalThis as any).SillyTavern.getContext();
        await ctx.executeSlashCommandsWithOptions(`/send ${line}`);
        await ctx.executeSlashCommandsWithOptions(`/trigger await=true ${JSON.stringify(speaker)}`);
      }, { line, speaker });
      await waitForIdle(page, 900000);
      await page.evaluate(() => new Promise((done) => setTimeout(done, 1500)));
      const after = await page.evaluate((from) => {
        const root = globalThis as any;
        root.__trimTag = null;
        const ctx = root.SillyTavern.getContext();
        const last = ctx.chat[ctx.chat.length - 1];
        return { requests: root.__trimRec.slice(from), chatLength: ctx.chat.length, replyChars: last && !last.is_user ? String(last.mes ?? '').length : 0, maxContext: ctx.maxContext, amountGen: Number((document.querySelector('#amount_gen') as HTMLInputElement | null)?.value ?? 0) };
      }, before);
      const record: TrimTurn = { arm, pattern, run, turn, speaker, cold: Boolean(coldCmd) && turn === 0, ms: Date.now() - started, chatLength: after.chatLength, historyTokens: await historyTokens(page), maxContext: after.maxContext, amountGen: after.amountGen, requests: after.requests as TrimRequest[], replyChars: after.replyChars };
      appendFileSync(file, `${JSON.stringify(record)}\n`);
      const loud = record.requests.filter((request) => request.stream).at(-1);
      console.log(`${run} turn ${turn} ${speaker}: ${record.ms} ms, sent ${(loud?.timings?.prompt_n ?? 0) + (loud?.timings?.cache_n ?? 0)}, cache ${loud?.timings?.cache_n ?? '-'}, history ${record.historyTokens}`);
    }
  } finally {
    await relay?.stop();
    if (!args.includes('--keep-turns')) {
      const removed = await page.evaluate(async (base) => {
        const ctx = (globalThis as any).SillyTavern.getContext();
        const extra = ctx.chat.length - base;
        if (extra > 0) await ctx.executeSlashCommandsWithOptions(`/del ${extra}`);
        await new Promise((done) => setTimeout(done, 3000));
        return { deleted: Math.max(0, extra), length: ctx.chat.length };
      }, startLength);
      console.log(`cleanup: ${JSON.stringify(removed)}`);
    }
  }
  return { ok: true };
}

export function readTurns(paths: string[]): TrimTurn[] {
  return paths.flatMap((path) => readFileSync(path, 'utf-8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as TrimTurn));
}

export function positionals(args: string[], valued: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    if (valued.includes(args[index])) { index += 1; continue; }
    if (!args[index].startsWith('--')) out.push(args[index]);
  }
  return out;
}

export function scoreCommand(args: string[]) {
  const inputs = positionals(args, ['--out', '--overhead']);
  const files = inputs.flatMap((input) => {
    const full = abs(input);
    if (full.endsWith('.jsonl')) return [full];
    return existsSync(full) ? readdirJsonl(full) : [];
  });
  if (!files.length) throw new Error(`no arm-run .jsonl files in ${inputs.join(', ')}`);
  const overhead = option(args, '--overhead');
  const result = { files: files.map((file) => file.replace(/\\/g, '/')), ...scoreTrim(readTurns(files), { overhead: overhead === null ? null : Number(overhead) }) };
  const out = option(args, '--out');
  if (out) {
    mkdirSync(dirname(abs(out)), { recursive: true });
    writeFileSync(abs(out), `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
  return { ok: true, result };
}

function readdirJsonl(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith('.jsonl')).map((name) => join(dir, name));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasHelpFlag(args)) {
    console.log(USAGE);
    return;
  }
  if (command === 'score') {
    scoreCommand(args);
    return;
  }
  if (command === 'seed-saga') {
    const lane = need(args, '--lane');
    const userDir = join(lanesRootFor(process.env, PROJECT_ROOT), lane, 'data', 'default-user');
    console.log(JSON.stringify(seedSaga({ userDir, chatFile: abs(need(args, '--chat')), group: need(args, '--group'), story: need(args, '--story'), profile: option(args, '--profile'), amountGen: Number(option(args, '--amount-gen') ?? 300) })));
    return;
  }
  if (command === 'prep') return runCli((page) => prepCommand(page, args), { pageCapture: 'trim-prep' });
  if (command === 'drive') return runCli((page) => driveCommand(page, args), { pageCapture: 'trim-drive' });
  throw new Error(`unknown command ${command}\n${USAGE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
