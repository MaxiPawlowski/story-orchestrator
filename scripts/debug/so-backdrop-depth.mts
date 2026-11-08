import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEPTH_MODEL, depthGraph } from '../../src/image/depthGraph.ts';

const USAGE = `Usage: node scripts/debug/so-backdrop-depth.mts measure <image>... --out <dir> [--comfy http://127.0.0.1:8188] [--wait-ms 1800000]

v3.0 45 B floor probe. Sends each background to ComfyUI as the product's depth recipe (LoadImage -> Depth Anything V2
-> PreviewImage), one small job at a time and only while ComfyUI's queue is empty (waits otherwise, never interrupts),
and writes <out>/<name>.depth.png plus depth-measure.json (wall ms per image, submit to history). The input upload
reuses one name (so_depth_probe.<ext>, overwrite) so ComfyUI's input folder keeps a single probe file.`;

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(name);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function json(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${await response.text()}`);
  return response.json();
}

async function waitIdle(comfy: string, deadline: number): Promise<number> {
  const started = Date.now();
  for (;;) {
    const queue = await json(`${comfy}/queue`);
    if (!queue.queue_running?.length && !queue.queue_pending?.length) return Date.now() - started;
    if (Date.now() > deadline) throw new Error('ComfyUI stayed busy; no depth job was sent.');
    await sleep(5_000);
  }
}

async function measure(files: string[], out: string, comfy: string, waitMs: number) {
  await mkdir(out, { recursive: true });
  const rows: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const waited = await waitIdle(comfy, Date.now() + waitMs);
    const form = new FormData();
    const name = `so_depth_probe${extname(file).toLowerCase()}`;
    form.set('image', new Blob([await readFile(file)]), name);
    form.set('subfolder', 'story-orchestrator');
    form.set('overwrite', 'true');
    const uploaded = await json(`${comfy}/upload/image`, { method: 'POST', body: form });
    const graph = depthGraph(`story-orchestrator/${uploaded.name}`);
    const started = Date.now();
    const { prompt_id: id } = await json(`${comfy}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: randomUUID() }) });
    let item: any;
    while (!(item = (await json(`${comfy}/history/${id}`))[id])) await sleep(100);
    const ms = Date.now() - started;
    if (item.status?.status_str === 'error') throw new Error(`Depth failed for ${file}: ${JSON.stringify(item.status.messages).slice(0, 600)}`);
    const image = Object.values(item.outputs ?? {}).flatMap((output: any) => output.images ?? [])[0] as any;
    const view = await fetch(`${comfy}/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? '', type: image.type })}`);
    const target = join(out, `${basename(file, extname(file))}.depth.png`);
    await writeFile(target, new Uint8Array(await view.arrayBuffer()));
    rows.push({ file: basename(file), ms, waitedMs: waited, depth: target });
    console.log(`${basename(file)}: ${ms} ms`);
  }
  const report = { model: DEPTH_MODEL, measuredAt: new Date().toISOString(), rows, floorMs: 10_000, pass: rows.every((row) => (row.ms as number) <= 10_000) };
  await writeFile(join(out, 'depth-measure.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, ms: rows.map((row) => row.ms) }));
}

const [command, ...rest] = process.argv.slice(2);
if (command !== 'measure') { console.log(USAGE); process.exit(command ? 1 : 0); }
const files = rest.filter((value, index) => !value.startsWith('--') && !rest[index - 1]?.startsWith('--')).map((file) => resolve(file));
await measure(files, resolve(arg('--out', 'depth-out')), arg('--comfy', 'http://127.0.0.1:8188').replace(/\/$/, ''), Number(arg('--wait-ms', '1800000')));
