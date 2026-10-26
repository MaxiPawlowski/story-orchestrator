import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { argValue, laneHarness } from './lib/imageHarness.mts';
import { comfyCleared, requireIsolatedLane } from './lib/imageHarnessConfig.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { openGroup, openChat } from './st-navigation.mts';
import { executeSlashCommand, waitForIdle } from './st-actions.mts';
import { P41_MARKER } from './lib/pocDrivers.mts';
import {
  ARM_ROUTE, DEFAULT_SEEDS, PILOT_ARMS, buildBlindPack, imageFileName, lookFor, parsePilotCases, pilotJobs,
  type PilotArm, type PilotCase, type PilotCases, type PilotRow, type RefImage,
} from './lib/imagePilot.mts';

const USAGE = `Usage: node scripts/debug/so-image-pilot.mts <plan|run|pack> [options]

Plan 20 stage-2 route pilot: 12 frozen cases (test/fixtures/image-pilot/cases.json) x seeds x arms, rendered through the
real automatic-picture path (storyOrchestratorImage.direct with the arm forced), then a blind pack like review 18's.

  plan   print the schedule (no ST)
  run    render on a lane that holds the p41 cast with prepared looks (after so-p41-journey run <k> --keep):
           st-lanes.mts run <n> -- scripts/debug/so-image-pilot.mts run --group "<group>" --chat <chatId>
         [--marker ${P41_MARKER}] [--seeds ${DEFAULT_SEEDS.join(',')}] [--arms sdxl-directed,qwen-refs,composite] [--out <dir>] [--only c01,c09]
         Needs the lane cleared for ComfyUI (allowComfy or SO_ALLOW_COMFY=1). Appends each case's frozen lines to the chat (compact, no generation), sets its look, then draws every seed x arm on
         that case's last reply. Automatic cues are paused (image.automation.mode manual) for the run and restored after.
  pack   <runDir> [--seed <text>]: shuffle the rendered images under neutral labels into <runDir>/blind
         (img-NN.png, ref-X.png, items.txt, brief.md, about 10% hidden duplicates); the key goes to <runDir>/key.json.

The composite arm is skipped and recorded in the key: no compositing route exists yet.
Default out: <debug dir>/image-pilot/<stamp>.`;

const args = stripCommonArgs(process.argv.slice(2));
const command = args[0] ?? '';
const CASES = resolve(PROJECT_ROOT, 'test/fixtures/image-pilot/cases.json');
const list = (name: string, fallback: string) => (argValue(args, name, fallback) ?? fallback).split(',').map((item) => item.trim()).filter(Boolean);

async function loadCases(): Promise<PilotCases> {
  return parsePilotCases(JSON.parse(await readFile(CASES, 'utf8')));
}

function schedule(cases: PilotCases) {
  const seeds = list('--seeds', DEFAULT_SEEDS.join(',')).map(Number);
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0)) throw new Error('--seeds takes non-negative integers');
  const arms = list('--arms', PILOT_ARMS.join(',')) as PilotArm[];
  const unknown = arms.filter((arm) => !PILOT_ARMS.includes(arm));
  if (unknown.length) throw new Error(`unknown arm(s): ${unknown.join(', ')}`);
  const only = list('--only', '');
  const chosen = cases.cases.filter((row) => !only.length || only.some((prefix) => row.id.startsWith(prefix)));
  return { seeds, arms, chosen, ...pilotJobs(chosen, seeds, arms) };
}

const nameOf = (marker: string, member: string) => `${marker} ${member.charAt(0).toUpperCase()}${member.slice(1)}`;

async function downloadTo(page: Page, url: string, file: string) {
  const data = await page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let text = '';
    for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    return btoa(text);
  }, url);
  await writeFile(file, Buffer.from(data, 'base64'));
}

async function referenceImages(page: Page, cases: PilotCases, members: string[], marker: string, dir: string): Promise<RefImage[]> {
  const wanted = members.flatMap((member) => [['default', ''], ...Object.entries(cases.looks[member] ?? {}).filter(([look]) => look !== 'default')]
    .map(([look, value]) => ({ member, look, value, name: nameOf(marker, member) })));
  const found = await page.evaluate((rows) => {
    const sources = (globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites.visualSources as Record<string, any>;
    return rows.map((row) => {
      const source = Object.values(sources).find((entry) => decodeURIComponent(String(entry?.base?.path ?? '')).startsWith(`/characters/${row.name}/`));
      if (!source) return { ...row, path: null };
      if (row.look === 'default') return { ...row, path: source.base.path as string };
      const look = Object.values(source.looks ?? {}).find((entry: any) => String(entry?.signature ?? '').includes(JSON.stringify(row.value).slice(1, -1))) as any;
      return { ...row, path: look?.base?.path ?? null };
    });
  }, wanted);
  const missing = found.filter((row) => !row.path);
  if (missing.length) throw new Error(`No accepted visual source for: ${missing.map((row) => `${row.name} (${row.look})`).join(', ')}. Run so-p41-journey with --keep first.`);
  await mkdir(resolve(dir, 'refs'), { recursive: true });
  const refs: RefImage[] = [];
  for (const row of found) {
    const file = resolve(dir, 'refs', `${row.member}-${row.look}.png`);
    await downloadTo(page, row.path as string, file);
    refs.push({ member: row.member, look: row.look, file });
  }
  return refs;
}

async function appendCase(page: Page, row: PilotCase, marker: string, keys: string[]): Promise<number> {
  for (const key of keys) {
    const value = row.set?.[key];
    const ok = await page.evaluate(async ({ key, value }) => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      return value === undefined ? rt.resetQuality(key) : rt.setQuality(key, value);
    }, { key, value });
    if (ok === false) throw new Error(`${row.id}: could not ${value === undefined ? 'reset' : 'set'} ${key}`);
  }
  for (const [speaker, text] of row.lines) {
    await executeSlashCommand(page, speaker === 'player' ? `/send compact=true ${text}` : `/sendas name="${nameOf(marker, speaker)}" ${text}`);
    await waitForIdle(page, 60_000);
  }
  const last = row.lines[row.lines.length - 1][1];
  const target = await page.evaluate((text) => {
    const chat = (globalThis as any).SillyTavern.getContext().chat as Array<{ mes: string }>;
    return chat.length && chat[chat.length - 1].mes === text ? chat.length - 1 : -1;
  }, last);
  if (target < 0) throw new Error(`${row.id}: the frozen reply did not land as the last message`);
  return target;
}

async function draw(page: Page, target: number, route: 'sdxl' | 'qwen', seed: number) {
  return page.evaluate(async ({ target, route, seed }) => {
    const image = (globalThis as any).storyOrchestratorImage;
    const started = Date.now();
    try {
      const path = await image.direct({ purpose: 'scene', text: '', messageId: target, automatic: true }, { route, seed, placement: 'inline', candidates: 1 });
      const media = ((globalThis as any).SillyTavern.getContext().chat[target]?.extra?.media ?? []).filter((row: any) => row?.url === path).at(-1);
      return { path: path || null, record: media?.image_director ?? null, error: path ? null : 'discarded', ms: Date.now() - started };
    } catch (error) {
      return { path: null, record: null, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
    }
  }, { target, route, seed });
}

async function run(page: Page) {
  requireIsolatedLane(process.env, 'so-image-pilot run');
  if (!comfyCleared(process.env, laneHarness().config)) throw new Error('The pilot renders on ComfyUI and the GPU: clear the lane (allowComfy in its image-harness.json, or SO_ALLOW_COMFY=1) once the GPU window is agreed.');
  const group = argValue(args, '--group'), chat = argValue(args, '--chat');
  if (!group || !chat) throw new Error('Use --group <name|id> --chat <chatId> (the kept p41 journey chat, with its story running).');
  const marker = argValue(args, '--marker', P41_MARKER) ?? P41_MARKER;
  const cases = await loadCases();
  const plan = schedule(cases);
  const dir = resolve(argValue(args, '--out', resolve(DEBUG_DIR, 'image-pilot', new Date().toISOString().replace(/[:.]/g, '-'))) ?? '');
  await mkdir(resolve(dir, 'images'), { recursive: true });
  await openGroup(page, group);
  await openChat(page, chat);
  const opened = await page.evaluate(() => { const ctx = (globalThis as any).SillyTavern.getContext(); return { groupId: ctx.groupId, chatId: ctx.chatId }; });
  if (!opened.groupId || opened.chatId !== chat) throw new Error(`The pilot chat did not open: ${JSON.stringify(opened)}`);
  const members = [...new Set(plan.chosen.flatMap((row) => row.members))];
  const refs = await referenceImages(page, cases, members, marker, dir);
  await writeFile(resolve(dir, 'refs.json'), JSON.stringify({ refs, names: Object.fromEntries(members.map((member) => [member, nameOf(marker, member)])) }, null, 2));
  const automation = await page.evaluate(() => (globalThis as any).storyOrchestratorImage.settings().automation);
  await page.evaluate(() => { const image = (globalThis as any).storyOrchestratorImage; image.updateSettings({ automation: { ...image.settings().automation, mode: 'manual' } }); });
  await saveSettingsNow(page);
  const keys = [...new Set(cases.cases.flatMap((row) => Object.keys(row.set ?? {})))];
  const header = { at: new Date().toISOString(), lane: process.env.SO_LANE, group, chat, marker, seeds: plan.seeds, arms: plan.arms, skipped: plan.skipped, frozen: cases.frozen, jobs: plan.jobs.length };
  await writeFile(resolve(dir, 'run.json'), JSON.stringify(header, null, 2));
  await rm(resolve(dir, 'run.jsonl'), { force: true });
  try {
    for (const row of plan.chosen) {
      const target = await appendCase(page, row, marker, keys);
      for (const job of plan.jobs.filter((entry) => entry.case === row.id)) {
        const drawn = await draw(page, target, ARM_ROUTE[job.arm] as 'sdxl' | 'qwen', job.seed);
        const file = drawn.path ? resolve(dir, 'images', imageFileName(job)) : null;
        if (drawn.path && file) await downloadTo(page, drawn.path, file);
        const result: PilotRow = { ...job, file, error: drawn.error, ms: drawn.ms, members: row.members, moment: row.moment, record: drawn.record,
          looks: Object.fromEntries(row.members.map((member) => [member, lookFor(row, member, cases.looks)])) };
        await appendFile(resolve(dir, 'run.jsonl'), `${JSON.stringify(result)}\n`);
        console.log(`${job.case} s${job.seed} ${job.arm}: ${drawn.error ?? 'ok'} (${Math.round(drawn.ms / 1000)} s, route ${JSON.stringify(drawn.record?.route ?? null)})`);
      }
    }
  } finally {
    for (const key of keys) await page.evaluate((key) => (globalThis as any).storyOrchestratorRuntime.resetQuality(key), key).catch(() => null);
    await page.evaluate((automation) => (globalThis as any).storyOrchestratorImage.updateSettings({ automation }), automation);
    await saveSettingsNow(page);
  }
  console.log(JSON.stringify({ dir, next: `node scripts/debug/so-image-pilot.mts pack "${dir}"` }, null, 2));
}

async function pack(dir: string) {
  const header = JSON.parse(await readFile(resolve(dir, 'run.json'), 'utf8'));
  const rows = (await readFile(resolve(dir, 'run.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as PilotRow);
  const { refs, names } = JSON.parse(await readFile(resolve(dir, 'refs.json'), 'utf8')) as { refs: RefImage[]; names: Record<string, string> };
  const built = buildBlindPack({ rows, refs, seed: argValue(args, '--seed', header.at) ?? header.at, frozen: header.frozen, skipped: header.skipped, names });
  const blind = resolve(dir, 'blind');
  await rm(blind, { recursive: true, force: true });
  await mkdir(blind, { recursive: true });
  for (const item of built.items) await copyFile(item.file, resolve(blind, item.label));
  for (const ref of built.refs) await copyFile(ref.file, resolve(blind, ref.label));
  await writeFile(resolve(blind, 'items.txt'), built.itemsTxt);
  await writeFile(resolve(blind, 'brief.md'), built.brief);
  await writeFile(resolve(dir, 'key.json'), JSON.stringify(built.key, null, 1));
  console.log(JSON.stringify({ blind, images: built.items.length, duplicates: built.items.filter((item) => item.duplicateOf).length, missing: built.missing.length,
    skipped: header.skipped }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag() || !['plan', 'run', 'pack'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  if (command === 'plan') {
    const plan = schedule(await loadCases());
    console.log(JSON.stringify({ cases: plan.chosen.length, seeds: plan.seeds, arms: plan.arms, renders: plan.jobs.length, skipped: plan.skipped }, null, 2));
  } else if (command === 'pack') {
    const dir = args[1];
    if (!dir || !existsSync(resolve(dir, 'run.jsonl'))) throw new Error('pack <runDir>: the folder needs run.json, run.jsonl and refs.json from a run');
    await pack(resolve(dir));
  } else runCli(run);
}
