import fs from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/local/summarize.mjs <record directory>');
const rows = [];
for (const name of (await fs.readdir(directory)).filter((name) => name.endsWith('.json')).sort()) {
    const record = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    rows.push({ file: name, ok: record.ok, family: record.family ?? record.profile ?? 'lifecycle',
        cache: record.controllerAfter?.imageCacheMode ?? record.controllerAfter?.imageCache?.mode ?? '',
        seed: record.seed ?? null, renderMs: record.render?.elapsedMs ?? null, totalMs: record.totalCycleMs ?? null,
        loadMs: record.loadMs ?? record.textAfter?.status?.text?.loadMs ?? null,
        tokensPerSecond: record.short?.timings?.predicted_per_second ?? record.textAfter?.timings?.predicted_per_second ?? null,
        error: record.error ?? null, checks: record.checks?.map((check) => check.id) ?? [],
        cachedOutput: record.render?.elapsedMs < 1000 });
}
await fs.writeFile(path.join(directory, 'summary.md'), [
    '# Residency discovery records', '', 'Cached outputs do not count as a render/VRAM acceptance repetition.', '',
    '| Record | Result | Family | Cache | Load s | Render s | Cycle s | tok/s |', '|---|---|---|---|---:|---:|---:|---:|',
    ...rows.map((row) => `| ${row.file} | ${row.ok ? row.cachedOutput ? 'cached output' : 'pass' : 'refused/failed'} | ${row.family} | ${row.cache} | ${row.loadMs == null ? '' : (row.loadMs / 1000).toFixed(1)} | ${row.renderMs == null ? '' : (row.renderMs / 1000).toFixed(1)} | ${row.totalMs == null ? '' : (row.totalMs / 1000).toFixed(1)} | ${row.tokensPerSecond == null ? '' : row.tokensPerSecond.toFixed(2)} |`),
    '', ...rows.filter((row) => row.error).map((row) => `- ${row.file}: ${row.error}`), '',
].join('\n'));
console.log(JSON.stringify(rows, null, 2));
