import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { start, exit } from '../../server-plugin/story-orchestrator-gpu/index.mjs';
import { estimateNeedMiB } from '../../server-plugin/story-orchestrator-gpu/broker/models.mjs';
import { superviseConfigFromLocal, fakeRouter } from './pluginBrokerLiConfig.mjs';

const [localFile, outDir, runLabel = 'run1'] = process.argv.slice(2);
if (!localFile || !outDir) throw new Error('Usage: node scripts/local/retainBatchLi.mjs <local config.json> <out dir> [label]');
const local = JSON.parse(await fs.readFile(localFile, 'utf8'));
const LISTEN = 18898;
const ROUTER = 18897;
await fs.mkdir(outDir, { recursive: true });
const config = { ...superviseConfigFromLocal(local, { stateDir: path.join(outDir, 'state'), listenPort: LISTEN, textPort: 18899 }), retainBatches: process.env.SO_LI_RETAIN !== 'off', imageCacheMode: process.env.SO_LI_CACHE ?? 'evict' };
await fs.mkdir(config.stateDir, { recursive: true });

const home = fileURLToPath(new URL('../../', import.meta.url));
const moduleFrom = async (file) => {
    const source = (await fs.readFile(path.join(home, file), 'utf8')).replace(/^import type .*$/gm, '');
    const { code } = await transform(source, { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const { SpriteBatchLease, mayRetainBatch } = await moduleFrom('src/sprites/builder/batchLease.ts');
const { editGraph, editInstruction, EDIT_RECIPE } = await moduleFrom('src/sprites/builder/recipes.ts');

const MODELS = { diffusion: { name: 'qwen_image_2.1_int8_convrot.safetensors' }, encoder: { name: 'qwen3vl_8b_int8_convrot.safetensors' }, vae: { name: 'qwen_image_2.1_vae_bf16.safetensors' } };
const STEPS = 25;
const RESOLUTION = 1024;
const FAMILY = process.env.SO_LI_FAMILY ?? 'qwen';
const { buildGraph } = await moduleFrom('src/image/graph.ts');
const { FAMILIES, checkpointFor, familyOf } = await moduleFrom('src/image/catalog.ts');
const sdxlFile = 'waiIllustriousSDXL_v170.safetensors';
const sdxlCheckpoint = checkpointFor(sdxlFile, familyOf(sdxlFile) ?? 'sdxl-illustrious');
const sdxlFamily = FAMILIES[sdxlCheckpoint.family];
const modelFiles = FAMILY === 'sdxl' ? [{ kind: 'checkpoints', name: sdxlFile }]
    : [{ kind: 'diffusionModels', name: MODELS.diffusion.name }, { kind: 'textEncoders', name: MODELS.encoder.name }, { kind: 'vaes', name: MODELS.vae.name }];
const size = FAMILY === 'sdxl' ? sdxlFamily.sizes.portrait : { width: RESOLUTION, height: RESOLUTION };
const sdxlGraph = (expression, seed) => buildGraph({ checkpoint: sdxlCheckpoint, family: sdxlFamily, loras: [],
    positive: `1girl, solo, lighthouse keeper, short grey hair, round glasses, yellow raincoat, standing, ${expression} expression, upper body, plain white background`,
    negative: 'text, watermark, low quality, multiple people', size, seed, hires: false });
const needGpuMiB = await estimateNeedMiB({ modelDirs: local.modelDirs, files: modelFiles, ...size, hires: false });
const editKey = JSON.stringify({ recipe: EDIT_RECIPE, family: 'face', ...size });
const baseKey = JSON.stringify({ recipe: 'li-base', ...size });

const router = fakeRouter();
const routerServer = http.createServer(async (req, res) => {
    const route = new URL(req.url, 'http://x').pathname;
    const found = router.find(req.method, route);
    if (!found) { res.writeHead(404).end('{}'); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    req.user = { profile: { admin: true } };
    req.params = found.params;
    res.json = (data) => { res.writeHead(res.statusCode || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    res.status = (code) => { res.statusCode = code; return res; };
    await found.handler(req, res);
});
await new Promise((resolve) => routerServer.listen(ROUTER, '127.0.0.1', resolve));

const call = async (base, route, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(900000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} ${response.status} ${JSON.stringify(data)}`);
    return data;
};
const plugin = (route, body, method) => call(`http://127.0.0.1:${ROUTER}`, route, body, method);
const gateway = (route, body, method) => call(`http://127.0.0.1:${LISTEN}`, route, body, method);
const smi = () => new Promise((resolve) => execFile('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], (error, out) => {
    const [used, total] = String(out).trim().split(',').map(Number);
    resolve(error ? null : { usedMiB: used, freeMiB: total - used });
}));
const began = Date.now();
const events = [];
const mark = (kind, extra = {}) => events.push({ t: Date.now() - began, kind, ...extra });
const gpuSamples = [];
const ramSamples = [];
const sampler = setInterval(() => {
    void smi().then((sample) => { if (sample) gpuSamples.push({ t: Date.now() - began, ...sample }); });
    void plugin('/status').then((status) => { const avail = status.telemetry?.host?.availableMiB; if (Number.isFinite(avail)) ramSamples.push({ t: Date.now() - began, availableMiB: avail, state: status.state, mayRetain: status.mayRetain }); }).catch(() => {});
}, 1000);
const text = async (label) => {
    const at = Date.now();
    mark('text-request', { label });
    const data = await gateway('/completion', { prompt: '<|turn>user\nDescribe a quiet library at night in four sentences.<turn|>\n<|turn>model\n<|channel>final\n', n_predict: 96, temperature: 0.6, top_k: 0, top_p: 1, min_p: 0.05, seed: 17, cache_prompt: true });
    mark('text-reply', { label });
    return { label, elapsedMs: Date.now() - at, visible: Boolean(data.content?.trim()), chars: data.content?.length ?? 0 };
};
const render = async (graph, prefix) => {
    const queued = await call(local.comfyUrl, '/prompt', { prompt: graph, client_id: `so-retain-li-${process.pid}` });
    const deadline = Date.now() + 900000;
    while (Date.now() < deadline) {
        const history = (await (await fetch(`${local.comfyUrl}/history/${queued.prompt_id}`)).json())[queued.prompt_id];
        if (history?.status?.completed) {
            if (history.status.status_str !== 'success') throw new Error(JSON.stringify(history.status));
            const image = Object.values(history.outputs ?? {}).flatMap((output) => output.images ?? [])[0];
            const bytes = Buffer.from(await (await fetch(`${local.comfyUrl}/view?${new URLSearchParams(image)}`)).arrayBuffer());
            await fs.writeFile(path.join(outDir, `${runLabel}-${prefix}.png`), bytes);
            return { bytes, image };
        }
        if (history?.status?.status_str === 'error') throw new Error(JSON.stringify(history.status));
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Render timed out.');
};
const counts = { leases: 0, renews: 0, releases: 0 };
const createLease = (batch) => async () => {
    mark('lease-request', { batch });
    const granted = await plugin('/lease', { workflowKey: editKey, needGpuMiB, nextTextTokens: 96, modelFiles, ...size, hires: false });
    counts.leases += 1;
    const residency = (await plugin('/status').catch(() => null))?.lastResidency ?? null;
    mark('lease-granted', { batch, decision: granted.decision ?? null, brokered: granted.brokered ?? null, needRamMiB: residency?.needRamMiB ?? null, ramSource: residency?.ramSource ?? null, ramAvailableMiB: residency?.readings?.ramAvailableMiB ?? null, reason: residency?.reason ?? null });
    if (!granted.lease) throw new Error(`No lease: ${granted.warning ?? 'unbrokered'}`);
    const timer = setInterval(() => { void plugin('/renew', { lease: granted.lease }).catch(() => {}); }, 30000);
    return {
        renew: async () => { counts.renews += 1; mark('lease-renew', { batch }); const result = await plugin('/renew', { lease: granted.lease }); if (!result.renewed) throw new Error('renew refused'); },
        release: async () => { clearInterval(timer); counts.releases += 1; mark('lease-release', { batch }); await plugin('/release', { lease: granted.lease }); },
    };
};
const waitForText = async () => {
    for (;;) {
        const status = await plugin('/status');
        if (!(status.activeText || status.waitingText)) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
};
const batchOf = () => new SpriteBatchLease({ current: () => true,
    mayRetain: async () => { const status = await plugin('/status'); const answer = mayRetainBatch(status); mark('may-retain', { answer, waitingText: status.waitingText, imageLease: status.imageLease }); return answer; },
    waitForText, schedule: (work, ms) => setTimeout(work, ms), unschedule: (timer) => clearTimeout(timer), failed: (error) => mark('drop-failed', { error: String(error) }) });

const report = { runLabel, at: new Date().toISOString(), family: FAMILY, retainBatches: config.retainBatches, imageCacheMode: config.imageCacheMode, needGpuMiB, models: MODELS, steps: STEPS, resolution: RESOLUTION, ok: false };
try {
    await start(router, config);
    report.reserves = (await plugin('/status')).reserves;
    const warm = Date.now();
    const warming = plugin('/control/start-comfy', {}).catch((error) => ({ error: error.message }));
    let comfyUp = false;
    while (!comfyUp && Date.now() - warm < 600000) {
        comfyUp = await fetch(`${local.comfyUrl}/system_stats`).then((response) => response.ok).catch(() => false);
        if (!comfyUp) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!comfyUp) throw new Error('ComfyUI did not answer within 600 s.');
    await warming;
    report.comfyWarmMs = Date.now() - warm;
    if (process.env.SO_LI_TEXT_FIRST === 'on') report.text1 = await text('before');
    let reference = null;
    if (FAMILY !== 'sdxl') {
        const baseLease = await plugin('/lease', { workflowKey: baseKey, needGpuMiB, nextTextTokens: 96, modelFiles, ...size, hires: false });
        const baseResidency = (await plugin('/status').catch(() => null))?.lastResidency ?? null;
        mark('base-lease', { decision: baseLease.decision ?? null, needRamMiB: baseResidency?.needRamMiB ?? null, ramSource: baseResidency?.ramSource ?? null, ramAvailableMiB: baseResidency?.readings?.ramAvailableMiB ?? null });
        const node = (class_type, inputs) => ({ class_type, inputs });
        const baseGraph = {
            '1': node('UNETLoader', { unet_name: MODELS.diffusion.name, weight_dtype: 'default' }),
            '2': node('QwenImage21Cache', { model: ['1', 0], device: 'auto', dtype: 'default' }),
            '3': node('CLIPLoader', { clip_name: MODELS.encoder.name, type: 'qwen_image', device: 'default' }),
            '4': node('VAELoader', { vae_name: MODELS.vae.name }),
            '5': node('TextEncodeQwenImage21', { clip: ['3', 0], prompt: 'Anime-style character sprite: a young lighthouse keeper with short grey hair, round glasses, a yellow raincoat and boots, standing, neutral face, full body, plain white background.', negative_prompt: 'text, watermark, deformed face, cropped, multiple characters', vae: ['4', 0], resolution: RESOLUTION }),
            '6': node('EmptySD3LatentImage', { width: 768, height: 1152, batch_size: 1 }),
            '7': node('KSampler', { model: ['2', 0], seed: 4242, steps: STEPS, cfg: 1, sampler_name: 'euler', scheduler: 'simple', positive: ['5', 0], negative: ['5', 1], latent_image: ['6', 0], denoise: 1 }),
            '8': node('VAEDecode', { samples: ['7', 0], vae: ['4', 0] }),
            '9': node('SaveImage', { filename_prefix: 'SO-LI-retain-base', images: ['8', 0] }),
        };
        const base = await render(baseGraph, 'base');
        await plugin('/release', { lease: baseLease.lease });
        mark('base-released');
        const form = new FormData();
        form.append('image', new Blob([base.bytes], { type: 'image/png' }), `SO-LI-retain-ref-${runLabel}.png`);
        form.append('overwrite', 'true');
        const uploaded = await (await fetch(`${local.comfyUrl}/upload/image`, { method: 'POST', body: form })).json();
        reference = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
    }
    const expressions = ['happy', 'angry', 'worried'];
    const runBatch = async (batchName, onFirstRender) => {
        const leasesBefore = counts.leases;
        const batch = batchOf();
        const images = [];
        let pendingText = null;
        for (const [index, expression] of expressions.entries()) {
            const t0 = Date.now();
            const unit = await batch.acquire(editKey, createLease(batchName));
            const graph = FAMILY === 'sdxl' ? sdxlGraph(expression, 77 + index) : editGraph({ models: MODELS, steps: STEPS, seed: 77 + index, reference, instruction: editInstruction('expression', expression), resolution: RESOLUTION });
            mark('render-start', { batch: batchName, index });
            if (index === 0 && onFirstRender) pendingText = onFirstRender();
            const rendered = await render(graph, `${batchName}-${expression}`);
            mark('render-done', { batch: batchName, index });
            await unit.release();
            images.push({ expression, wallMs: Date.now() - t0, bytes: rendered.bytes.length });
        }
        await batch.close();
        return { images, leases: counts.leases - leasesBefore, text: pendingText ? await pendingText : null };
    };
    const midText = () => new Promise((resolve) => setTimeout(resolve, 5000)).then(() => text('mid-batch'));
    report.order = process.env.SO_LI_ORDER === 'BA' ? 'BA' : 'AB';
    if (report.order === 'BA') { report.batchB = await runBatch('B', midText); report.batchA = await runBatch('A', null); }
    else { report.batchA = await runBatch('A', null); report.batchB = await runBatch('B', midText); }
    const t = (kind, filter = () => true) => events.filter((event) => event.kind === kind && filter(event)).map((event) => event.t);
    const midReply = t('text-reply', (event) => event.label === 'mid-batch')[0];
    const bLeases = t('lease-granted', (event) => event.batch === 'B');
    report.floors = {
        batchAWarm: report.batchA.leases === 1,
        batchAImages: report.batchA.images.length === 3 && report.batchA.images.every((image) => image.bytes > 0),
        midTextAnswered: Boolean(report.batchB.text?.visible),
        midTextBeforeNextLease: bLeases.length >= 2 && Number.isFinite(midReply) && midReply < bLeases[1],
        batchBImages: report.batchB.images.length === 3,
        gpuReserveHeld: Math.min(...gpuSamples.map((sample) => sample.freeMiB)) >= report.reserves.gpuMiB,
        ramReserveHeld: ramSamples.length > 0 && Math.min(...ramSamples.map((sample) => sample.availableMiB)) >= report.reserves.ramMiB,
    };
    report.ok = Object.values(report.floors).every(Boolean);
} catch (error) {
    report.error = String(error.stack ?? error.message ?? error);
} finally {
    clearInterval(sampler);
    report.counts = counts;
    report.events = events;
    report.minFreeGpuMiB = gpuSamples.length ? Math.min(...gpuSamples.map((sample) => sample.freeMiB)) : null;
    report.minRamAvailableMiB = ramSamples.length ? Math.min(...ramSamples.map((sample) => sample.availableMiB)) : null;
    report.mayRetainTrueSamples = ramSamples.filter((sample) => sample.mayRetain).length;
    report.statusSamples = ramSamples.length;
    report.totalMs = Date.now() - began;
    await exit().catch((error) => { report.exitError = error.message; });
    await new Promise((resolve) => routerServer.close(resolve));
    await new Promise((resolve) => setTimeout(resolve, 3000));
    report.gpuAfterExit = await smi();
    await fs.writeFile(path.join(outDir, `${runLabel}.json`), JSON.stringify({ ...report, gpuSamples, ramSamples }, null, 2));
    const { events: _events, ...summary } = report;
    console.log(JSON.stringify(summary, null, 2));
}
process.exitCode = report.ok ? 0 : 1;
