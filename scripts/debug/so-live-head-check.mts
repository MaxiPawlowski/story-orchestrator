import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { hostname, cpus } from 'node:os';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { runCli } from './lib/cli.mts';
import { connectToST, DEBUG_DIR, PROJECT_ROOT, type ConnectResult } from './lib/connection.mts';
import { openGroup, startNewChat, closeUnpinnedDrawers } from './st-navigation.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { installLiveHeadProbe, resetLiveHeadSamples, readLiveHeadSamples } from './lib/liveHeadProbe.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { openExtensionSettings } from './so-ui.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { hiddenHeadCheck } from './lib/liveHeadHidden.mts';

const fixture = resolve(PROJECT_ROOT, 'test/scenarios/live-head');
const marker = 'SOLH';
const argument = (key: string, fallback: string) => {
  const at = process.argv.indexOf(key);
  return at < 0 ? fallback : process.argv[at + 1] || fallback;
};
const row = argument('--row', 'all');
const label = argument('--label', new Date().toISOString().replace(/[:.]/g, '-'));
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function ready(page: Page) {
  await page.waitForFunction(() => document.querySelector('[data-live-head-ready="true"] canvas.so-live-head'));
  await page.waitForTimeout(1000);
}

async function remount(page: Page, failure = '') {
  await page.evaluate((failure) => {
    const root = globalThis as any, stage = root.storyOrchestratorSprites;
    root.__lh.failure = failure; root.__lh.decodeStarted = false; root.__lh.releaseDecode = []; root.__lh.publications = [];
    stage.updateSettings({ liveHead: false });
  }, failure);
  await page.waitForFunction(() => !document.querySelector('canvas.so-live-head'));
  await page.evaluate(() => (globalThis as any).storyOrchestratorSprites.updateSettings({ liveHead: true }));
}

async function oneFrameStatic(page: Page, switching = false) {
  return page.evaluate((switching) => new Promise<boolean>((done) => requestAnimationFrame(() => done((globalThis as any).__lhStatic(switching)))), switching);
}

async function main(page: Page, connection: ConnectResult) {
  let reconnected: ConnectResult | null = null;
  assert.equal(process.env.SO_LANE, '30', 'Live-head checks require isolated lane 30');
  assert.match(process.env.ST_DEBUG_VIEWPORT ?? '', /^\d+x\d+$/, 'Set ST_DEBUG_VIEWPORT explicitly');
  if (process.argv.includes('--candidate')) await page.route('**/third-party/story-orchestrator/dist/**', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()!;
    assert.match(file, /^[a-zA-Z0-9_.-]+$/);
    await route.fulfill({ contentType: file.endsWith('.json') ? 'application/json' : 'application/javascript', body: await readFile(resolve(PROJECT_ROOT, 'dist', file)) });
  });
  const cache = await page.context().newCDPSession(page);
  await cache.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload(); await ensureSTReady(page); await cache.detach();
  await page.waitForFunction(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return ctx.extensionSettings?.['story-orchestrator'] && ctx.characters?.length && ctx.getWorldInfoNames?.().length;
  });
  const recipe = JSON.parse(await readFile(resolve(fixture, 'rig.json'), 'utf8'));
  const rig = JSON.parse(await readFile(resolve(PROJECT_ROOT, recipe.template), 'utf8'));
  const story = JSON.parse(await readFile(resolve(fixture, 'story.json'), 'utf8'));
  const template = JSON.parse(await readFile(resolve(PROJECT_ROOT, '.claude/skills/st-character-authoring/templates/create-body.json'), 'utf8'));
  const out = resolve(DEBUG_DIR, 'runs', `live-head-${label}`);
  await mkdir(out, { recursive: true });
  const record: any = { date: new Date().toISOString(), row, viewport: process.env.ST_DEBUG_VIEWPORT,
    machine: { hostname: hostname(), cpu: cpus()[0]?.model, platform: process.platform }, checks: [], modelRequests: 0 };
  const baseline = await snapshotAssets(page);
  assert.equal(baseline.trusted, true, baseline.untrusted.join('; '));
  assert.equal(leakCount(await listMarkedAssets(page, marker, { baseline })), 0, 'Synthetic marker already exists');
  const settings = await page.evaluate(() => {
    const root = globalThis as any, ctx = root.SillyTavern.getContext();
    return { settings: structuredClone(ctx.extensionSettings['story-orchestrator']), reduced: ctx.powerUserSettings.reduced_motion };
  });
  const manifests = new Map<string, any>();
  let fault = '', blocked = 0;
  await page.route(/\/api\/.*\/(?:generate|completions)$|\/api\/plugins\/.*\/(?:judge|prompt)$/, async (route) => {
    blocked++; await route.abort('blockedbyclient');
  });
  await page.route('**/SOLH/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/SOLH/layer/')) {
      const index = Number(url.pathname.split('/').pop()?.split('.')[0]);
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(rig.layers[index].image.split(',')[1], 'base64') });
    }
    if (fault === 'fetch') return route.abort('failed');
    const manifest = manifests.get(url.pathname);
    if (!manifest) return route.fulfill({ status: 404, body: 'missing fixture' });
    return route.fulfill({ contentType: 'application/json', body: fault === 'json' ? '{broken' : JSON.stringify(manifest) });
  });
  try {
    await page.evaluate(() => {
      const root = globalThis as any, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
      home.settings ??= {};
      home.settings.extraction = { ...home.settings.extraction, enabled: false };
      home.settings.display = { ...home.settings.display, briefing: false, briefingDraft: false, playerSetup: false };
      home.settings.stagecraft = { ...home.settings.stagecraft, livingEnabled: false, prefetchEnabled: false, curatorEnabled: false, wardenEnabled: false };
      home.settings.image = { ...home.settings.image, enabled: false };
      home.settings.judge = { ...home.settings.judge, enabled: false };
    });
    await page.evaluate(installLiveHeadProbe);
    const created = await page.evaluate(async ({ story, template, png }) => {
      const ctx = (globalThis as any).SillyTavern.getContext(), members = [];
      const headers = { ...ctx.getRequestHeaders() }; delete headers['Content-Type'];
      for (const member of story.roster) {
        const form = new FormData();
        const body = { ...template, ch_name: member.name, description: `${member.name} is an owned geometric bust for browser animation checks.`,
          first_mes: '', mes_example: '', creator_notes: 'Synthetic SOLH browser fixture.',
          extensions: JSON.stringify({ so_sprites: { default: 'neutral', labels: { neutral: { what: 'Neutral geometric face' } }, sets: [{ id: 'alternate', when: {} }] } }) };
        for (const [key, value] of Object.entries(body)) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
        const response = await fetch('/api/characters/create', { method: 'POST', headers, body: form });
        if (!response.ok) throw new Error(`Create failed: ${response.status}`);
        const avatar = (await response.text()).trim();
        const paths: Record<string, string> = {};
        for (const look of ['default', 'alternate']) {
          const folder = member.name + (look === 'default' ? '' : '/alternate');
          const upload = new FormData(); upload.append('name', folder); upload.append('label', 'neutral'); upload.append('spriteName', 'neutral');
          upload.append('avatar', new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], 'neutral.png', { type: 'image/png' }));
          const answer = await fetch('/api/sprites/upload', { method: 'POST', headers, body: upload });
          if (!answer.ok) throw new Error(`Sprite upload failed: ${answer.status}`);
          const files = await (await fetch(`/api/sprites/get?name=${encodeURIComponent(folder)}`, { headers: ctx.getRequestHeaders() })).json();
          paths[look] = files.find((file: any) => file.label === 'neutral').path;
        }
        members.push({ ...member, avatar, paths });
      }
      await ctx.getCharacters();
      const response = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: 'SOLH Browser shapes',
        members: members.map((member) => member.avatar), activation_strategy: 2, generation_mode: 0, disabled_members: [], allow_self_responses: false, fav: false }) });
      const group = await response.json(); if (!response.ok || !group.id) throw new Error('Synthetic group creation failed');
      await ctx.getCharacters(); return { group: String(group.id), members };
    }, { story, template, png: rig.source.split(',')[1] });
    const refs: Record<string, any> = {};
    for (const member of created.members) for (const look of recipe.looks) {
      const manifest = { ...rig, member: member.id, look, source: member.paths[look], layers: rig.layers.map((layer: any, index: number) => ({ ...layer, image: `/SOLH/layer/${index}.png` })) };
      const path = `/SOLH/${member.id}-${look}.json`;
      manifests.set(path, manifest);
      const ref = { member: member.id, look, artHash: rig.artHash, source: manifest.source, manifest: path };
      refs[JSON.stringify([member.id, look, rig.artHash])] = ref;
    }
    await openGroup(page, created.group);
    await startNewChat(page);
    await closeUnpinnedDrawers(page);
    await page.evaluate(async ({ story, refs }) => {
      const root = globalThis as any, rt = root.storyOrchestratorRuntime;
      rt.setExtractionSettings({ enabled: false });
      const home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
      home.settings ??= {}; home.settings.image = { ...home.settings.image, enabled: false }; home.settings.judge = { ...home.settings.judge, enabled: false };
      home.settings.sprites = { ...home.settings.sprites, enabled: true, explicit: true, stage: 'always', onDemand: false, builders: {}, poses: false, liveHead: true, liveHeadRigs: refs };
      await rt.importStory(JSON.stringify(story)); rt.notify();
      rt.setUiSettings({ briefingSeen: true });
    }, { story, refs });
    await page.waitForFunction(() => !!(globalThis as any).storyOrchestratorSprites);
    await page.evaluate(async () => { const stage = (globalThis as any).storyOrchestratorSprites; await stage.reload(); stage.speaking = 'SOLH Circle'; stage.notify(); });
    await ready(page);
    if (await page.locator('#so-briefing[open] #so-briefing-start').isVisible()) await page.locator('#so-briefing-start').click();
    assert.equal(await page.locator('#so-vn-stage .so-sprite').count(), 3);
    const served = await page.evaluate(async () => {
      const bytes = await (await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js')).arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const gl = document.querySelector<HTMLCanvasElement>('canvas.so-live-head')!.getContext('webgl2')!;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return { hash, bytes: bytes.byteLength, dpr: devicePixelRatio, renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), browser: navigator.userAgent };
    });
    record.build = served; record.fixtureHash = digest(Buffer.from(JSON.stringify({ story, rig })));
    const check = (id: string, details: any, ok: boolean) => { record.checks.push({ id, ...details, ok }); console.log(`${id}: ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(details)}`); };
    if (row === 'all' || row === 'LI1') {
      const motion = await page.context().newCDPSession(page);
      await motion.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await page.evaluate(() => {
        const root = globalThis as any; root.SillyTavern.getContext().powerUserSettings.reduced_motion = false;
        root.storyOrchestratorRuntime.getStory().display.motion = true; root.storyOrchestratorSprites.notify();
      });
      await page.waitForTimeout(500);
      await page.evaluate(resetLiveHeadSamples);
      await page.evaluate(() => { (globalThis as any).__lh.parameterSample = false; });
      await pause(60_000);
      await motion.detach();
      const samples = await page.evaluate(readLiveHeadSamples);
      await writeFile(resolve(out, 'LI1-frames.json'), JSON.stringify(samples.frames));
      const sorted = [...samples.intervals].sort((a, b) => a - b), drops = sorted.filter((ms) => ms > 33.34);
      await writeFile(resolve(out, 'LI1-spikes.json'), JSON.stringify({ spikes: samples.spikes, ticks: samples.ticks, longTasks: samples.longTasks }, null, 1));
      check('LI1', { frames: samples.frames.length, durationMs: samples.frames.at(-1)! - samples.frames[0],
        p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: Math.max(...sorted), drops: drops.length,
        uploads: samples.uploads, rafTicks: samples.ticks, tickP50Ms: samples.tickP50Ms, tickMaxMs: samples.tickMaxMs, longTasks: samples.longTasks,
        spikes: samples.spikes.map((spike: any) => ({ atMs: Math.round(spike.atMs), intervalMs: spike.intervalMs, cause: spike.cause, tasks: spike.tasks.length })) },
      samples.frames.length > 1 && samples.frames.at(-1)! - samples.frames[0] >= 59_900 && samples.uploads > 0 && !drops.length);
    }
    if (row === 'all' || row === 'LI3') {
      for (const failure of ['fetch', 'json', 'image', 'hash', 'webgl', 'context', 'member', 'look', 'chat']) {
        fault = '';
        await remount(page); await ready(page);
        await page.screenshot({ path: resolve(out, `LI3-${failure}-before.png`) });
        if (failure === 'context') {
          await page.evaluate(() => { (globalThis as any).__lh.publications = []; });
          await page.evaluate(() => document.querySelector<HTMLCanvasElement>('canvas.so-live-head')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
          await page.waitForFunction(() => !(globalThis as any).__lh.contexts.size);
        } else {
          fault = failure === 'fetch' || failure === 'json' ? failure : '';
          if (failure === 'hash') {
            for (const manifest of manifests.values()) manifest.artHash = '0'.repeat(64);
            await page.evaluate(() => {
              const stage = (globalThis as any).storyOrchestratorSprites, refs: Record<string, any> = {};
              for (const ref of Object.values(stage.view().settings.liveHeadRigs) as any[]) {
                const changed = { ...ref, artHash: '0'.repeat(64) }; refs[JSON.stringify([changed.member, changed.look, changed.artHash])] = changed;
              }
              stage.updateSettings({ liveHeadRigs: refs });
            });
          }
          await remount(page, ['member', 'look', 'chat'].includes(failure) ? 'decode' : failure);
          if (['member', 'look', 'chat'].includes(failure)) {
            await page.waitForFunction(() => (globalThis as any).__lh.decodeStarted);
            await page.evaluate(() => { (globalThis as any).__lh.staleCanvas = document.querySelector('canvas.so-live-head'); });
            if (failure === 'chat') { await startNewChat(page); }
            else await page.evaluate((failure) => {
              const stage = (globalThis as any).storyOrchestratorSprites;
              if (failure === 'member') stage.speaking = 'SOLH Square';
              else { const actor = stage.actors.find((actor: any) => actor.name === 'SOLH Circle'); actor.set = 'alternate'; actor.path = actor.packs.get('alternate').get('neutral'); }
              stage.notify();
            }, failure);
            await page.evaluate(() => { const state = (globalThis as any).__lh; state.failure = ''; state.releaseDecode.forEach((release: () => void) => release()); });
          }
        }
        const switching = ['member', 'look', 'chat'].includes(failure);
        const visible = failure === 'chat' ? await page.evaluate(() => !(globalThis as any).__lh.staleCanvas?.isConnected) : await oneFrameStatic(page, switching);
        await page.waitForTimeout(250);
        const stale = await page.evaluate((switching) => {
          const state = (globalThis as any).__lh;
          return switching ? state.publications.filter((canvas: HTMLCanvasElement) => canvas === state.staleCanvas).length : state.publications.length;
        }, switching);
        check(`LI3/${failure}`, { staticWithinOneFrame: visible, stalePublications: stale, ...(visible ? {} : { why: await page.evaluate(() => (globalThis as any).__lhWhy()) }) }, visible && stale === 0);
        await page.screenshot({ path: resolve(out, `LI3-${failure}-after.png`) });
        fault = ''; for (const manifest of manifests.values()) manifest.artHash = rig.artHash;
        await page.evaluate(async ({ refs, story }) => {
          const root = globalThis as any, stage = root.storyOrchestratorSprites;
          stage.speaking = 'SOLH Circle'; stage.updateSettings({ liveHeadRigs: refs, liveHead: false });
          if (!root.storyOrchestratorRuntime.getStory()) await root.storyOrchestratorRuntime.importStory(JSON.stringify(story));
          await stage.reload(); stage.speaking = 'SOLH Circle'; stage.notify();
        }, { refs, story });
      }
      await remount(page); await ready(page);
    }
    if (row === 'all' || row === 'LI4') {
      await page.evaluate(() => { (globalThis as any).__lh.parameterSample = true; });
      const cdp = await page.context().newCDPSession(page);
      for (const setting of ['OS', 'ST', 'story']) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: setting === 'OS' ? 'reduce' : 'no-preference' }] });
        await page.evaluate((setting) => {
          const root = globalThis as any; root.SillyTavern.getContext().powerUserSettings.reduced_motion = setting === 'ST';
          root.storyOrchestratorRuntime.getStory().display.motion = setting !== 'story'; root.storyOrchestratorSprites.notify();
        }, setting);
        for (const streaming of [false, true]) {
          await page.evaluate((streaming) => {
            const root = globalThis as any, ctx = root.SillyTavern.getContext();
            if (streaming) {
              ctx.chat.push({ name: 'SOLH Circle', is_user: false, is_system: false, mes: '', extra: {} });
              root.storyOrchestratorSprites.begin('SOLH Circle');
            }
            root.__lhStream = streaming ? setInterval(() => {
              ctx.chat.at(-1).mes += 'x';
              ctx.eventSource.emit(ctx.eventTypes.STREAM_TOKEN_RECEIVED, 'x');
            }, 100) : null;
          }, streaming);
          await page.waitForTimeout(300); await page.evaluate(resetLiveHeadSamples); await pause(10_000);
          const samples = await page.evaluate(readLiveHeadSamples);
          const activeStream = await page.evaluate((streaming) => {
            const root = globalThis as any; clearInterval(root.__lhStream);
            const active = !streaming || root.storyOrchestratorSprites.activity.view() === 'SOLH Circle';
            root.storyOrchestratorSprites.activity.stop();
            if (streaming) root.SillyTavern.getContext().chat.pop();
            return active;
          }, streaming);
          await writeFile(resolve(out, `LI4-${setting}-${streaming ? 'stream' : 'idle'}.json`), JSON.stringify(samples));
          check(`LI4/${setting}/${streaming ? 'stream' : 'idle'}`, { frames: samples.frames.length, parameterVectors: samples.vectors.length, mouths: samples.mouths, uploads: samples.uploads },
            activeStream && samples.frames.length > 1 && samples.vectors.length === 1 && samples.mouths.length === 1 && samples.mouths[0] === 0);
        }
      }
      await cdp.send('Emulation.setEmulatedMedia', { features: [] }); await cdp.detach();
    }
    if (row === 'all' || row === 'LI6') {
      await page.evaluate(() => {
        const root = globalThis as any; root.SillyTavern.getContext().powerUserSettings.reduced_motion = false;
        root.storyOrchestratorRuntime.getStory().display.motion = true; root.storyOrchestratorSprites.notify();
      });
      await page.evaluate(() => (globalThis as any).storyOrchestratorRuntime.setUiSettings({ authorView: true }));
      if (await page.locator('#so-briefing[open] #so-briefing-start').isVisible()) await page.locator('#so-briefing-start').click();
      await openExtensionSettings(page);
      await page.evaluate(() => {
        const author = document.getElementById('so-live-head-author');
        for (let parent = author?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
      });
      await page.waitForSelector('#so-live-head-author', { state: 'attached' });
      const sections = await page.evaluate(() => {
        const ids: string[] = [];
        for (let parent = document.getElementById('so-live-head-author')?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement && parent.id) ids.unshift(parent.id);
        return ids;
      });
      for (const id of sections) {
        const section = page.locator('details#' + id);
        if (!(await section.evaluate((element) => (element as HTMLDetailsElement).open))) await section.locator('> summary').click();
      }
      const summary = page.locator('#so-live-head-author summary');
      await summary.focus(); await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      const keyboardText = await page.locator('#so-live-head-json').evaluate((element) => element === document.activeElement);
      const importable = [...manifests.values()].find((manifest) => manifest.member === 'circle' && manifest.look === 'default');
      await page.locator('#so-live-head-json').fill(JSON.stringify(importable));
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      await page.locator('#so-live-head-author [role="status"]').filter({ hasText: 'Rig imported for' }).waitFor();
      check('LI6/keyboard', { textareaFocusedByTab: keyboardText, imported: true }, keyboardText);
      await closeUnpinnedDrawers(page); await ready(page);
      const sizes = row === 'all' ? [390, 768, 1440] : [Number(process.env.ST_DEBUG_VIEWPORT!.split('x')[0])];
      for (const width of sizes) {
        await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(500);
        const layout = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
          contexts: (globalThis as any).__lh.contexts.size, peakContexts: (globalThis as any).__lh.peak, canvases: document.querySelectorAll('canvas.so-live-head').length }));
        check(`LI6/${width}`, layout, layout.scroll <= layout.viewport && layout.contexts <= 1 && layout.peakContexts <= 1 && layout.canvases <= 1);
        await page.screenshot({ path: resolve(out, `LI6-${width}.png`) });
      }
      try {
        const hidden = await hiddenHeadCheck(connection);
        check('LI6/hidden', hidden, hidden.ok);
      } finally { reconnected = await connectToST(); page = reconnected.page; }
      await page.evaluate(() => (globalThis as any).storyOrchestratorSprites.updateSettings({ liveHead: false }));
      await page.waitForFunction(() => !document.querySelector('canvas.so-live-head'));
      await page.waitForTimeout(250);
      const resources = await page.evaluate(readLiveHeadSamples);
      check('LI6/teardown', { contexts: resources.contexts, resources: resources.resources }, resources.contexts === 0 && resources.resources === 0);
    }
  } finally {
    record.modelRequests = blocked;
    try {
      await page.evaluate(({ settings }) => {
        const root = globalThis as any, ctx = root.SillyTavern.getContext(); clearInterval(root.__lhStream);
        root.storyOrchestratorSprites?.updateSettings({ enabled: false, explicit: true, liveHead: false });
        ctx.powerUserSettings.reduced_motion = settings.reduced;
      }, { settings });
      const listed = await listMarkedAssets(page, marker, { baseline });
      const cleanup = await removeMarkedAssets(page, marker, { baseline });
      record.cleanup = { listed: leakCount(listed), clean: cleanup.clean, leaked: leakCount(cleanup.leaked) };
      await page.evaluate(({ settings }) => { (globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator'] = settings.settings; }, { settings });
      await saveSettingsNow(page);
    } catch (error) { record.cleanup = { clean: false, error: String(error) }; }
    record.ok = record.checks.length > 0 && record.checks.every((check: any) => check.ok) && blocked === 0 && record.cleanup?.clean;
    await writeFile(resolve(out, 'record.json'), JSON.stringify(record, null, 2));
    console.log(`live-head record: ${resolve(out, 'record.json')}`);
    await reconnected?.browser.close();
  }
  return { ok: record.ok };
}

if (process.argv.includes('--help')) console.log('ST_DEBUG_VIEWPORT=1440x844 node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-live-head-check.mts --row LI1|LI3|LI4|LI6|all --label <run> [--candidate]');
else await runCli(main);
