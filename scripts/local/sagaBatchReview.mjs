import { readFile, readdir, writeFile } from 'node:fs/promises';
const out = 'C:/dev/story-orchestrator/test/measurements/v2.7/saga-main-cast';
const batchStart = Date.parse('2026-10-06T19:20:00Z');
const state = 'C:/dev/so-lanes/0/debug/local-residency';
const native = (await readdir(state)).filter((name) => /^native-\d+-/.test(name))
  .map((name) => ({ file: name, at: new Date(Number(name.split('-')[1])).toISOString() }));
const records = JSON.parse(await readFile(`${out}/frames-all-all.json`, 'utf8')).rows.filter((row) => row.ok && row.timings && !row.warm);
const median = (values) => { const list = [...values].sort((a, b) => a-b); return list[Math.floor(list.length / 2)] ?? null; };
const log = (await readFile(`${state}/comfy-1791286323173.log`, 'utf8')).replace(/\u001b\[[0-9;]*m/g, '');
const chunks = log.split('got prompt').slice(-20);
const report = { at: new Date().toISOString(), recordedFrames: records.length, nativeTextStartsDuringBatch: native.filter((row) => Date.parse(row.at) >= batchStart),
  latestNativeTextStart: native.sort((a, b) => a.at.localeCompare(b.at)).at(-1),
  timingMedianMs: Object.fromEntries(['leaseMs', 'renderMs', 'leaseReleaseMs', 'totalMs'].map((key) => [key, median(records.map((row) => row.timings[key]))])),
  recentComfyRenders: chunks.filter((chunk) => chunk.includes('Prompt executed')).length,
  recentImageLoaderRequests: chunks.reduce((n, chunk) => n + (chunk.match(/Requested to load (QwenImage21TEModel_|QwenImage21|WanVAE)/g)?.length ?? 0), 0),
  recentModelInitializationPhases: chunks.filter((chunk) => chunk.includes('Model Initialization complete')).length,
  recentRamPressureCacheNotices: chunks.reduce((n, chunk) => n + (chunk.match(/Using RAM pressure cache/g)?.length ?? 0), 0),
  findings: ['SpriteBuilder leases and releases for each GPU image.', 'ResidencyScheduler.releaseOwned calls ImageCache.free each time.',
    'ImageCache.free sends unload_models=true; warm mode keeps eligible RAM cache, not GPU residency.',
    'Comfy RAM-pressure cache also reconstructs model objects in some consecutive renders.'],
};
await writeFile(`${out}/model-residency-review.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
