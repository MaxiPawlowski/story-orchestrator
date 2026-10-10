import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { nativeArgs } from '../../server-plugin/story-orchestrator-gpu/broker/backend.mjs';
import { FastTelemetry } from '../../server-plugin/story-orchestrator-gpu/broker/fastTelemetry.mjs';

const usage = 'Usage: node scripts/local/residency-arms.mjs <config.json> resident|ffn|reload scene|portrait [runs] [--cpu-ffn N] [--comfy-reserve GB] [--comfy-arg X]';
const [configFile, arm, familyName = 'scene', runsText = '2'] = process.argv.slice(2).filter((value, index, all) => !value.startsWith('--') && !all[index - 1]?.startsWith('--'));
const option = (name) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : null; };
const options = (name) => process.argv.flatMap((value, index, all) => (value === name ? [all[index + 1]] : []));
if (!configFile || !['resident', 'ffn', 'reload'].includes(arm) || !['scene', 'portrait'].includes(familyName)) throw new Error(usage);
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const runs = Number(runsText);
if (option('--text-load-mode')) config.modelLoadMode = option('--text-load-mode');
const cpuFfn = Number(option('--cpu-ffn') ?? 0);
const comfyReserve = option('--comfy-reserve') ?? '2';
const replyTokens = Number(option('--tokens') ?? 128);
const recordDir = process.env.SO_LOCAL_RECORD_DIR ?? config.stateDir;
const home = fileURLToPath(new URL('../../', import.meta.url));
const moduleFrom = async (file) => {
    const { code } = await transform(await fs.readFile(path.join(home, file), 'utf8'), { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const { buildGraph } = await moduleFrom('src/image/graph.ts');
const { FAMILIES, checkpointFor, familyOf } = await moduleFrom('src/image/catalog.ts');
const checkpointFile = familyName === 'portrait' ? config.benchmarkPortraitCheckpoint ?? 'JANKUTrainedChenkinNoobai_v777.safetensors'
    : config.benchmarkCheckpoint ?? 'waiIllustriousSDXL_v170.safetensors';
const checkpoint = checkpointFor(checkpointFile, familyOf(checkpointFile) ?? 'sdxl-illustrious');
const family = FAMILIES[checkpoint.family];
const graphFor = (seed) => buildGraph({ checkpoint, family, loras: [], positive: 'an empty old stone hall, fireplace, warm light, detailed architecture, no people',
    negative: 'text, watermark, low quality', size: family.sizes.wide, seed, hires: false, upscaler: '' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const comfy = config.comfyUrl ?? 'http://127.0.0.1:8188';
const textUrl = `http://127.0.0.1:${config.backendPort}`;
const alive = async (url) => { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
if (await alive(`http://127.0.0.1:${config.gatewayPort}/status`)) throw new Error('Stop the residency controller first (cli.mjs stop); this harness owns text and ComfyUI.');
if (await alive(`${comfy}/system_stats`) || await alive(`${textUrl}/health`)) throw new Error('ComfyUI or the text port is already owned by another process.');

const telemetry = new FastTelemetry(config.telemetryPython ?? config.comfyPython);
const window = { reset() { Object.assign(this, { peakUsedMiB: 0, lowGpuFreeMiB: Infinity, lowRamMiB: Infinity, peakSharedMiB: 0 }); } };
window.reset();
telemetry.subscribe((row) => {
    window.peakUsedMiB = Math.max(window.peakUsedMiB, row.gpus[0].usedMiB);
    window.lowGpuFreeMiB = Math.min(window.lowGpuFreeMiB, row.gpus[0].freeMiB);
    window.lowRamMiB = Math.min(window.lowRamMiB, row.host.availableMiB);
});
const shared = spawn('typeperf', ['\\GPU Adapter Memory(*)\\Shared Usage', '-si', '1'], { windowsHide: true });
let sharedBaseline = null;
shared.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
        const cells = line.split('","').map((cell) => Number(cell.replace(/"/g, '')));
        if (cells.length < 2 || !Number.isFinite(cells[1])) continue;
        const mib = Math.max(...cells.slice(1).filter(Number.isFinite)) / 1048576;
        sharedBaseline ??= mib;
        window.peakSharedMiB = Math.max(window.peakSharedMiB, mib - sharedBaseline);
    }
});

const handles = [];
const logFile = async (name) => { const handle = await fs.open(path.join(config.stateDir, `${name}-${Date.now()}.log`), 'a'); handles.push(handle); return handle; };
let comfyChild = null;
let textChild = null;
const startComfy = async () => {
    const log = await logFile('arms-comfy');
    const args = ['main.py', '--listen', '127.0.0.1', '--port', new URL(comfy).port, '--disable-auto-launch', '--cache-ram', '8', '--reserve-vram', comfyReserve,
        ...(config.comfyExtraArgs ?? []), ...options('--comfy-arg')];
    comfyChild = spawn(config.comfyPython, args, { cwd: config.comfyRoot, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
        env: { ...process.env, ...(config.modelCacheRoot ? { HF_HOME: config.modelCacheRoot, HF_HUB_DISABLE_IMPLICIT_TOKEN: '1',
            TORCHINDUCTOR_CACHE_DIR: path.join(config.modelCacheRoot, 'torch'), CUDA_CACHE_PATH: path.join(config.modelCacheRoot, 'cuda') } : {}) } });
    telemetry.setProcess(comfyChild.pid);
    for (const deadline = Date.now() + 180000; Date.now() < deadline; await sleep(1000)) if (await alive(`${comfy}/system_stats`)) return args;
    throw new Error('ComfyUI did not become ready.');
};
const stopText = async () => {
    const child = textChild; textChild = null;
    if (!child || child.exitCode !== null) return;
    const ended = new Promise((resolve) => child.once('exit', resolve));
    child.kill(); await Promise.race([ended, sleep(15000)]);
};
const startText = async (extra = []) => {
    await stopText();
    const log = await logFile(`arms-text-${extra.length ? 'reduced' : 'full'}`);
    const began = Date.now();
    const args = [...nativeArgs(config, config.profiles[config.defaultProfile]), ...extra];
    textChild = spawn(config.binary, args, { windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    for (const deadline = Date.now() + 240000; Date.now() < deadline; await sleep(250)) {
        if (textChild.exitCode !== null) throw new Error(`Text exited ${textChild.exitCode}.`);
        if (await alive(`${textUrl}/health`)) return { loadMs: Date.now() - began, args: extra };
    }
    throw new Error('Text did not become ready.');
};
const reply = async () => {
    const began = Date.now();
    const response = await fetch(`${textUrl}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
        body: JSON.stringify({ prompt: '<|turn>user\nDescribe a stone hall with a fireplace and its furniture in detail.<turn|>\n<|turn>model\n<|channel>final\n',
            n_predict: replyTokens, temperature: 0.6, top_k: 0, top_p: 1, min_p: 0.05, seed: 17, cache_prompt: true, ignore_eos: true }) });
    const data = await response.json();
    if (!response.ok || !data.content?.trim()) throw new Error(`Text reply failed: ${JSON.stringify(data).slice(0, 400)}`);
    return { elapsedMs: Date.now() - began, predicted: data.timings?.predicted_n, tokensPerSecond: data.timings?.predicted_per_second, promptMs: data.timings?.prompt_ms };
};
const render = async (seed) => {
    const began = Date.now();
    const queued = await (await fetch(`${comfy}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: graphFor(seed), client_id: `so-arms-${process.pid}` }) })).json();
    if (!queued.prompt_id) throw new Error(JSON.stringify(queued));
    for (const deadline = Date.now() + 900000; Date.now() < deadline; await sleep(250)) {
        const entry = (await (await fetch(`${comfy}/history/${queued.prompt_id}`)).json())[queued.prompt_id];
        if (entry?.status?.completed) {
            if (entry.status.status_str !== 'success') throw new Error(JSON.stringify(entry.status).slice(0, 2000));
            if (!Object.values(entry.outputs ?? {}).some((output) => output.images?.length)) throw new Error('Render without an image.');
            return { elapsedMs: Date.now() - began, promptId: queued.prompt_id };
        }
        if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status).slice(0, 2000));
    }
    throw new Error('Render timed out.');
};
const freeComfy = async () => {
    await fetch(`${comfy}/free`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: false }) });
    await sleep(3000);
};

const record = { arm, family: familyName, checkpoint: checkpoint.file, cpuFfn, comfyReserve, textLoadMode: config.modelLoadMode ?? 'profile', replyTokens, reserves: config.reserves, runs: [], startedAt: new Date().toISOString() };
const stamp = Date.now();
const file = path.join(recordDir, `arms-${arm}${cpuFfn ? `-ffn${cpuFfn}` : ''}${config.modelLoadMode ? `-${config.modelLoadMode}` : ''}-r${comfyReserve}-${familyName}-${stamp}.json`);
try {
    record.comfyArgs = await startComfy();
    record.fullLoad = await startText();
    await reply();
    for (let index = 0; index < runs; index += 1) {
        const run = { index };
        const seed = (stamp + index * 7919) % 4294967296;
        if (arm === 'reload') { await stopText(); await freeComfy(); run.hotReload = await startText(); await reply(); }
        window.reset();
        const t0 = Date.now();
        if (arm === 'ffn') run.reducedLoad = await startText(['--n-cpu-ffn', String(cpuFfn)]);
        if (arm === 'reload') await stopText();
        run.afterTextMiB = { usedGpu: (await telemetry.snapshot()).gpus[0].usedMiB };
        run.render = await render(seed);
        if (arm === 'reload') { await freeComfy(); run.reload = await startText(); }
        run.reply = await reply();
        run.imageToReplyMs = Date.now() - t0;
        run.window = { ...window, ramReserveCrossed: window.lowRamMiB < config.reserves.ramMiB, gpuReserveCrossed: window.lowGpuFreeMiB < config.reserves.gpuMiB };
        if (arm === 'ffn') {
            await freeComfy();
            run.restore = await startText();
            run.restoredReply = await reply();
        }
        record.runs.push(run);
        console.log(JSON.stringify({ arm, index, renderMs: run.render.elapsedMs, imageToReplyMs: run.imageToReplyMs, tokensPerSecond: run.reply.tokensPerSecond,
            reducedLoadMs: run.reducedLoad?.loadMs, reloadMs: run.reload?.loadMs ?? run.restore?.loadMs, peakUsedMiB: run.window.peakUsedMiB,
            lowGpuFreeMiB: Math.round(run.window.lowGpuFreeMiB), lowRamMiB: Math.round(run.window.lowRamMiB), peakSharedMiB: Math.round(run.window.peakSharedMiB) }));
        if (run.window.ramReserveCrossed) { record.stopped = 'Physical RAM reserve crossed; no further runs.'; break; }
    }
    record.ok = !record.stopped;
} catch (error) {
    record.ok = false; record.error = error.message;
    console.error(error.message);
} finally {
    record.finishedAt = new Date().toISOString();
    await stopText();
    if (comfyChild && comfyChild.exitCode === null) { comfyChild.kill(); await Promise.race([new Promise((resolve) => comfyChild.once('exit', resolve)), sleep(15000)]); }
    shared.kill(); telemetry.stop();
    await Promise.all(handles.map((handle) => handle.close().catch(() => {})));
    await fs.writeFile(file, JSON.stringify(record, null, 2));
    console.log(file);
}
if (!record.ok) process.exitCode = 1;
