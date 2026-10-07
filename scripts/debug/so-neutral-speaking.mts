import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withST } from './lib/cli.mts';
import { openGroup, closeUnpinnedDrawers } from './st-navigation.mts';
import { openCheckpointStudio, closeCheckpointStudio } from './so-ui.mts';
import { buildSpriteFromUI } from './so-sprite-builder.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { snapshotSpriteAssets } from './lib/spriteAssets.mts';
import { builderBox, evidencePath } from './lib/imageHarness.mts';
import { parseBox, requireIsolatedLane, setSlug, slugName } from './lib/imageHarnessConfig.mts';

requireIsolatedLane(process.env, 'so-neutral-speaking');
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] ?? fallback : fallback);
const character = flag('--character', '');
const folder = flag('--folder', character);
const group = flag('--group', '');
const previousDir = flag('--previous', '');
if (!character || !group || !previousDir) throw new Error('Use --character <card name> --group <id|name> --previous <frame-pack dir with raw.json + samples.json> [--candidate n] [--rest-report file] [--box x,y,w,h].');
const selected = JSON.parse(await readFile(resolve(flag('--rest-report', evidencePath('sprite-quality', `${slugName(character)}-neutral-rest`, 'report.json'))), 'utf8'));
if (selected.character && selected.character !== character) throw new Error(`The rest report is for ${selected.character}, not ${character}.`);
const chosen = Number(flag('--candidate', '3'));
const choice = selected.candidates.find((candidate) => candidate.number === chosen);
if (!choice) throw new Error('The selected candidate is unavailable.');
const out = resolve(flag('--out', evidencePath('sprite-quality', `${slugName(character)}-neutral-c${chosen}-speaking`)));
const set = flag('--set', `so_${setSlug(character)}_neutral_c${chosen}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
await mkdir(out, { recursive: true });
const report: any = { character, folder, seed: Number(flag('--seed', '260630')), resolution: 1024, steps: 25, selectedRest: chosen, set, complete: false, cleanup: false, rows: [] };

await withST(async (page) => {
  await openGroup(page, group);
  const box = await builderBox(page, folder, parseBox(flag('--box', '')));
  report.box = box;
  const before = await snapshotSpriteAssets(page);
  if (!before.trusted || before.rows.some((row) => row.character === folder && [set, `anim-${set}`].includes(row.set))) throw new Error('Use a fresh owned set.');
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites)));
  try {
    report.neutral = await page.evaluate(async ({ selected, choice, set, folder }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const post = async (route, body) => { const response = await fetch(`/api/plugins/story-orchestrator-media/${route}`, {
        method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Media operation failed.'); return data; };
      const source = await post('sprites/read', { character: folder, set: selected.set });
      const row = source?.labels?.[choice.label];
      if (!row || row.sha256 !== choice.saved.sha256 || row.status !== 'complete') throw new Error('The chosen candidate provenance changed.');
      const inventory = await post('sprites/reference-pack', { character: folder, set: selected.set });
      if (inventory.files.find((file) => file.label === choice.label)?.sha256 !== row.sha256) throw new Error('The chosen candidate bytes changed.');
      const answer = await post('sprites/save', { character: folder, set, label: 'neutral', data: choice.data.split(',')[1],
        key: row.key, recipe: row.recipe, qa: row.qa, inputs: row.inputs });
      if (answer.sha256 !== row.sha256) throw new Error('The canonical rest copy differs from the chosen candidate.');
      return { path: answer.path, sha256: answer.sha256 };
    }, { selected, choice, set, folder });
    await openCheckpointStudio(page);
    const result = await buildSpriteFromUI(page, { character, set, label: 'neutral', kind: 'talk',
      reference: `${set}/neutral`, box, seed: report.seed, steps: 25, resolution: 1024 });
    const talk = await page.locator('#so-sprite-builder img[alt$="preview"]').getAttribute('src');
    if (!talk?.startsWith('data:image/png;base64,')) throw new Error('Speaking preview missing.');
    await page.locator('#so-sprite-builder').getByRole('button', { name: 'Keep this sprite', exact: true }).click({ force: true });
    await page.waitForFunction(() => document.getElementById('so-sprite-builder')?.textContent.includes('Saved to '), undefined, { polling: 200, timeout: 30000 });
    const inventory = await snapshotSpriteAssets(page);
    report.frame = inventory.rows.find((row) => row.character === folder && row.set === `anim-${set}` && row.label === 'neutral.talk');
    if (!report.frame || report.frame.sha256 !== report.frame.actualHash) throw new Error('The speaking frame did not land as owned art.');
    report.rows.push({ label: 'neutral', kind: 'talk', ok: true, timings: result.timings });
    const previousRaw = JSON.parse(await readFile(resolve(previousDir, 'raw.json'), 'utf8'));
    await writeFile(resolve(out, 'raw.json'), JSON.stringify([...previousRaw.filter((entry) => entry.label !== 'neutral' || entry.kind !== 'talk'),
      { label: 'neutral', kind: 'talk', image: result.raw, reference: result.referenceCrop, composite: talk }], null, 2));
    const previous = JSON.parse(await readFile(resolve(previousDir, 'samples.json'), 'utf8'));
    const samples = previous.map((sample) => sample.label === 'neutral' ? { ...sample, base: choice.data, talk,
      previous: sample.previous ?? sample } : sample);
    await writeFile(resolve(out, 'samples.json'), JSON.stringify(samples));
    report.complete = true;
  } finally {
    await closeCheckpointStudio(page); await closeUnpinnedDrawers(page);
    await page.evaluate((sprites) => { const ctx = (globalThis as any).SillyTavern.getContext(); ctx.extensionSettings['story-orchestrator'].settings.sprites = sprites;
      (globalThis as any).storyOrchestratorRuntime.touch(); }, saved);
    await saveSettingsNow(page);
    const end = await snapshotSpriteAssets(page);
    report.cleanup = !end.references.some((reference) => reference.set === set);
    await writeFile(resolve(out, 'build.json'), JSON.stringify(report, null, 2));
    if (!report.cleanup) throw new Error('Temporary speaking references remained.');
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });
console.log({ out, complete: report.complete, cleanup: report.cleanup });
