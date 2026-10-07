import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NativeBackend } from './backend.mjs';
import { ResidencyScheduler } from './scheduler.mjs';
import { memorySnapshot } from './telemetry.mjs';
import { ImageCache } from './imageCache.mjs';
import { ResponseTiming } from './responseTiming.mjs';
import { createHash } from 'node:crypto';
import { FastTelemetry } from './fastTelemetry.mjs';
import { runtimeMemoryProfile } from './runtimeIdentity.mjs';

const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/local/controller.mjs <config.json>');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const sourceFiles = ['backend', 'controller', 'estimate', 'fastTelemetry', 'footprints', 'gguf', 'imageCache', 'models', 'policy', 'responseTiming', 'runtimeIdentity', 'safetensors', 'scheduler', 'telemetry'];
const source = createHash('sha256');
for (const name of sourceFiles) source.update(name).update(await fs.readFile(new URL(`./${name}.mjs`, import.meta.url)));
source.update(await fs.readFile(new URL('./memory-probe.py', import.meta.url)));
source.update(await fs.readFile(new URL('./comfyMemoryGuard/__init__.py', import.meta.url)));
const controllerBuild = source.digest('hex');
await fs.mkdir(config.stateDir, { recursive: true });
const footprintsPath = path.join(config.stateDir, 'footprints.json');
let footprints = {};
try { footprints = JSON.parse(await fs.readFile(footprintsPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const timingsPath = path.join(config.stateDir, 'text-timings.json');
const modelStat = await fs.stat(config.model);
const binaryStat = await fs.stat(config.binary);
const fast = new FastTelemetry(config.telemetryPython ?? config.comfyPython);
const timingIdentity = JSON.stringify({ model: config.model, modelBytes: modelStat.size, modelAt: modelStat.mtimeMs,
    binary: config.binary, binaryAt: binaryStat.mtimeMs, mode: config.modelLoadMode ?? 'profile', profiles: config.profiles });
let timings = {};
try {
    const stored = JSON.parse(await fs.readFile(timingsPath, 'utf8'));
    if (stored.identity === timingIdentity) timings = stored.timings;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let telemetry = null;
let telemetryAt = 0;
let telemetryPending;
const snapshot = async ({ fresh = false } = {}) => {
    if (fresh) return fast.snapshot();
    if (Date.now() - telemetryAt < 2500 && telemetry) return telemetry;
    telemetryPending ??= memorySnapshot().then((data) => { telemetry = data; telemetryAt = Date.now(); return data; }).finally(() => { telemetryPending = null; });
    return telemetryPending;
};
const jsonFetch = async (route, options = {}) => {
    const response = await fetch(`${config.comfyUrl}${route}`, { ...options, signal: AbortSignal.timeout(config.comfyRequestTimeoutMs ?? 60000) });
    if (!response.ok) throw new Error(`ComfyUI ${route} answered ${response.status}`);
    const raw = await response.text();
    return raw ? JSON.parse(raw) : {};
};
let comfyChild = null;
const startComfy = async () => {
    try { await jsonFetch('/system_stats'); return; } catch {}
    if (!comfyChild) {
        const log = await fs.open(path.join(config.stateDir, `comfy-${Date.now()}.log`), 'a');
        comfyChild = spawn(config.comfyPython, ['main.py', '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch', '--cache-ram', '8', '--reserve-vram', '2', ...(config.comfyExtraArgs ?? [])],
            { cwd: config.comfyRoot, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
                env: { ...process.env, ...(config.modelCacheRoot ? { HF_HOME: config.modelCacheRoot, HF_HUB_CACHE: path.join(config.modelCacheRoot, 'hub'),
                    HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', TORCHINDUCTOR_CACHE_DIR: path.join(config.modelCacheRoot, 'torch'), CUDA_CACHE_PATH: path.join(config.modelCacheRoot, 'cuda') } : {}) } });
        const child = comfyChild;
        fast.setProcess(child.pid);
        child.once('error', (error) => { console.error(error.message); comfyChild = null; void log.close(); });
        child.once('exit', () => { if (comfyChild === child) { comfyChild = null; fast.setProcess(null); } void log.close(); });
    }
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
        try { await jsonFetch('/system_stats'); return; } catch {}
        if (!comfyChild) throw new Error('Owned ComfyUI process exited before becoming ready.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('ComfyUI did not become ready.');
};
const backend = new NativeBackend(config);
const imageCache = new ImageCache({ config, jsonFetch, snapshot, trim: async () => {
    if (config.nativePoolTrim) await jsonFetch('/so-local/trim', { method: 'POST', headers: { 'X-SO-Local': '1' } });
}, emptyHostCache: async () => {
    const response = await fetch(`${config.comfyUrl}/so-local/host-cache`, { method: 'POST', headers: { 'X-SO-Local': '1' }, signal: AbortSignal.timeout(15000) });
    if (response.status === 404 || response.status === 501) return false;
    if (!response.ok) throw new Error(`ComfyUI host-cache release refused ${response.status}`);
    const evidence = await response.json();
    imageCache.lastHostTrim = { at: new Date().toISOString(), ...evidence };
    return evidence.trimmed === true;
} });
const freeImages = async (options = {}) => {
    await startComfy();
    const result = await imageCache.free({ ...options, clear: options.clear ?? config.imageCacheMode === 'evict' });
    telemetryAt = 0;
    return result;
};
const scheduler = new ResidencyScheduler({ config, backend, snapshot, startComfy,
    queue: () => jsonFetch('/queue'),
    freeImages,
    saveFootprints: (data) => fs.writeFile(footprintsPath, JSON.stringify(data, null, 2)), footprints,
    timings, saveTimings: (data) => fs.writeFile(timingsPath, JSON.stringify({ identity: timingIdentity, timings: data }, null, 2)),
    runtime: async () => {
        const stats = await jsonFetch('/system_stats');
        const code = createHash('sha256');
        for (const name of ['main.py', 'comfy/model_management.py', 'comfy/model_patcher.py']) code.update(await fs.readFile(path.join(config.comfyRoot, name)));
        code.update(await fs.readFile(new URL('./comfyMemoryGuard/__init__.py', import.meta.url)));
        return runtimeMemoryProfile(stats.system, code.digest('hex'), { hostCacheRelease: 'pressure-only-public-api-v1', cacheMode: config.imageCacheMode ?? 'warm',
            warmReleaseMs: config.imageWarmReleaseMs ?? 5000, nativePoolTrim: config.nativePoolTrim === true });
    } });
fast.subscribe((snapshot) => scheduler.observe(snapshot));
const readBody = async (req) => {
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > 8 * 1024 * 1024) throw new Error('Request exceeds 8 MiB.'); chunks.push(chunk); }
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
};
const answer = (res, status, data) => { if (!res.destroyed && !res.headersSent) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); } };
let closing = false;
const server = http.createServer(async (req, res) => {
    try {
        const origin = req.headers.origin;
        if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):(8000|81\d\d)$/.test(origin)) { answer(res, 403, { error: 'Use the local ST plugin or tray controls.' }); return; }
        const route = new URL(req.url, 'http://localhost').pathname;
        if (req.method === 'GET' && route === '/measurement') { answer(res, 200, scheduler.lastMeasurement ?? null); return; }
        if (req.method === 'GET' && ['/', '/status', '/health'].includes(route)) { answer(res, 200, { ...scheduler.status(), controllerBuild, imageCache: imageCache.last, imageCacheFailure: imageCache.lastFailure, imageCacheHostTrim: imageCache.lastHostTrim ?? null, imageCacheMode: config.imageCacheMode ?? 'warm', telemetry: await snapshot({ fresh: true }), adapter: 'managed', guarding: true, reserves: config.reserves, pid: process.pid, configFile, maxContext: 98304 }); return; }
        if (req.method === 'POST' && ['/lease', '/renew', '/release'].includes(route)) {
            const body = await readBody(req);
            const data = route === '/lease' ? await scheduler.reserve(body) : route === '/renew' ? { renewed: scheduler.renew(body.lease) } : { released: await scheduler.release(body.lease) };
            answer(res, 200, data); return;
        }
        if (req.method === 'POST' && route.startsWith('/control/')) {
            const body = await readBody(req);
            if (route === '/control/load') {
                if (body.fitTarget != null && (!config.experiments || !Number.isFinite(body.fitTarget) || body.fitTarget < config.reserves.gpuMiB)) throw new Error('Explicit fit targets require a bounded residency experiment.');
                await scheduler.load(body.profile ?? config.defaultProfile, { fitTarget: body.fitTarget });
            }
            else if (route === '/control/unload') await scheduler.unload();
            else if (route === '/control/automatic') scheduler.resume();
            else if (route === '/control/restore') await scheduler.restoreNow();
            else if (route === '/control/start-comfy') await scheduler.exclusive(startComfy);
            else if (route === '/control/free-images') await scheduler.exclusive(() => freeImages({ clear: typeof body.clear === 'boolean' ? body.clear : undefined }));
            else if (route === '/control/cache-mode') await scheduler.exclusive(async () => {
                if (!['warm', 'evict'].includes(body.profile)) throw new Error('Cache mode must be warm or evict.');
                config.imageCacheMode = body.profile;
            });
            else if (route === '/control/stop') {
                await scheduler.exclusive(async () => {
                    if (comfyChild) {
                        const queue = await jsonFetch('/queue');
                        if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI has an existing job; finish it before stopping the controller.');
                    }
                    closing = true; scheduler.manualHold = true; await backend.unload(); if (comfyChild) comfyChild.kill();
                });
                fast.stop(); answer(res, 200, { stopped: true }); server.close(() => process.exit(0)); return;
            } else { answer(res, 404, { error: 'Unknown control.' }); return; }
            answer(res, 200, scheduler.status()); return;
        }
        if (req.method === 'GET' && route === '/v1/models') {
            answer(res, 200, { object: 'list', data: [{ id: config.modelAlias, object: 'model', owned_by: 'llamacpp', meta: { n_ctx_train: 98304 } }] }); return;
        }
        if (req.method === 'GET' && route === '/props') {
            answer(res, 200, { default_generation_settings: { n_ctx: 98304 }, total_slots: 1 }); return;
        }
        if (!['/completion', '/v1/completions', '/v1/chat/completions', '/tokenize', '/detokenize', '/props', '/slots'].includes(route)) { answer(res, 404, { error: 'Unknown route.' }); return; }
        if (closing) throw new Error('Controller is stopping.');
        const body = req.method === 'POST' ? await readBody(req) : null;
        const abort = new AbortController();
        res.once('close', () => { if (!res.writableEnded) abort.abort(); });
        await scheduler.text(async () => {
            if (body && ['/completion', '/v1/completions', '/v1/chat/completions'].includes(route)) await backend.forRequest(body, abort.signal);
            else await backend.ensure(backend.profile ?? config.defaultProfile);
            const response = await fetch(`${backend.url}${route}`, { method: req.method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: abort.signal });
            if (res.destroyed) return;
            res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
            if (response.body) {
                const timing = new ResponseTiming(response.headers.get('content-type')?.includes('text/event-stream'));
                await pipeline(Readable.fromWeb(response.body), timing, res);
                if (response.ok && timing.timings) await scheduler.recordTiming({ timings: timing.timings }).catch((error) => { scheduler.lastError = error.message; });
            } else res.end();
        }, abort.signal, ['/completion', '/v1/completions', '/v1/chat/completions'].includes(route) ? Number(body?.n_predict ?? body?.max_tokens ?? 1400) : null);
    } catch (error) { answer(res, 409, { error: { message: error.message, type: 'local_residency' } }); }
});
const timer = setInterval(() => { void scheduler.sampleLease(); void scheduler.restoreIfIdle(); }, 2500);
process.on('SIGTERM', () => { void backend.unload().finally(() => { if (comfyChild) comfyChild.kill(); fast.stop(); server.close(); clearInterval(timer); process.exit(0); }); });
server.listen(config.gatewayPort, '127.0.0.1', () => console.log(`Local residency gateway listening on 127.0.0.1:${config.gatewayPort}`));
server.on('error', (error) => { console.error(error.message); clearInterval(timer); process.exitCode = 1; });
