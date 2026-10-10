import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { withST } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { openGroup, closeUnpinnedDrawers } from './st-navigation.mts';
import { openCheckpointStudio, closeCheckpointStudio } from './so-ui.mts';
import { buildSpriteFromUI } from './so-sprite-builder.mts';
import { snapshotSpriteAssets } from './lib/spriteAssets.mts';
import { builderBox, evidencePath } from './lib/imageHarness.mts';
import { parseBox, requireIsolatedLane, setSlug, slugName } from './lib/imageHarnessConfig.mts';

const args = process.argv.slice(2);
const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const character = flag('--character', '');
const folder = flag('--folder', character);
const group = flag('--group', '');
if (!args.includes('--check')) {
  requireIsolatedLane(process.env, 'so-neutral-rest');
  if (!character || !group) throw new Error('Use --character <card name> --group <id|name> (the harness pins no character or group).');
}
const set = flag('--set', `so_${setSlug(character || 'cast')}_neutral_rest_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
const directory = resolve(flag('--out', evidencePath('sprite-quality', `${slugName(character) || 'cast'}-neutral-rest`)));
const report: any = { at: new Date().toISOString(), character, folder, set, approved: false, candidates: [], cleanup: false };
await mkdir(directory, { recursive: true });

if (args.includes('--check')) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const built = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    await page.goto(pathToFileURL(resolve(directory, 'index.html')).href);
    await page.getByRole('heading', { name: `${built.character}: corrected neutral rest` }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('img').length === 4
      && [...document.querySelectorAll<HTMLImageElement>('img')].every((image) => image.complete && image.naturalWidth > 0));
    const sheet = await page.evaluate((box) => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 360;
      const context = canvas.getContext('2d'); context.fillStyle = '#263545'; context.fillRect(0, 0, 1280, 360);
      [...document.querySelectorAll<HTMLImageElement>('img')].forEach((image, index) => {
        context.fillStyle = 'white'; context.font = '20px system-ui'; context.fillText(image.alt, index * 320 + 8, 28);
        context.drawImage(image, box[0], box[1], box[2], box[3], index * 320, 40, 320, 320);
      });
      return canvas.toDataURL('image/png');
    }, built.box);
    await writeFile(resolve(directory, 'contact-sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    await page.locator('#full').check();
    const check = await page.evaluate(() => ({ images: document.querySelectorAll('img').length,
      fullFigure: getComputedStyle(document.querySelector('.zoom')).transform === 'none', overflow: document.documentElement.scrollWidth > innerWidth }));
    if (!check.fullFigure || check.overflow) throw new Error('Still-image preview layout failed.');
    await writeFile(resolve(directory, 'preview-check.json'), JSON.stringify({ ok: true, ...check }, null, 2));
  } finally { await browser.close(); }
} else await withST(async (page) => {
  await openGroup(page, group);
  const box = await builderBox(page, folder, parseBox(flag('--box', '')));
  report.box = box;
  const baseline = await snapshotSpriteAssets(page);
  if (!baseline.trusted || baseline.rows.some((row) => row.character === folder && row.set === set)) throw new Error('Use a fresh owned output set and a trusted inventory.');
  const before = await page.evaluate(async (folder) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const response = await fetch('/api/plugins/story-orchestrator-media/sprites/reference-pack', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ character: folder, set: '' }) });
    if (!response.ok) throw new Error('Original expression inventory unavailable.');
    const pack = await response.json();
    const neutral = pack.files.find((file) => file.label === 'neutral');
    if (!neutral) throw new Error('Original neutral reference missing.');
    const image = await fetch(neutral.path).then((r) => r.blob());
    const data = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(image); });
    return { originalHash: pack.sha256, original: data, settings: JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites)) };
  }, folder);
  report.originalHash = before.originalHash;
  try {
    await openCheckpointStudio(page);
    for (let at = 0; at < 3; at++) {
      const label = `candidate_${at + 1}`;
      const result = await buildSpriteFromUI(page, { character, set, label, kind: 'rest', reference: 'neutral',
        box, seed: 260601 + at, steps: 25, resolution: 1024 });
      const data = await page.locator('#so-sprite-builder img[alt$="preview"]').getAttribute('src');
      if (!data?.startsWith('data:image/png;base64,')) throw new Error('Corrected rest preview missing.');
      await page.locator('#so-sprite-builder').getByRole('button', { name: 'Keep this sprite', exact: true }).click({ force: true });
      await page.waitForFunction(() => document.getElementById('so-sprite-builder')?.textContent.includes('Saved to '), undefined, { polling: 200, timeout: 30000 });
      const inventory = await snapshotSpriteAssets(page);
      const saved = inventory.rows.find((row) => row.character === folder && row.set === set && row.label === label);
      if (!saved || saved.actualHash !== saved.sha256) throw new Error('Candidate did not land as hash-matching owned art.');
      report.candidates.push({ number: at + 1, label, data, raw: result.raw, referenceCrop: result.referenceCrop, timings: result.timings, saved });
      await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
      console.log(`Neutral rest candidate ${at + 1} saved in ${set}.`);
    }
    const escaped = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const panels = [{ title: 'Original reference', data: before.original }, ...report.candidates.map((candidate) => ({ title: `Candidate ${candidate.number}`, data: candidate.data }))];
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped(character)} neutral rest candidates</title>
      <style>body{background:#18212c;color:#eef2f6;font:16px system-ui;margin:0}main{max-width:1400px;margin:auto;padding:24px}.panels{display:grid;grid-template-columns:repeat(4,minmax(250px,1fr));gap:12px;overflow:auto}section{background:#263545;border-radius:12px;text-align:center}.picture{height:430px;position:relative;overflow:hidden}.zoom{position:absolute;inset:0;transform:scale(2.5);transform-origin:50% 12%}img{width:100%;height:100%;object-fit:contain}button{font:inherit;padding:8px;margin:8px}#full:checked~.panels .zoom{transform:none}@media(max-width:600px){main{padding:12px}}</style>
      <main><h1>${escaped(character)}: corrected neutral rest</h1><p>Still images only. Choose a clean, relaxed closed mouth while keeping the original face and pose. All candidates are in a separate owned set; original files are unchanged. None is approved or applied to the stage.</p>
      <p>Please tell me which candidate you prefer, or what still needs correcting. Speaking frames come only after your approval.</p>
      <input id="full" type="checkbox"><label for="full">Show full figure</label><div class="panels">${panels.map((panel) => `<section><h2>${escaped(panel.title)}</h2><div class="picture"><div class="zoom"><img alt="${escaped(panel.title)}" src="${panel.data}"></div></div></section>`).join('')}</div></main></html>`;
    await writeFile(resolve(directory, 'index.html'), html);
  } finally {
    await closeCheckpointStudio(page); await closeUnpinnedDrawers(page);
    await page.evaluate((settings) => { const ctx = (globalThis as any).SillyTavern.getContext(); (ctx.extensionSettings['story-orchestrator'].settings ??= {}).sprites = settings;
      (globalThis as any).storyOrchestratorRuntime.touch(); }, before.settings);
    await saveSettingsNow(page);
    const after = await page.evaluate(async (folder) => { const ctx = (globalThis as any).SillyTavern.getContext();
      return fetch('/api/plugins/story-orchestrator-media/sprites/reference-pack', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ character: folder, set: '' }) }).then((r) => r.json()); }, folder);
    const end = await snapshotSpriteAssets(page);
    if (after.sha256 !== before.originalHash || end.references.some((reference) => reference.set === set)) throw new Error('Original art changed or temporary references remained.');
    report.cleanup = true;
    await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });
console.log(`Still preview: ${resolve(directory, 'index.html')}`);
