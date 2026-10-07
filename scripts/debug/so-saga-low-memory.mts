import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

if (Number(process.env.SO_LANE) !== 6) throw new Error('Use isolated lane 6.');
const out = resolve('test/measurements/v2.7/saga-main-cast');
const audit = JSON.parse(await readFile(resolve(out, 'resume-audit.json'), 'utf8'));
if (!audit.ok || audit.problems.length) throw new Error('A clean resume audit is required.');
const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
const inventory = JSON.parse(await readFile(resolve(out, 'inventory.json'), 'utf8'));
const boxes = { Belle: [221, 11, 320, 320], Dalan: [340, 0, 320, 280], Tobias: [340, 0, 320, 280],
  Natalia: [240, 35, 320, 280], Shiya: [220, 70, 320, 280], Ronan: [240, 10, 320, 320],
  Javon: [240, 0, 320, 260], Eriana: [240, 85, 320, 300] };
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = await esbuild.build({ entryPoints: ['scripts/debug/lib/lowMemorySpriteBuilder.ts'], bundle: true,
  platform: 'browser', format: 'iife', target: 'es2022', tsconfig: 'tsconfig.json', write: false });
const report: any = { at: new Date().toISOString(), adapter: 'minimal page; shipped SpriteBuilder, Canvas and QA', rows: [], complete: false };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8106/scripts/extensions/third-party/story-orchestrator/manifest.json');
  await page.addScriptTag({ content: built.outputFiles[0].text });
  const session = await page.evaluateHandle(async () => await (globalThis as any).lowMemorySpriteBuilder.start());
  try {
    for (const { id, kind } of audit.missing) {
      const sample = samples.find((sample) => sample.id === id);
      if (!sample || sample[kind]) throw new Error('The audit is stale; do not duplicate a saved frame.');
      const member = inventory.find((row) => row.name === sample.name);
      const sha256 = createHash('sha256').update(Buffer.from(sample.base.split(',')[1], 'base64')).digest('hex');
      const [x, y, width, height] = boxes[sample.name];
      const input = { character: member.folder, set: 'so_saga_main_v1', label: sample.label, kind, value: sample.label,
        reference: `/characters/${encodeURIComponent(member.folder)}/so_saga_main_v1/${sample.label}.png`, referenceHash: sha256,
        box: { x, y, width, height }, seed: Number.parseInt(createHash('sha256').update(`${id}:${kind}:v1`).digest('hex').slice(0, 8), 16),
        steps: 25, resolution: 1024, story: 'adolion-saga', member: sample.name };
      const result = await session.evaluate((session, input) => session.build(input), input);
      sample[kind] = `data:image/png;base64,${result.data}`;
      report.rows.push({ id, kind, saved: result.saved, timings: result.timings, qa: result.qa });
      await writeFile(resolve(out, `${sample.name}-${sample.label}-${kind}-raw.json`), JSON.stringify({ raw: result.raw, reference: result.reference, composite: sample[kind] }));
      await writeFile(resolve(out, 'samples.json'), JSON.stringify(samples));
      await writeFile(resolve(out, 'low-memory-build.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ id, kind, saved: true, timings: result.timings }));
    }
    report.complete = true;
  } finally {
    await session.evaluate((session) => session.close()); await session.dispose();
    await writeFile(resolve(out, 'low-memory-build.json'), JSON.stringify(report, null, 2));
  }
} finally { await browser.close(); }
