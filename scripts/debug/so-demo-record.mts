import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import type { CDPSession, Page } from 'playwright';
import { harnessFs } from '../lib/laneSafety.mjs';
import { runCli } from './lib/cli.mts';
import { PROJECT_ROOT, DEBUG_DIR, laneOf } from './lib/connection.mts';
import { openGroup, startNewChat, closeUnpinnedDrawers } from './st-navigation.mts';
import { executeSlashCommand, sendUserMessage, swipeMessage, waitForIdle } from './st-actions.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { ensureSTReady } from './lib/st-ready.mts';

const { mkdir, writeFile, rm } = harnessFs;

export const MARKER = 'SO-Demo';
export const GROUP = 'SO-Demo Beacon';
export const DEMO_DIR = resolve(PROJECT_ROOT, 'test/showcase/demo');
export const STORY = resolve(DEMO_DIR, 'beacon.story.json');
export const ART = resolve(PROJECT_ROOT, 'docs/guide/assets/showcase');
export const CLIP_DIR = resolve(ART, 'clips');
export const CARDS = ['tobin', 'june', 'wren'];
export const BACKDROPS = ['harbor-town-afternoon', 'library-fireplace-night', 'forest-path-mist', 'mountain-lake-dawn'];
export const CLIPS = ['talk-pacing', 'stuck-lead', 'swipe-rollback', 'scene-change', 'story-sheet'] as const;
export type Clip = typeof CLIPS[number];

export const USAGE = `Usage (lanes only, never the owner's ST):
  node scripts/debug/st-lanes.mts run <lane> -- scripts/debug/so-demo-record.mts <command> [options]

Plays the synthetic demo story (test/showcase/demo/beacon.story.json) on a lane with REAL generation and records short
WebM clips for the guide site into docs/guide/assets/showcase/clips/ (each with a .json sidecar).

Commands:
  prepare               create the SO-Demo cards, upload the four scene backgrounds, create the group, import the story, open a new chat
  record [clip...]      record clips in order (default: all): ${CLIPS.join(', ')}
  status                group, chat, checkpoint and model route of the open demo chat
  cleanup               remove the SO-Demo cards, group, chats and backgrounds

Options:
  --stage               keep the sprite stage on (live heads from the published rigs). Off by default: lanes must not reach ComfyUI.
  --width <px>          clip width (default 960). Clips are VP9 WebM at 12 fps.

Needs: a lane with a model profile that answers (the 3090 controller or a rented GPU), ffmpeg on PATH,
the extension staged (npm run build && npm run stage). The script refuses to run without SO_LANE.`;

const argument = (key: string, fallback = '') => {
  const at = process.argv.indexOf(key);
  return at < 0 ? fallback : process.argv[at + 1] || fallback;
};

export function laneGuard(env: NodeJS.ProcessEnv = process.env): number {
  const lane = laneOf(env);
  if (lane === null || lane === 0) throw new Error('so-demo-record runs only on a lane (st-lanes.mts run <n> with n >= 1): it creates cards and plays with a real model.');
  return lane;
}

export const backgroundFile = (id: string) => `so-demo-${id}.jpg`;

export function clipSidecar(clip: Clip, build: string, extra: Record<string, unknown>) {
  return {
    build,
    licence: 'Screen recording of this repository\'s extension (AGPL-3.0 code) playing a synthetic demo story; character art and backgrounds as listed in LICENSES.md.',
    source: `scripts/debug/so-demo-record.mts record ${clip} on a lane with real generation`,
    clip,
    story: 'test/showcase/demo/beacon.story.json',
    ...extra,
  };
}

class Recorder {
  private frames: { at: number; file: string }[] = [];
  private session: CDPSession | null = null;
  private dir = '';
  private readonly page: Page;
  private readonly width: number;

  constructor(page: Page, width: number) {
    this.page = page;
    this.width = width;
  }

  async start(name: string) {
    this.dir = resolve(DEBUG_DIR, 'demo-record', name);
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    this.frames = [];
    this.session = await this.page.context().newCDPSession(this.page);
    this.session.on('Page.screencastFrame', (event: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      const file = join(this.dir, `f${String(this.frames.length).padStart(5, '0')}.jpg`);
      this.frames.push({ at: event.metadata.timestamp ?? Date.now() / 1000, file });
      void writeFile(file, Buffer.from(event.data, 'base64'));
      void this.session?.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
    });
    await this.session.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: this.width, maxHeight: Math.round(this.width * 0.75), everyNthFrame: 1 });
  }

  async stop(out: string): Promise<{ frames: number; seconds: number }> {
    assert.ok(this.session, 'recorder not started');
    await this.session.send('Page.stopScreencast');
    await this.session.detach();
    this.session = null;
    await new Promise((done) => setTimeout(done, 500));
    assert.ok(this.frames.length > 1, 'the screencast produced no frames');
    const lines: string[] = [];
    for (let i = 0; i < this.frames.length; i++) {
      const next = this.frames[i + 1]?.at ?? this.frames[i].at + 0.5;
      lines.push(`file '${this.frames[i].file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.04, Math.min(3, next - this.frames[i].at)).toFixed(3)}`);
    }
    lines.push(`file '${this.frames[this.frames.length - 1].file.replace(/\\/g, '/')}'`);
    const list = join(this.dir, 'frames.txt');
    await writeFile(list, lines.join('\n'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=12,scale=${this.width}:-2`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-an', out]);
    return { frames: this.frames.length, seconds: Math.round((this.frames[this.frames.length - 1].at - this.frames[0].at) * 10) / 10 };
  }
}

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const ctx = (globalThis as any).SillyTavern?.getContext();
    return ctx?.extensionSettings?.['story-orchestrator'] && (globalThis as any).storyOrchestratorRuntime;
  });
}

async function openDemo(page: Page) {
  await ready(page);
  const open = await page.evaluate((group) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return ctx.groups?.find((entry: any) => String(entry.id) === String(ctx.groupId))?.name === group;
  }, GROUP);
  if (!open) {
    await openGroup(page, GROUP);
    await closeUnpinnedDrawers(page);
  }
  const state = await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return { groupId: ctx.groupId, chatId: ctx.chatId };
  });
  assert.ok(state.groupId && state.chatId, `the ${GROUP} chat is not open`);
}

async function prepare(page: Page) {
  await ensureSTReady(page);
  await ready(page);
  const baseline = await snapshotAssets(page);
  assert.equal(baseline.trusted, true, baseline.untrusted.join('; '));
  assert.equal(leakCount(await listMarkedAssets(page, MARKER, { baseline })), 0, `${MARKER} assets already exist; run cleanup first`);
  const story = JSON.parse(await readFile(STORY, 'utf8'));
  const cards = await Promise.all(CARDS.map(async (key) => ({
    key, card: JSON.parse(await readFile(resolve(DEMO_DIR, `${key}.card.json`), 'utf8')),
    avatar: (await readFile(resolve(ART, 'characters', `${key}.png`))).toString('base64'),
  })));
  const backgrounds = await Promise.all(BACKDROPS.map(async (id) => ({ name: backgroundFile(id), data: (await readFile(resolve(ART, 'backdrops', `${id}.jpg`))).toString('base64') })));
  const created = await page.evaluate(async ({ cards, backgrounds, group }) => {
    const ctx = (globalThis as any).SillyTavern.getContext(), headers = { ...ctx.getRequestHeaders() };
    delete headers['Content-Type'];
    const bytes = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    for (const background of backgrounds) {
      const form = new FormData();
      form.append('avatar', new File([bytes(background.data)], background.name, { type: 'image/jpeg' }));
      const response = await fetch('/api/backgrounds/upload', { method: 'POST', headers, body: form });
      if (!response.ok) throw new Error(`Background ${background.name} upload failed: ${response.status}`);
    }
    const members: string[] = [];
    for (const { card, avatar } of cards) {
      const data = card.data, form = new FormData();
      const body: Record<string, string> = { ch_name: data.name, description: data.description, personality: data.personality, scenario: data.scenario, first_mes: data.first_mes,
        mes_example: data.mes_example, creator_notes: data.creator_notes, tags: 'so-demo', talkativeness: '0.5', fav: 'false', extensions: JSON.stringify({}) };
      for (const [key, value] of Object.entries(body)) form.append(key, value);
      form.append('avatar', new File([bytes(avatar)], 'avatar.png', { type: 'image/png' }));
      const response = await fetch('/api/characters/create', { method: 'POST', headers, body: form });
      if (!response.ok) throw new Error(`Create ${data.name} failed: ${response.status}`);
      members.push((await response.text()).trim());
    }
    await ctx.getCharacters();
    const response = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: group, members,
      activation_strategy: 2, generation_mode: 0, disabled_members: [], allow_self_responses: false, fav: false }) });
    const made = await response.json();
    if (!response.ok || !made.id) throw new Error('Demo group creation failed');
    await ctx.getCharacters();
    return { group: String(made.id), members };
  }, { cards: cards.map(({ card, avatar }) => ({ card, avatar })), backgrounds, group: GROUP });
  await openGroup(page, created.group);
  await startNewChat(page);
  await closeUnpinnedDrawers(page);
  const stage = process.argv.includes('--stage');
  await page.evaluate(async ({ story, stage }) => {
    const root = globalThis as any, rt = root.storyOrchestratorRuntime, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
    home.settings ??= {};
    home.settings.image = { ...home.settings.image, enabled: false };
    home.settings.sprites = { ...home.settings.sprites, enabled: stage, onDemand: false };
    home.settings.display = { ...home.settings.display, briefing: false, briefingDraft: false, playerSetup: false };
    await rt.importStory(JSON.stringify(story)); rt.notify();
    rt.setUiSettings({ briefingSeen: true });
  }, { story, stage });
  await saveSettingsNow(page);
  await page.waitForFunction(() => (globalThis as any).SillyTavern.getContext().chat.length > 0, undefined, { timeout: 60000 });
  await page.waitForFunction(() => (globalThis as any).storyOrchestratorRuntime.getSnapshot()?.schedulerIdle !== false, undefined, { timeout: 60000 });
  console.log(JSON.stringify({ group: created.group, members: CARDS, story: story.id, backgrounds: backgrounds.map((b) => b.name), stage }));
}

const checkpoint = (page: Page) => page.evaluate(() => (globalThis as any).storyOrchestratorRuntime.getSnapshot()?.activeCheckpointId ?? null);

async function settle(page: Page) {
  await waitForIdle(page, 300000, { settleMs: 2500 });
  await page.waitForFunction(() => (globalThis as any).storyOrchestratorRuntime.getSnapshot()?.schedulerIdle !== false, undefined, { timeout: 120000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
}

async function author(page: Page, on: boolean, level = 3) {
  await page.evaluate(({ on, level }) => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    rt.setUiSettings({ authorView: on, inline: { level: on ? level : 1 } });
    rt.notify();
  }, { on, level });
}

async function jump(page: Page, id: string) {
  if (await checkpoint(page) === id) return;
  await executeSlashCommand(page, `/cp activate ${id}`);
  await settle(page);
}

const PLAYS: Record<Clip, (page: Page) => Promise<Record<string, unknown>>> = {
  'talk-pacing': async (page) => {
    await jump(page, 'harbour');
    const before = await page.evaluate(() => (globalThis as any).SillyTavern.getContext().chat.length);
    await sendUserMessage(page, 'I step off the ferry and ask June what has gone wrong.', { expectReply: true });
    await settle(page);
    const voices = await page.evaluate((from) => (globalThis as any).SillyTavern.getContext().chat.slice(from + 1).filter((m: any) => !m.is_user && !m.is_system).map((m: any) => m.name), before);
    return { voices, policy: await page.evaluate(() => (globalThis as any).storyOrchestratorRuntime.talkPolicy?.() ?? null) };
  },
  'stuck-lead': async (page) => {
    await jump(page, 'study');
    await author(page, true, 3);
    for (const line of ['I look around the room.', 'I wait and listen to the fire.', 'I look around again.']) {
      await sendUserMessage(page, line, { expectReply: true });
      await settle(page);
    }
    await page.waitForTimeout(2500);
    await author(page, false);
    return { checkpoint: await checkpoint(page) };
  },
  'swipe-rollback': async (page) => {
    await jump(page, 'study');
    await sendUserMessage(page, 'I prise up the loose board by the hearth and lift out the big brass key.', { expectReply: true });
    await settle(page);
    const moved = await checkpoint(page);
    await swipeMessage(page, 'last', 'new');
    await settle(page);
    return { afterSend: moved, afterSwipe: await checkpoint(page) };
  },
  'scene-change': async (page) => {
    await jump(page, 'study');
    await page.waitForTimeout(1500);
    await executeSlashCommand(page, '/cp activate path');
    await settle(page);
    await page.waitForTimeout(2000);
    return { checkpoint: await checkpoint(page), background: await page.evaluate(() => (globalThis as any).SillyTavern.getContext().chatMetadata?.custom_background ?? document.querySelector('#bg1')?.getAttribute('style') ?? null) };
  },
  'story-sheet': async (page) => {
    await page.click('#so-hud-sheet');
    await page.waitForSelector('#so-sheet', { timeout: 15000 });
    for (const tab of ['journal', 'people', 'here']) {
      const target = page.locator(`[data-so=sheet-tab][data-tab=${tab}]`);
      if (await target.count()) { await target.first().click(); await page.waitForTimeout(1800); }
    }
    await page.keyboard.press('Escape');
    return {};
  },
};

async function record(page: Page) {
  await openDemo(page);
  const wanted = process.argv.slice(3).filter((arg) => !arg.startsWith('--') && arg !== argument('--width'));
  const clips = (wanted.length ? wanted : [...CLIPS]) as Clip[];
  for (const clip of clips) assert.ok(CLIPS.includes(clip), `unknown clip ${clip}; known: ${CLIPS.join(', ')}`);
  const width = Number(argument('--width', '960'));
  const build = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  const route = await page.evaluate(() => (globalThis as any).SillyTavern.getContext().onlineStatus ?? null);
  await mkdir(CLIP_DIR, { recursive: true });
  const results: Record<string, unknown>[] = [];
  for (const clip of clips) {
    const recorder = new Recorder(page, width);
    await recorder.start(clip);
    await page.waitForTimeout(800);
    let detail: Record<string, unknown> = {};
    let error: string | null = null;
    try { detail = await PLAYS[clip](page); } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    await page.waitForTimeout(1000);
    const out = resolve(CLIP_DIR, `${clip}.webm`);
    const stats = await recorder.stop(out);
    await writeFile(`${out}.json`, `${JSON.stringify(clipSidecar(clip, build, { recorded: new Date().toISOString(), model: route, width, ...stats, ...detail, error }), null, 2)}\n`);
    results.push({ clip, out, ...stats, error });
    console.log(JSON.stringify({ clip, ...stats, error }));
  }
  return results;
}

async function status(page: Page) {
  await openDemo(page);
  console.log(JSON.stringify(await page.evaluate(() => {
    const root = globalThis as any, ctx = root.SillyTavern.getContext(), snap = root.storyOrchestratorRuntime.getSnapshot();
    return { groupId: ctx.groupId, chatId: ctx.chatId, messages: ctx.chat.length, checkpoint: snap?.activeCheckpointId ?? null, story: snap?.selectedStoryId ?? null, online: ctx.onlineStatus ?? null };
  }), null, 2));
}

async function cleanup(page: Page) {
  await ready(page);
  const baseline = await snapshotAssets(page);
  const removed = await removeMarkedAssets(page, MARKER, { baseline });
  const backgrounds = await page.evaluate(async (names) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    let deleted = 0;
    for (const bg of names) {
      const response = await fetch('/api/backgrounds/delete', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ bg }) });
      if (response.ok) deleted++;
    }
    return deleted;
  }, BACKDROPS.map(backgroundFile));
  console.log(JSON.stringify({ clean: removed.clean, leaked: leakCount(removed.leaked), backgrounds }));
}

async function main(page: Page) {
  laneGuard();
  const command = process.argv[2] ?? 'help';
  if (command === 'prepare') await prepare(page);
  else if (command === 'record') await record(page);
  else if (command === 'status') await status(page);
  else if (command === 'cleanup') await cleanup(page);
  else console.log(USAGE);
  return { ok: true };
}

if (process.argv[1]?.endsWith('so-demo-record.mts')) {
  if (process.argv.includes('--help') || process.argv.length < 3) console.log(USAGE);
  else await runCli(main);
}
