import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve('test/measurements/v2.7/flux-memory');
await fs.mkdir(path.join(root, 'images'), { recursive: true });
const rows = [];
for (const name of (await fs.readdir(root)).filter((name) => /^(render|st-local-transport).*\.json$/.test(name)).sort()) {
    const record = JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
    const measurement = record.measurement ?? record.controllerAfter?.measurement;
    let image;
    if (record.render?.image) {
        const source = path.resolve(record.render.image);
        const owned = path.resolve('C:/dev/so-lanes/0/debug/local-residency');
        if (!source.startsWith(`${owned}${path.sep}`)) throw new Error('An image is not under the owned residency directory.');
        image = `images/${name.replace('.json', '.png')}`;
        await fs.copyFile(source, path.join(root, image));
    }
    rows.push({ file: name, ok: record.ok, arm: record.arm ?? 'stock', torch: measurement?.identity?.runtime?.torch,
        cache: measurement?.identity?.cacheState, renderMs: record.render?.elapsedMs, releaseMs: record.releaseMs,
        replyMs: record.textAfter?.elapsedMs, totalMs: record.totalCycleMs, lowRamMiB: measurement?.lowRamMiB,
        lowGpuMiB: measurement?.lowGpuMiB, image, error: record.error });
}
await fs.writeFile(path.join(root, 'summary.json'), JSON.stringify(rows, null, 2));
await fs.writeFile(path.join(root, 'summary.md'), ['# FLUX discovery', '',
    '| Record | Result | Arm / torch | Cache condition | Render / release / reply s | Total s | Min RAM / GPU MiB |',
    '|---|---|---|---|---|---:|---|', ...rows.map((row) => `| ${row.file} | ${row.ok ? 'pass' : 'failed'} | ${row.arm} / ${row.torch ?? ''} | ${row.cache ?? ''} | ${[row.renderMs, row.releaseMs, row.replyMs].map((value) => value == null ? '' : (value / 1000).toFixed(1)).join(' / ')} | ${row.totalMs == null ? '' : (row.totalMs / 1000).toFixed(1)} | ${Math.round(row.lowRamMiB ?? 0)} / ${Math.round(row.lowGpuMiB ?? 0)} |`), '',
    'Failures remain in the denominator; named fixes start new series. No comparison is a human quality acceptance.', '',].join('\n'));
for (const [label, python] of [['stock', 'C:/dev/tools/story-orchestrator-local/comfy-cu130/Scripts/python.exe'],
    ['nunchaku', 'C:/dev/tools/story-orchestrator-local/comfy-nunchaku/Scripts/python.exe']]) {
    const { stdout } = await exec(python, ['-m', 'pip', 'freeze'], { timeout: 30000 });
    await fs.writeFile(path.join(root, `${label}-environment.txt`), stdout);
}
await fs.copyFile('D:/models/story-orchestrator-flux-spikes/components/provenance.json', path.join(root, 'component-provenance.json'));
const repositories = {};
for (const name of ['nunchaku', 'ComfyUI-nunchaku', 'ComfyUI-GGUF']) {
    const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: `C:/dev/st-extensions-research/${name}`, timeout: 10000 });
    repositories[name] = stdout.trim();
}
await fs.writeFile(path.join(root, 'repository-pins.json'), JSON.stringify(repositories, null, 2));
console.log(JSON.stringify(rows, null, 2));
