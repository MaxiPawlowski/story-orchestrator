import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withST } from './lib/cli.mts';
import { openGroup, closeUnpinnedDrawers } from './st-navigation.mts';
import { openCheckpointStudio, closeCheckpointStudio } from './so-ui.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { buildSpriteFromUI } from './so-sprite-builder.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { argValue, requireHarness } from './lib/imageHarness.mts';

if (!Number.isInteger(Number(process.env.SO_LANE)) || Number(process.env.SO_LANE) < 1) throw new Error('Use an isolated lane: st-lanes.mts run <n> -- ... with n >= 1.');
const controller = requireHarness(['controller']).controllerUrl.replace(/\/+$/, '');
const directory = resolve('test/sessions/evidence/measurements-v2.7/saga-main-cast');
const inventory = JSON.parse(await readFile(resolve(directory, 'inventory.json'), 'utf8'));
const boxes = { Belle: [221, 11, 320, 320], Dalan: [340, 0, 320, 280], Tobias: [340, 0, 320, 280],
  Natalia: [240, 35, 320, 280], Shiya: [220, 70, 320, 280], Ronan: [240, 10, 320, 320],
  Javon: [240, 0, 320, 260], Eriana: [240, 85, 320, 300] };
const set = 'so_saga_main_v1';
const character = process.argv[2] ?? 'all';
const first = process.argv.includes('--neutral-only');
const warm = process.argv.includes('--warm-batch');
const auditOnly = process.argv.includes('--audit-only');
const limitAt = process.argv.indexOf('--limit');
const limit = limitAt < 0 ? Infinity : Number(process.argv[limitAt + 1]);
if (!(limit > 0)) throw new Error('Use a positive --limit for new frames.');
const selected = inventory.filter((row) => character === 'all' || row.name === character);
if (!selected.length) throw new Error('Unknown main character.');
await mkdir(directory, { recursive: true });
const reportFile = resolve(directory, `frames-${character}-${first ? 'neutral' : 'all'}.json`);
const report: any = JSON.parse(await readFile(reportFile, 'utf8').catch(() => JSON.stringify({ rows: [], failures: [] })));
report.at = new Date().toISOString(); report.complete = false;
const samples: any[] = JSON.parse(await readFile(resolve(directory, 'samples.json'), 'utf8').catch(() => '[]'));
const persist = async () => {
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  await writeFile(resolve(directory, 'samples.json'), JSON.stringify(samples));
};
await withST(async (page) => {
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings())));
  let batch: Awaited<ReturnType<typeof page.evaluateHandle>> | null = null;
  let generated = 0;
  const traffic = { leases: 0, releases: 0, renewals: 0, imageJobs: 0, events: [] as Array<{ at: string; path: string }> };
  const count = (request) => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path.includes('/story-orchestrator-gpu/') || path.endsWith('/story-orchestrator-media/jobs')) traffic.events.push({ at: new Date().toISOString(), path });
    if (path.endsWith('/story-orchestrator-gpu/lease')) traffic.leases++;
    if (path.endsWith('/story-orchestrator-gpu/release')) traffic.releases++;
    if (path.endsWith('/story-orchestrator-gpu/renew')) traffic.renewals++;
    if (path.endsWith('/story-orchestrator-media/jobs')) traffic.imageJobs++;
  };
  page.on('request', count);
  const run = { began: new Date().toISOString(), warm, traffic, before: await (await fetch(`${controller}/status`)).json(), generated: 0 };
  report.memory = [{ phase: 'start', node: process.memoryUsage() }];
  const story = { format: 2, id: 'so-saga-art-build', title: 'SO Saga main-cast art',
    description: 'Isolated expression-animation workshop for the eight main characters.',
    roster: inventory.map((row) => ({ id: row.name.toLowerCase(), name: row.name, role: 'Portrait subject' })),
    requirements: { members: inventory.map((row) => row.name) }, qualities: [{ key: 'workshop', type: 'bool', source: 'code', rubric: 'Portrait workshop marker.' }],
    checkpoints: [{ id: 'start', name: 'Portrait workshop', type: 'anchor', start: true, objective: 'Prepare reviewed expression animation.', illustrate: false }], transitions: [] };
  try {
    await page.evaluate(() => {
      const root = (globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator'];
      const ours = (root.settings ??= {});
      ours.image = { ...(ours.image ?? {}), enabled: false }; ours.sprites = { ...(ours.sprites ?? {}), onDemand: false }; ours.extraction = { ...(ours.extraction ?? {}), enabled: false };
    });
    await openGroup(page, argValue(process.argv.slice(2), '--group', 'Adolion - The Saga'));
    await page.evaluate(async (story) => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      await rt.importStory(JSON.stringify(story));
      if (rt.getSnapshot().storyId !== story.id) throw new Error(`Workshop import refused: ${JSON.stringify(rt.getSnapshot().validationErrors)}`);
      rt.setUiSettings({ authorView: true });
    }, story);
    await page.waitForSelector('#so-open-studio', { state: 'attached', timeout: 30000 });
    if (await page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(page);
    await closeUnpinnedDrawers(page);
    const rest = JSON.parse(await readFile(resolve(argValue(process.argv.slice(2), '--rest-report', 'test/sessions/evidence/measurements-v2.7/sprite-quality/neutral-rest/report.json')), 'utf8'));
    const neutral = rest.candidates.find((row) => row.number === 3);
    const jobs: any[] = [];
    const verified = await page.evaluate(async ({ selected, set }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const post = async (route, body) => {
        const response = await fetch(`/api/plugins/story-orchestrator-media/${route}`, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
        if (!response.ok) throw new Error('The resume inventory is unavailable.');
        return response.json();
      };
      const response = await fetch('/api/plugins/story-orchestrator-media/sprites/inventory', { headers: ctx.getRequestHeaders() });
      if (!response.ok) throw new Error('Owned sprite inventory unavailable.');
      const inventory = await response.json();
      if (!inventory.trusted) throw new Error('Owned sprite inventory is untrusted.');
      const result = {};
      for (const member of selected) {
        result[member.name] = { originals: await post('sprites/reference-pack', { character: member.folder, set: '' }),
          bases: await post('sprites/read', { character: member.folder, set }),
          frames: await post('sprites/read', { character: member.folder, set: `anim-${set}` }),
          files: inventory.rows.filter((row) => row.character === member.folder && [set, `anim-${set}`].includes(row.set)) };
      }
      return result;
    }, { selected, set });
    for (const member of selected) {
      const labels = member.sets.find((row) => row.id === 'default').labels;
      for (const source of labels.filter((row) => !first || row.label === 'neutral')) {
        const id = `${member.name}/${source.label}`;
        const packet = verified[member.name];
        const original = packet.originals.files.find((file) => file.label === source.label);
        if (!original || original.sha256 !== source.sha256) throw new Error('Original sprite inventory changed.');
        let sample = samples.find((row) => row.id === id);
        const owned = packet.bases?.labels?.[source.label];
        const file = packet.files.find((row) => row.set === set && row.label === source.label);
        const cachedHash = sample ? createHash('sha256').update(Buffer.from(sample.base.split(',')[1], 'base64')).digest('hex') : null;
        if (owned && (!file || file.actualHash !== owned.sha256 || cachedHash && cachedHash !== owned.sha256)) throw new Error('The saved base or review changed.');
        const image = owned && sample ? { data: sample.base, hash: owned.sha256 } : await page.evaluate(async ({ member, source, set, neutral, original }) => {
          const ctx = (globalThis as any).SillyTavern.getContext();
          const post = async (route, body) => {
            const response = await fetch(`/api/plugins/story-orchestrator-media/${route}`, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
            const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Media request failed.'); return data;
          };
          let bytes = new Uint8Array(await (await fetch(original.path)).arrayBuffer());
          const corrected = member.name === 'Belle' && source.label === 'neutral';
          if (corrected) bytes = Uint8Array.from(atob(neutral.data.split(',')[1]), (letter) => letter.charCodeAt(0));
          const data = await new Promise<string>((done) => { const reader = new FileReader(); reader.onload = () => done(String(reader.result)); reader.readAsDataURL(new Blob([bytes], { type: 'image/png' })); });
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((n) => n.toString(16).padStart(2, '0')).join('');
          const existing = await post('sprites/read', { character: member.folder, set });
          const row = existing?.labels?.[source.label];
          if (row && row.sha256 !== hash) throw new Error('The owned base differs; use another set version.');
          if (!row) await post('sprites/save', { character: member.folder, set, label: source.label, data: data.split(',')[1], key: hash,
            recipe: { id: corrected ? 'qwen21-neutral-rest' : 'saga-reference-copy', version: 1 }, qa: { ok: true },
            inputs: { base: corrected ? neutral.saved.sha256 : original.sha256, story: 'adolion-saga', member: member.name, protectedOriginal: true } });
          return { data, hash };
        }, { member, source, set, neutral, original });
        if (!sample) { sample = { id, name: member.name, label: source.label, base: image.data, blink: '', talk: '' }; samples.push(sample); }
        if (sample.base !== image.data) throw new Error('Resume reference differs from the current owned base.');
        jobs.push({ member, source, id, sample, hash: image.hash, packet });
      }
    }
    await openCheckpointStudio(page);
    report.memory.push({ phase: 'references-ready', node: process.memoryUsage(), browserHeap: await page.evaluate(() => (performance as any).memory?.usedJSHeapSize),
      ram: (await (await fetch(`${controller}/status`)).json()).telemetry.host.availableMiB });
    if (warm) batch = await page.evaluateHandle(async () => await (globalThis as any).storyOrchestratorSprites.beginBuildBatch());
    frames: for (const { member, source, id, sample, hash, packet } of jobs) {
        for (const kind of ['blink', 'talk']) {
          const label = `${source.label}.${kind}`, row = packet.frames?.labels?.[label];
          const file = packet.files.find((file) => file.set === `anim-${set}` && file.label === label);
          const complete = row?.status === 'complete';
          if (complete && (!file || file.actualHash !== row.sha256 || row.inputs?.base !== hash)) throw new Error('Cached frame provenance changed.');
          if (complete && sample[kind]) {
            if (createHash('sha256').update(Buffer.from(sample[kind].split(',')[1], 'base64')).digest('hex') !== row.sha256) throw new Error('Cached frame differs from the saved review.');
            continue;
          }
          const cached = complete ? await page.evaluate(async ({ folder, set, label, sha256 }) => {
            const path = `/characters/${encodeURIComponent(folder)}/anim-${set}/${encodeURIComponent(label)}.png`;
            const responseImage = await fetch(path, { cache: 'no-store' });
            if (!responseImage.ok) throw new Error('Cached frame is unavailable.');
            const blob = await responseImage.blob();
            const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((n) => n.toString(16).padStart(2, '0')).join('');
            if (actual !== sha256) throw new Error('Cached frame bytes changed.');
            return new Promise<string>((done) => { const reader = new FileReader(); reader.onload = () => done(String(reader.result)); reader.readAsDataURL(blob); });
          }, { folder: member.folder, set, label, sha256: row.sha256 }) : null;
          if (cached) { if (sample[kind] && sample[kind] !== cached) throw new Error('Cached frame differs from the saved review.'); sample[kind] = cached; continue; }
          if (auditOnly) continue;
          if (generated >= limit) break frames;
          const began = Date.now();
          generated++;
          try {
            const result = await buildSpriteFromUI(page, { character: member.name, set, label: source.label, kind,
              reference: `${set}/${source.label}`, box: boxes[member.name], seed: Number.parseInt(createHash('sha256').update(`${id}:${kind}:v1`).digest('hex').slice(0, 8), 16),
              steps: 25, resolution: 1024 });
            const data = await page.locator('#so-sprite-builder img[alt$="preview"]').getAttribute('src');
            if (!data?.startsWith('data:image/png')) throw new Error('No composited frame.');
            await page.locator('#so-sprite-builder').getByRole('button', { name: 'Keep this sprite', exact: true }).click({ force: true });
            await page.waitForFunction(() => document.querySelector('#so-sprite-builder')?.textContent.includes('Saved to '), undefined, { polling: 250, timeout: 30000 });
            sample[kind] = data;
            report.rows.push({ id, kind, ok: true, warm, seconds: (Date.now() - began) / 1000, timings: result.timings });
            await writeFile(resolve(directory, `${member.name}-${source.label}-${kind}-raw.json`), JSON.stringify({ raw: result.raw, reference: result.referenceCrop, composite: data }));
          } catch (error) { report.failures.push({ id, kind, error: String(error) }); }
          await persist();
          console.log(JSON.stringify({ id, kind, ready: Boolean(sample[kind]), seconds: (Date.now() - began) / 1000 }));
        }
    }
    report.complete = selected.every((member) => member.sets.find((row) => row.id === 'default').labels.filter((row) => !first || row.label === 'neutral')
      .every((row) => { const sample = samples.find((s) => s.id === `${member.name}/${row.label}`); return Boolean(sample?.blink && sample?.talk); }));
  } finally {
    report.memory.push({ phase: 'end', node: process.memoryUsage(), browserHeap: await page.evaluate(() => (performance as any).memory?.usedJSHeapSize),
      ram: (await (await fetch(`${controller}/status`)).json()).telemetry.host.availableMiB });
    if (batch) { await batch.evaluate((close) => close()); await batch.dispose(); }
    page.off('request', count);
    run.generated = generated;
    report.runs ??= [];
    report.runs.push({ ...run, ended: new Date().toISOString(), after: await (await fetch(`${controller}/status`)).json() });
    await closeCheckpointStudio(page); await closeUnpinnedDrawers(page);
    await page.evaluate((settings) => { (globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator'].settings = settings;
      (globalThis as any).storyOrchestratorRuntime.touch(); }, saved);
    await saveSettingsNow(page);
    await persist();
  }
});
if (!report.complete && limit === Infinity && !auditOnly) process.exitCode = 1;
