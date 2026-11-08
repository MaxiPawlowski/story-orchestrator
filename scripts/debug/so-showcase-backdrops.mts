import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEPTH_MODEL, depthGraph } from '../../src/image/depthGraph.ts';

const USAGE = `Usage: node scripts/debug/so-showcase-backdrops.mts generate --out <dir> [--comfy http://127.0.0.1:8188] [--only <id>]
       node scripts/debug/so-showcase-backdrops.mts depth --out <dir> [--comfy http://127.0.0.1:8188] [--only <id>]

v3.0 45 showcase art (plan 46). generate renders the synthetic SFW backdrop set below on SDXL base 1.0 (one small job at a
time, only while ComfyUI's queue is empty) and writes <id>.raw.png plus <id>.json (prompt, seed, graph, checkpoint).
depth runs the product's depth recipe on each <id>.raw.png (or <id>.jpg) and writes <id>.depth.png. Compression to
JPEG is a separate step (the guide keeps the compressed copies, the raw PNGs are not committed).`;

export const SCENES = [
  { id: 'mountain-lake-dawn', tags: ['sky', 'water', 'outdoor'], seed: 4501,
    prompt: 'wide landscape painting of a calm alpine lake at dawn, snowy mountains, pine forest on the shore, clear pastel sky with soft clouds, mirror reflections on the water, no people, highly detailed digital painting, cinematic light' },
  { id: 'harbor-town-afternoon', tags: ['sky', 'water', 'outdoor'], seed: 4502,
    prompt: 'wide view of a small fishing harbor town in the afternoon, colorful houses on a hillside, wooden boats moored on gentle sea water, blue sky with white clouds, no people, detailed digital painting, warm sunlight' },
  { id: 'library-fireplace-night', tags: ['indoor'], seed: 4503,
    prompt: 'interior of a cozy old library at night, tall wooden bookshelves, a stone fireplace with a warm fire, leather armchairs, rug, candles, no people, detailed digital painting, warm lighting, depth' },
  { id: 'forest-path-mist', tags: ['sky', 'outdoor'], seed: 4504,
    prompt: 'misty forest path in the early morning, tall old trees, ferns, soft fog between the trunks, light rays, pale sky through the canopy, no people, detailed digital painting, atmospheric' },
];

export const CHECKPOINT = 'sd_xl_base_1.0.safetensors';
export const NEGATIVE = 'people, person, text, watermark, signature, logo, blurry, lowres, deformed, nsfw';
export const SIZE = { width: 1344, height: 768 };
export const SAMPLER = { steps: 30, cfg: 6.5, sampler_name: 'dpmpp_2m', scheduler: 'karras' };

export const sceneGraph = (scene: typeof SCENES[number]) => ({
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
  2: { class_type: 'CLIPTextEncode', inputs: { text: scene.prompt, clip: ['1', 1] } },
  3: { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: ['1', 1] } },
  4: { class_type: 'EmptyLatentImage', inputs: { ...SIZE, batch_size: 1 } },
  5: { class_type: 'KSampler', inputs: { seed: scene.seed, ...SAMPLER, denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
  6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  7: { class_type: 'PreviewImage', inputs: { images: ['6', 0] } },
});

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

async function run(comfy: string, graph: Record<string, unknown>): Promise<{ bytes: Uint8Array; ms: number }> {
  for (;;) {
    const queue = await json(`${comfy}/queue`);
    if (!queue.queue_running?.length && !queue.queue_pending?.length) break;
    await sleep(5_000);
  }
  const started = Date.now();
  const { prompt_id: id } = await json(`${comfy}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: randomUUID() }) });
  let item: any;
  while (!(item = (await json(`${comfy}/history/${id}`))[id])) await sleep(250);
  if (item.status?.status_str === 'error') throw new Error(JSON.stringify(item.status.messages).slice(0, 600));
  const image = Object.values(item.outputs ?? {}).flatMap((output: any) => output.images ?? [])[0] as any;
  const view = await fetch(`${comfy}/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? '', type: image.type })}`);
  return { bytes: new Uint8Array(await view.arrayBuffer()), ms: Date.now() - started };
}

async function upload(comfy: string, bytes: Uint8Array, name: string): Promise<string> {
  const form = new FormData();
  form.set('image', new Blob([bytes]), name);
  form.set('subfolder', 'story-orchestrator');
  form.set('overwrite', 'true');
  return `story-orchestrator/${(await json(`${comfy}/upload/image`, { method: 'POST', body: form })).name}`;
}

const [command] = process.argv.slice(2);
const out = resolve(arg('--out', 'docs/guide/assets/showcase/backdrops'));
const comfy = arg('--comfy', 'http://127.0.0.1:8188').replace(/\/$/, '');
const scenes = SCENES.filter((scene) => !process.argv.includes('--only') || scene.id === arg('--only', ''));
if (command === 'generate') {
  await mkdir(out, { recursive: true });
  for (const scene of scenes) {
    const graph = sceneGraph(scene);
    const { bytes, ms } = await run(comfy, graph);
    await writeFile(join(out, `${scene.id}.raw.png`), bytes);
    await writeFile(join(out, `${scene.id}.json`), JSON.stringify({ id: scene.id, tags: scene.tags, checkpoint: CHECKPOINT, licence: 'CreativeML Open RAIL++-M',
      prompt: scene.prompt, negative: NEGATIVE, seed: scene.seed, size: SIZE, sampler: SAMPLER, renderMs: ms, generatedAt: new Date().toISOString(),
      generator: 'scripts/debug/so-showcase-backdrops.mts generate', graph }, null, 2) + '\n');
    console.log(`${scene.id}: ${ms} ms`);
  }
} else if (command === 'depth') {
  for (const scene of scenes) {
    const source = await readFile(join(out, `${scene.id}.jpg`)).catch(() => readFile(join(out, `${scene.id}.raw.png`)));
    const reference = await upload(comfy, source, 'so_showcase_depth.png');
    const { bytes, ms } = await run(comfy, depthGraph(reference));
    await writeFile(join(out, `${scene.id}.depth.png`), bytes);
    const sidecar = join(out, `${scene.id}.json`);
    const info = JSON.parse(await readFile(sidecar, 'utf8'));
    await writeFile(sidecar, JSON.stringify({ ...info, depth: { model: DEPTH_MODEL, file: `${scene.id}.depth.png`, renderMs: ms, generator: 'scripts/debug/so-showcase-backdrops.mts depth' } }, null, 2) + '\n');
    console.log(`${scene.id} depth: ${ms} ms`);
  }
} else { console.log(USAGE); process.exit(command ? 1 : 0); }
