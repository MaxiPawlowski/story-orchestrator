import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve('test/sessions/evidence/measurements-v2.7/saga-main-cast');
const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
const regions = { Ronan: { x: 102, y: 140, width: 115, height: 64, feather: 3 },
  Javon: { x: 102, y: 115, width: 115, height: 52, feather: 3 },
  Tobias: { x: 102, y: 126, width: 115, height: 56, feather: 3 },
  Dalan: { x: 102, y: 126, width: 115, height: 56, feather: 3 } };
const require = createRequire(import.meta.url);
const built = await require('esbuild').build({ entryPoints: ['scripts/debug/lib/recomposeSagaMouth.ts'], bundle: true,
  platform: 'browser', format: 'iife', target: 'es2022', tsconfig: 'tsconfig.json', write: false });
const report: any = { at: new Date().toISOString(), generatedJobs: 0, rows: [], complete: false };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/story-orchestrator-media/jobs')) report.generatedJobs++; });
  await page.goto('http://127.0.0.1:8106/scripts/extensions/third-party/story-orchestrator/manifest.json');
  await page.addScriptTag({ content: built.outputFiles[0].text });
  for (const sample of samples.filter((row) => regions[row.name])) {
    const artifact = JSON.parse(await readFile(resolve(out, `${sample.name}-${sample.label}-talk-raw.json`), 'utf8'));
    const record = await page.evaluate(async ({ sample }) => {
      const csrf = await (await fetch('/csrf-token')).json();
      const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token };
      const response = await fetch('/api/plugins/story-orchestrator-media/sprites/read', { method: 'POST', headers,
        body: JSON.stringify({ character: sample.name, set: 'anim-so_saga_main_v1' }) });
      const manifest = await response.json();
      const row = manifest?.labels?.[`${sample.label}.talk`];
      if (!response.ok || !row || row.status !== 'complete') throw new Error('Owned speaking frame is unavailable.');
      const saved = await (await fetch(`/characters/${sample.name}/anim-so_saga_main_v1/${sample.label}.talk.png`, { cache: 'no-store' })).arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', saved))].map((n) => n.toString(16).padStart(2, '0')).join('');
      if (hash !== row.sha256) throw new Error('The speaking frame changed outside this batch.');
      return row;
    }, { sample });
    const frame = await page.evaluate(async (input) => await (globalThis as any).recomposeSagaMouth(input),
      { base: sample.base, raw: artifact.raw, row: record, region: regions[sample.name] });
    const saved = await page.evaluate(async ({ sample, record, frame }) => {
      const csrf = await (await fetch('/csrf-token')).json();
      const response = await fetch('/api/plugins/story-orchestrator-media/sprites/save', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
        body: JSON.stringify({ character: sample.name, set: 'anim-so_saga_main_v1', label: `${sample.label}.talk`,
          ...frame, recipe: record.recipe, expectedHash: record.sha256 }) });
      const answer = await response.json(); if (!response.ok) throw new Error(answer.error ?? 'Recomposition save refused.');
      return { path: answer.path, sha256: answer.sha256 };
    }, { sample, record, frame });
    report.rows.push({ id: sample.id, previous: record.sha256, saved, region: regions[sample.name], qa: frame.qa });
    sample.talk = `data:image/png;base64,${frame.data}`;
    await writeFile(resolve(out, 'samples.json'), JSON.stringify(samples));
    await writeFile(resolve(out, 'mouth-recomposition.json'), JSON.stringify(report, null, 2));
  }
  report.complete = report.rows.length === 58 && report.generatedJobs === 0;
} finally {
  await browser.close();
  await writeFile(resolve(out, 'mouth-recomposition.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ complete: report.complete, frames: report.rows.length, generatedJobs: report.generatedJobs }));
if (!report.complete) process.exitCode = 1;
