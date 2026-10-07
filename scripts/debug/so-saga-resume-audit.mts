import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withST } from './lib/cli.mts';

if (!Number.isInteger(Number(process.env.SO_LANE)) || Number(process.env.SO_LANE) < 1) throw new Error('Use an isolated lane: st-lanes.mts run <n> -- ... with n >= 1.');
const out = resolve('test/sessions/evidence/measurements-v2.7/saga-main-cast');
const inventory = JSON.parse(await readFile(resolve(out, 'inventory.json'), 'utf8'));
const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
const set = 'so_saga_main_v1';
const boxes = { Belle: [221, 11, 320, 320], Dalan: [340, 0, 320, 280], Tobias: [340, 0, 320, 280],
  Natalia: [240, 35, 320, 280], Shiya: [220, 70, 320, 280], Ronan: [240, 10, 320, 320],
  Javon: [240, 0, 320, 260], Eriana: [240, 85, 320, 300] };
const report: any = { at: new Date().toISOString(), generatedJobs: 0, recoveredPreview: null, verified: [], missing: [], problems: [] };
await withST(async (page) => {
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/plugins/story-orchestrator-media/jobs')) report.generatedJobs++; });
  if (process.argv.includes('--recover-preview')) {
    const root = page.locator('#so-sprite-builder');
    const keep = root.getByRole('button', { name: 'Keep this sprite', exact: true });
    if (await keep.count()) {
      const name = await root.getByLabel('Character', { exact: true }).inputValue();
      const label = await root.getByLabel('Expression label', { exact: true }).inputValue();
      const kind = await root.getByLabel('Edit', { exact: true }).inputValue();
      const id = `${name}/${label}`;
      const seed = Number.parseInt(createHash('sha256').update(`${id}:${kind}:v1`).digest('hex').slice(0, 8), 16);
      const box = await Promise.all(['x', 'y', 'width', 'height'].map((field) => root.getByLabel(field, { exact: true }).inputValue().then(Number)));
      if (!inventory.some((row) => row.name === name) || !['blink', 'talk'].includes(kind)
        || await root.getByLabel('Output set', { exact: true }).inputValue() !== set
        || Number(await root.getByLabel('Seed', { exact: true }).inputValue()) !== seed
        || Number(await root.getByLabel('Steps', { exact: true }).inputValue()) !== 25
        || await root.getByLabel('Edit resolution', { exact: true }).inputValue() !== '1024'
        || JSON.stringify(box) !== JSON.stringify(boxes[name])) throw new Error('The retained preview is not this batch request.');
      const data = await root.locator('img[alt$="preview"]').getAttribute('src');
      if (!data?.startsWith('data:image/png')) throw new Error('The retained frame has no image.');
      await keep.click({ force: true });
      await page.waitForFunction(() => document.querySelector('#so-sprite-builder')?.textContent.includes('Saved to '), undefined, { polling: 250, timeout: 30000 });
      report.recoveredPreview = { id, kind, regenerated: false };
    }
  }
  const result = await page.evaluate(async ({ inventory, set, boxes }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const verified: any[] = [], missing: any[] = [], problems: any[] = [];
    const post = async (character, set) => {
      const response = await fetch('/api/plugins/story-orchestrator-media/sprites/read', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ character, set }) });
      if (!response.ok) throw new Error('Manifest inventory unavailable.');
      return response.json();
    };
    for (const member of inventory) {
      const base = await post(member.folder, set), frames = await post(member.folder, `anim-${set}`);
      for (const source of member.sets.find((row) => row.id === 'default').labels) for (const kind of ['blink', 'talk']) {
        const id = `${member.name}/${source.label}`, label = `${source.label}.${kind}`, row = frames?.labels?.[label];
        if (row?.status !== 'complete') { missing.push({ id, kind }); continue; }
        if (row.inputs?.base !== base?.labels?.[source.label]?.sha256 || row.inputs?.steps !== 25
          || row.inputs?.resolution !== 1024 || JSON.stringify(Object.values(row.inputs?.box ?? {})) !== JSON.stringify(boxes[member.name])) {
          problems.push({ id, kind, reason: 'input provenance mismatch' }); continue;
        }
        const path = `/characters/${encodeURIComponent(member.folder)}/anim-${set}/${label}.png`;
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) { problems.push({ id, kind, reason: 'missing image' }); continue; }
        const blob = await response.blob();
        const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((n) => n.toString(16).padStart(2, '0')).join('');
        if (actual !== row.sha256) { problems.push({ id, kind, reason: 'file hash mismatch' }); continue; }
        const data = await new Promise<string>((done) => { const reader = new FileReader(); reader.onload = () => done(String(reader.result)); reader.readAsDataURL(blob); });
        verified.push({ id, kind, hash: actual, data });
      }
    }
    return { verified, missing, problems };
  }, { inventory, set, boxes });
  for (const { data, ...row } of result.verified) {
    const sample = samples.find((sample) => sample.id === row.id);
    if (!sample) throw new Error('A verified frame lacks its original review sample.');
    if (sample[row.kind] && sample[row.kind] !== data) throw new Error('The saved review and frame bytes disagree.');
    sample[row.kind] = data;
    report.verified.push(row);
  }
  report.missing = result.missing; report.problems = result.problems;
});
report.ok = !report.generatedJobs && !report.problems.length;
await writeFile(resolve(out, 'samples.json'), JSON.stringify(samples));
await writeFile(resolve(out, 'resume-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, generatedJobs: report.generatedJobs, recoveredPreview: report.recoveredPreview,
  verified: report.verified.length, missing: report.missing.length, problems: report.problems }));
if (!report.ok) process.exitCode = 1;
