import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCli } from './lib/cli.mts';
import { PROJECT_ROOT } from './lib/connection.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { writeJSON } from './lib/output.mts';
import { runScenario } from './so-scenario.mts';
import { openGroup } from './st-navigation.mts';
import { captureHeader, diffHeaders } from './so-run-header.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';

await runCli(async (page) => {
  assert.equal(process.env.SO_LANE, '33', 'Open-stretch checks require isolated lane 33');
  const files = new Map<string, Buffer>();
  let blocked = 0;
  let offlineProbes = 0;
  await page.route('**/third-party/story-orchestrator/dist/**', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()!;
    assert.match(file, /^[a-zA-Z0-9_.-]+$/);
    if (!files.has(file)) files.set(file, await readFile(resolve(PROJECT_ROOT, 'dist', file)));
    await route.fulfill({ contentType: file.endsWith('.json') ? 'application/json' : 'application/javascript', body: files.get(file)! });
  });
  await page.route(/\/api\/.*\/(?:generate|completions)$|\/api\/plugins\/.*\/(?:judge|prompt)$/, async (route) => {
    if (route.request().postData()?.includes('Reply with exactly: PONG')) offlineProbes += 1;
    else blocked += 1;
    await route.abort('blockedbyclient');
  });
  const cache = await page.context().newCDPSession(page);
  await cache.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload();
  await ensureSTReady(page);
  await page.waitForFunction(() => (globalThis as any).storyOrchestratorRuntime, undefined, { timeout: 60000 });
  await page.waitForFunction(() => (globalThis as any).SillyTavern.getContext().characters?.length > 0, undefined, { timeout: 60000 });
  await cache.detach();
  const media = await page.evaluate(() => {
    const settings = (globalThis as any).storyOrchestratorRuntime.getGlobalSettings();
    return { image: settings.image.enabled, sprites: settings.sprites.enabled };
  });
  assert.deepEqual(media, { image: false, sprites: false });
  const marker = 'SO-Open-Stretch-Curve';
  const baseline = await snapshotAssets(page);
  assert.equal(baseline.trusted, true, baseline.untrusted.join('; '));
  assert.equal(leakCount(await listMarkedAssets(page, marker, { baseline })), 0);
  const settingsBefore = await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const home = ctx.extensionSettings['story-orchestrator'];
    const before = structuredClone(home.settings);
    home.settings ??= {};
    home.settings.memory = { ...home.settings.memory, enabled: false, innerBeat: false };
    home.settings.copilot = { ...home.settings.copilot, enabled: false };
    home.settings.stagecraft = { ...home.settings.stagecraft, livingEnabled: false, prefetchEnabled: false, curatorEnabled: false, wardenEnabled: false };
    home.settings.display = { ...home.settings.display, briefing: false, briefingDraft: false, playerSetup: false, announceTransitions: false };
    home.settings.extraction = { ...home.settings.extraction, enabled: false };
    return before;
  });
  try {
    await saveSettingsNow(page);
    const group = await page.evaluate(async (name) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const members = ['Arin', 'DM Narrator'].map((name) => {
        const member = ctx.characters.find((character: any) => character.name === name);
        if (!member) throw new Error(`Missing fixture member ${name}`);
        return member.avatar;
      });
      const stamp = ctx.humanizedDateTime();
      const response = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({
        name, members, avatar_url: 'img/ai4.png', allow_self_responses: false, activation_strategy: 2,
        generation_mode: 0, disabled_members: [], fav: false, chat_id: stamp, chats: [stamp], auto_mode_delay: 5,
      }) });
      if (!response.ok) throw new Error(`Creating fixture group failed: ${response.status}`);
      const group = await response.json();
      await ctx.getCharacters();
      return String(group.id);
    }, marker);
    await openGroup(page, group);
    await page.waitForTimeout(3000);
    const before = await captureHeader(page, 'open-stretch-start');
    await writeJSON(before, 'open-stretch-header-start');
    const results = [];
    for (const run of [1, 2]) {
      const result = await runScenario(page, 'test/scenarios/v27-35-open-stretch-curve.json', { sandbox: true, group });
      await writeJSON({ run, media, blocked, offlineProbes, result }, `open-stretch-curve-run${run}`);
      assert.equal(result.ok, true, JSON.stringify(result.error));
      results.push({ run, steps: (result.steps as unknown[]).length, ok: result.ok });
    }
    assert.equal(blocked, 0, 'The no-model curve attempted a model or media request');
    const after = await captureHeader(page, 'open-stretch-end');
    const differences = diffHeaders(before, after);
    await writeJSON({ before, after, differences }, 'open-stretch-header-diff');
    assert.deepEqual(differences.filter((difference) => !difference.allowed), []);
    console.log(JSON.stringify({ ok: true, candidateFiles: [...files.keys()], media, blocked, offlineProbes, results }, null, 2));
    return { ok: true };
  } catch (error) {
    console.error('Open-stretch check failed:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    try {
      await page.waitForTimeout(3000);
      const assets = await listMarkedAssets(page, marker, { baseline });
      const cleanup = await removeMarkedAssets(page, marker, { baseline });
      await writeJSON({ assets, cleanup }, 'open-stretch-assets-cleanup');
      await page.waitForTimeout(3000);
      await page.evaluate(async () => (globalThis as any).SillyTavern.getContext().getCharacters());
      assert.equal(leakCount(await listMarkedAssets(page, marker, { baseline })), 0, 'Fixture assets leaked');
    } finally {
      await page.evaluate((settings) => { (globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator'].settings = settings; }, settingsBefore);
      await saveSettingsNow(page);
    }
  }
}, { pageCapture: 'open-stretch' });
