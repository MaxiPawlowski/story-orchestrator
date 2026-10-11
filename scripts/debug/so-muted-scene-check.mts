import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCli } from './lib/cli.mts';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { openGroup, startNewChat, closeUnpinnedDrawers } from './st-navigation.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { ensureSTReady } from './lib/st-ready.mts';

await runCli(async (page) => {
  assert.equal(process.env.SO_LANE, '30');
  await page.route('**/third-party/story-orchestrator/dist/**', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()!;
    assert.match(file, /^[\w.-]+$/);
    await route.fulfill({ contentType: file.endsWith('.json') ? 'application/json' : 'application/javascript', body: await readFile(resolve(PROJECT_ROOT, 'dist', file)) });
  });
  await page.reload(); await ensureSTReady(page);
  await page.waitForFunction(() => {
    const root = globalThis as any, ctx = root.SillyTavern.getContext();
    return root.storyOrchestratorRuntime && ctx.characters.length && ctx.getWorldInfoNames().length;
  });
  const marker = 'SOMUTE', baseline = await snapshotAssets(page);
  assert.equal(baseline.trusted, true);
  assert.equal(leakCount(await listMarkedAssets(page, marker, { baseline })), 0);
  const template = JSON.parse(await readFile(resolve(PROJECT_ROOT, '.claude/skills/st-character-authoring/templates/create-body.json'), 'utf8'));
  const original = await page.evaluate(() => structuredClone((globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator']));
  const record: any = { date: new Date().toISOString(), checks: [], modelCalls: 0 };
  await page.route(/\/api\/.*\/(?:generate|completions)$|\/api\/plugins\/.*\/(?:judge|prompt)$/, async (route) => { record.modelCalls++; await route.abort('blockedbyclient'); });
  try {
    const group = await page.evaluate(async (template) => {
      const root = globalThis as any, ctx = root.SillyTavern.getContext(), home = ctx.extensionSettings['story-orchestrator'];
      home.settings ??= {};
      home.settings.image = { ...home.settings.image, enabled: false };
      home.settings.sprites = { ...home.settings.sprites, enabled: false, explicit: true };
      home.settings.judge = { ...home.settings.judge, enabled: false };
      home.settings.display = { ...home.settings.display, briefing: false, briefingDraft: false, playerSetup: false };
      home.settings.extraction = { ...home.settings.extraction, enabled: false };
      home.settings.stagecraft = { ...home.settings.stagecraft, livingEnabled: false, prefetchEnabled: false, curatorEnabled: false, wardenEnabled: false };
      const headers = { ...ctx.getRequestHeaders() }; delete headers['Content-Type'];
      const members = [];
      for (const name of ['SOMUTE Lead', 'SOMUTE Guest', 'SOMUTE Other']) {
        const form = new FormData();
        for (const [key, value] of Object.entries({ ...template, ch_name: name, description: `${name} is a synthetic cast-availability test subject.`, first_mes: '', mes_example: '' })) {
          form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
        const answer = await fetch('/api/characters/create', { method: 'POST', headers, body: form });
        if (!answer.ok) throw new Error('Synthetic card creation failed');
        members.push((await answer.text()).trim());
      }
      await ctx.getCharacters();
      const answer = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: 'SOMUTE Scene cast', members,
        disabled_members: members.slice(1), activation_strategy: 2, generation_mode: 0, allow_self_responses: false, fav: false }) });
      if (!answer.ok) throw new Error('Synthetic group creation failed');
      const group = await answer.json(); await ctx.getCharacters(); return String(group.id);
    }, template);
    await openGroup(page, group); await startNewChat(page); await closeUnpinnedDrawers(page);
    record.checks.push(await page.evaluate(async () => {
      const root = globalThis as any, rt = root.storyOrchestratorRuntime;
      const result = await rt.importStory(JSON.stringify({ format: 2, id: 'somute-scene', title: 'SOMUTE Scene cast', description: 'Synthetic pre-muted scene regression.', qualities: [],
        roster: [{ id: 'lead', name: 'SOMUTE Lead' }, { id: 'guest', name: 'SOMUTE Guest' }, { id: 'other', name: 'SOMUTE Other' }],
        requirements: { members: ['lead', 'guest', 'other'] },
        checkpoints: [{ id: 'scene', name: 'Synthetic scene', type: 'anchor', start: true, objective: 'Keep the supporting cast offstage.', illustrate: false,
          effects: { cast_changes: { enable: ['lead'], disable: ['guest', 'other'] } } }], transitions: [] }));
      if (result?.ok === false) throw new Error('Synthetic story import refused');
      if (!rt.getStory()) throw new Error(`No played story: ${JSON.stringify({ result, groupOpen: !!root.SillyTavern.getContext().groupId, chatOpen: !!root.SillyTavern.getContext().chatId })}`);
      await rt.refreshRequirementsNow();
      const snapshot = rt.getSnapshot();
      return { id: 'pre-muted-scene', ready: snapshot.requirements.ready, mutedWarnings: snapshot.requirements.mutedMembers.length,
        trackedMutes: snapshot.effects.cast.filter((entry: any) => entry.disabled).length,
        groupMuted: root.SillyTavern.getContext().groups.find((group: any) => group.id === root.SillyTavern.getContext().groupId).disabled_members.length };
    }));
    assert.deepEqual(record.checks[0], { id: 'pre-muted-scene', ready: true, mutedWarnings: 0, trackedMutes: 0, groupMuted: 2 });
    record.checks.push(await page.evaluate(async () => {
      const root = globalThis as any, ctx = root.SillyTavern.getContext(), rt = root.storyOrchestratorRuntime;
      const group = ctx.groups.find((group: any) => group.id === ctx.groupId);
      group.disabled_members = [...group.members];
      await rt.refreshRequirementsNow();
      const warnings = rt.getSnapshot().requirements.mutedMembers;
      return { id: 'unavailable-current-speaker', warnings: warnings.length, onlyCurrentSpeaker: warnings.length === 1 && warnings[0] === 'SOMUTE Lead' };
    }));
    assert.deepEqual(record.checks[1], { id: 'unavailable-current-speaker', warnings: 1, onlyCurrentSpeaker: true });
    assert.equal(record.modelCalls, 0);
  } finally {
    await page.waitForTimeout(3500);
    await page.reload(); await ensureSTReady(page);
    await page.waitForFunction(() => (globalThis as any).SillyTavern.getContext().characters.length);
    let cleanup = await removeMarkedAssets(page, marker, { baseline });
    await page.waitForTimeout(3000);
    await page.evaluate(async () => { await (globalThis as any).SillyTavern.getContext().getCharacters(); });
    if (leakCount(await listMarkedAssets(page, marker, { baseline }))) {
      cleanup = await removeMarkedAssets(page, marker, { baseline });
      await page.waitForTimeout(3000);
      await page.evaluate(async () => { await (globalThis as any).SillyTavern.getContext().getCharacters(); });
    }
    const leaked = leakCount(await listMarkedAssets(page, marker, { baseline }));
    record.cleanup = { clean: leaked === 0 && cleanup.removed.errors.length === 0, leaked };
    await page.evaluate((original) => { (globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator'] = original; }, original);
    await saveSettingsNow(page);
    const out = resolve(DEBUG_DIR, 'runs', `muted-scene-${Date.now()}`); await mkdir(out, { recursive: true });
    await writeFile(resolve(out, 'record.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify(record, null, 2));
    assert.equal(record.cleanup.clean, true);
  }
});
