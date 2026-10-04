import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { renderSignature } from './policy.mjs';
import { memorySnapshot, gpuMemory } from './telemetry.mjs';
import { bytesToMiB, estimateGpuMiB } from './estimate.mjs';
import { readSafetensorsBytes } from './safetensors.mjs';

const configFile = process.argv[2];
const mode = process.argv[3] ?? 'solo';
const familyName = process.argv[4] ?? 'scene';
if (!configFile || !['solo', 'swap', 'shed', 'auto'].includes(mode)) throw new Error('Usage: node scripts/local/render-benchmark.mjs <config.json> solo|swap|shed|auto [scene|background|portrait|hires|lora|edit|sprite] [replyTokens]');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const replyTokens = Number(process.argv[5] ?? 128);
const seed = Date.now() % 4294967296;
if (!Number.isInteger(replyTokens) || replyTokens < 8 || replyTokens > 2048) throw new Error('Benchmark reply budget must be 8..2048 tokens.');
const home = fileURLToPath(new URL('../../', import.meta.url));
const moduleFrom = async (file) => {
    const { code } = await transform(await fs.readFile(path.join(home, file), 'utf8'), { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const { buildGraph } = await moduleFrom('src/image/graph.ts');
const { CHECKPOINTS, FAMILIES, WAI, FLUX, JANKU } = await moduleFrom('src/image/catalog.ts');
const checkpoint = CHECKPOINTS.find((row) => row.file === (familyName === 'background' ? FLUX : familyName === 'portrait' ? JANKU : WAI));
const family = FAMILIES[checkpoint.family];
const size = family.sizes.wide;
const loras = familyName === 'lora' ? [{ file: config.benchmarkLora, weight: 0.6 }] : [];
if (familyName === 'lora' && !config.benchmarkLora) throw new Error('Choose an installed SDXL benchmarkLora in the config before measuring LoRA.');
let graph = buildGraph({ checkpoint, family, loras, positive: 'an empty old stone hall, fireplace, warm light, detailed architecture, no people', negative: 'text, watermark, low quality',
    size, seed, hires: familyName === 'hires', upscaler: family.upscaler });
const checkpointPath = `${config.checkpointDir ?? 'C:/dev/models/checkpoints'}/${checkpoint.file}`;
let modelFiles = [{ kind: 'checkpoints', name: checkpoint.file }, ...loras.map((lora) => ({ kind: 'loras', name: lora.file }))];
if (familyName === 'hires') modelFiles.push({ kind: 'upscale_models', name: family.upscaler });
if (['edit', 'sprite'].includes(familyName)) {
    if (!config.benchmarkEdit?.reference) throw new Error('Set benchmarkEdit models and a ComfyUI reference image before measuring edit/sprite.');
    const { editGraph, editInstruction } = await moduleFrom('src/sprites/builder/recipes.ts');
    const edit = config.benchmarkEdit;
    graph = editGraph({ models: { diffusion: { name: edit.diffusion }, encoder: { name: edit.encoder }, vae: { name: edit.vae } },
        reference: edit.reference, steps: 8, seed, instruction: editInstruction(familyName === 'sprite' ? 'expression' : 'look', familyName === 'sprite' ? 'happy' : 'a blue scarf') });
    modelFiles = [{ kind: 'diffusionModels', name: edit.diffusion }, { kind: 'textEncoders', name: edit.encoder }, { kind: 'vaes', name: edit.vae }];
}
const { estimateNeedMiB } = await import('./models.mjs');
const estimatedMiB = config.modelDirs ? await estimateNeedMiB({ modelDirs: config.modelDirs, files: modelFiles, ...size, hires: familyName === 'hires' })
    : estimateGpuMiB({ weightsMiB: bytesToMiB((await readSafetensorsBytes(checkpointPath)).bytes), ...size, hires: familyName === 'hires' });
const url = `http://127.0.0.1:${config.gatewayPort}`;
const post = async (base, route, body) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data;
};
const text = async () => {
    const began = Date.now();
    const data = await post(url, '/completion', { prompt: '<|turn>user\nDescribe a stone hall with a fireplace and its furniture in detail.<turn|>\n<|turn>model\n<|channel>final\n', n_predict: replyTokens, temperature: 0.6, top_k: 0, top_p: 1, min_p: 0.05, seed: 17, cache_prompt: true });
    if (!data.content?.trim()) throw new Error('Text benchmark answered without a visible reply.');
    return { elapsedMs: Date.now() - began, length: data.content?.length, timings: data.timings, status: await (await fetch(`${url}/status`)).json() };
};
const result = { mode, family: familyName, modelFiles, seed, replyTokens, checkpoint: checkpoint.file, estimatedMiB, before: await memorySnapshot() };
const samples = [];
let lease;
let ownedPrompt;
let timer;
try {
    if (mode === 'solo') await post(url, '/control/unload', {});
    else {
        await post(url, '/control/automatic', {});
        result.textBefore = await text();
    }
    const cycleBegan = Date.now();
    const needGpuMiB = estimatedMiB;
    result.needGpuMiB = needGpuMiB;
    const leaseBegan = Date.now();
    lease = await post(url, '/lease', { workflowKey: renderSignature(graph), needGpuMiB, nextTextTokens: replyTokens, benchmarkMode: mode, modelFiles, ...size, hires: familyName === 'hires' });
    result.admissionMs = Date.now() - leaseBegan;
    result.lease = lease;
    result.admitted = await memorySnapshot();
    const began = Date.now();
    timer = setInterval(() => { void gpuMemory().then((gpus) => samples.push({ at: Date.now(), gpus })).catch(() => {}); }, 1000);
    const queued = await post(config.comfyUrl, '/prompt', { prompt: graph, client_id: `so-residency-${process.pid}` });
    ownedPrompt = queued.prompt_id;
    if (!ownedPrompt) throw new Error(JSON.stringify(queued));
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
        const history = await (await fetch(`${config.comfyUrl}/history/${ownedPrompt}`, { signal: AbortSignal.timeout(10000) })).json();
        const entry = history[ownedPrompt];
        if (entry?.status?.completed) {
            if (entry.status.status_str !== 'success') throw new Error(JSON.stringify(entry.status));
            const image = Object.values(entry.outputs ?? {}).flatMap((output) => output.images ?? [])[0];
            if (!image) throw new Error('Render succeeded without an image.');
            const bytes = Buffer.from(await (await fetch(`${config.comfyUrl}/view?${new URLSearchParams(image)}`)).arrayBuffer());
            const artifact = path.join(config.stateDir, `render-${familyName}-${mode}-${Date.now()}.png`);
            await fs.writeFile(artifact, bytes);
            result.render = { elapsedMs: Date.now() - began, promptId: ownedPrompt, imageBytes: bytes.length, image: artifact };
            break;
        }
        if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status));
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!result.render) throw new Error('Owned render timed out; it will not be globally interrupted.');
    result.afterRender = await memorySnapshot();
    const releaseBegan = Date.now();
    await post(url, '/release', { lease: lease.lease }); lease = null;
    await post(url, '/control/automatic', {});
    result.releaseMs = Date.now() - releaseBegan;
    if (mode !== 'solo') result.textAfter = await text();
    result.totalCycleMs = Date.now() - cycleBegan;
    result.controllerAfter = await (await fetch(`${url}/status`)).json();
    result.ok = true;
} catch (error) {
    result.ok = false; result.error = error.message;
    if (ownedPrompt) await post(config.comfyUrl, '/queue', { delete: [ownedPrompt] }).catch(() => {});
} finally {
    clearInterval(timer);
    if (lease) await post(url, '/release', { lease: lease.lease }).catch((error) => { result.releaseError = error.message; });
    await post(url, '/control/automatic', {}).catch(() => {});
    result.samples = samples;
    result.after = await memorySnapshot();
    const record = path.join(process.env.SO_LOCAL_RECORD_DIR ?? config.stateDir, `render-${familyName}-${mode}-${Date.now()}.json`);
    await fs.writeFile(record, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(process.argv.includes('--summary') ? { record, ok: result.ok, family: familyName, decision: result.lease?.decision,
        renderMs: result.render?.elapsedMs, totalCycleMs: result.totalCycleMs, tokensPerSecond: result.textAfter?.timings?.predicted_per_second, error: result.error }
        : { record, ...result, samples: samples.length }, null, 2));
}
if (!result.ok) process.exitCode = 1;
