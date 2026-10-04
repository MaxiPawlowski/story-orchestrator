import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NativeBackend } from './backend.mjs';
import { ResidencyScheduler } from './scheduler.mjs';
import { memorySnapshot } from './telemetry.mjs';

const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/local/controller.mjs <config.json>');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
await fs.mkdir(config.stateDir, { recursive: true });
const footprintsPath = path.join(config.stateDir, 'footprints.json');
let footprints = {};
try { footprints = JSON.parse(await fs.readFile(footprintsPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let telemetry = null;
let telemetryAt = 0;
let telemetryPending;
const snapshot = async () => {
    if (Date.now() - telemetryAt < 2500 && telemetry) return telemetry;
    telemetryPending ??= memorySnapshot().then((data) => { telemetry = data; telemetryAt = Date.now(); return data; }).finally(() => { telemetryPending = null; });
    return telemetryPending;
};
const jsonFetch = async (route, options = {}) => {
    const response = await fetch(`${config.comfyUrl}${route}`, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`ComfyUI ${route} answered ${response.status}`);
    const raw = await response.text();
    return raw ? JSON.parse(raw) : {};
};
let comfyChild = null;
const startComfy = async () => {
    try { await jsonFetch('/system_stats'); return; } catch {}
    if (!comfyChild) {
        const log = await fs.open(path.join(config.stateDir, `comfy-${Date.now()}.log`), 'a');
        comfyChild = spawn(config.comfyPython, ['main.py', '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch', '--cache-ram', '8', '--reserve-vram', '2'], { cwd: config.comfyRoot, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
        const child = comfyChild;
        child.once('error', (error) => { console.error(error.message); comfyChild = null; void log.close(); });
        child.once('exit', () => { if (comfyChild === child) comfyChild = null; void log.close(); });
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
const freeImages = async () => {
    await jsonFetch('/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const stats = await jsonFetch('/system_stats');
        if ((stats.devices ?? []).every((device) => device.torch_vram_total < 512 * 1024 * 1024)) { telemetryAt = 0; return; }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('ComfyUI accepted free but its model memory has not been released; text will not race the release.');
};
const scheduler = new ResidencyScheduler({ config, backend, snapshot, startComfy,
    queue: () => jsonFetch('/queue'),
    freeImages,
    saveFootprints: (data) => fs.writeFile(footprintsPath, JSON.stringify(data, null, 2)), footprints });
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
        if (req.method === 'GET' && ['/', '/status', '/health'].includes(route)) { answer(res, 200, { ...scheduler.status(), telemetry: await snapshot(), adapter: 'managed', guarding: true, pid: process.pid, configFile, maxContext: 98304 }); return; }
        if (req.method === 'POST' && ['/lease', '/renew', '/release'].includes(route)) {
            const body = await readBody(req);
            const data = route === '/lease' ? await scheduler.reserve(body) : route === '/renew' ? { renewed: scheduler.renew(body.lease) } : { released: await scheduler.release(body.lease) };
            answer(res, 200, data); return;
        }
        if (req.method === 'POST' && route.startsWith('/control/')) {
            const body = await readBody(req);
            if (route === '/control/load') await scheduler.load(body.profile ?? config.defaultProfile);
            else if (route === '/control/unload') await scheduler.unload();
            else if (route === '/control/automatic') scheduler.resume();
            else if (route === '/control/restore') await scheduler.restoreNow();
            else if (route === '/control/start-comfy') await startComfy();
            else if (route === '/control/free-images') { const queue = await jsonFetch('/queue'); if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI is busy; no cache will be freed.'); await scheduler.freeImages(); }
            else if (route === '/control/stop') {
                if (scheduler.activeText || scheduler.lease || scheduler.imagePending) throw new Error('Finish the active work before stopping the controller.');
                closing = true; await backend.unload(); if (comfyChild) comfyChild.kill();
                answer(res, 200, { stopped: true }); server.close(() => process.exit(0)); return;
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
            if (body && ['/completion', '/v1/completions'].includes(route)) await backend.forRequest(body, abort.signal);
            else await backend.load(backend.profile ?? config.defaultProfile);
            const response = await fetch(`${backend.url}${route}`, { method: req.method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: abort.signal });
            if (res.destroyed) return;
            res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
            if (response.body) await pipeline(Readable.fromWeb(response.body), res); else res.end();
        }, abort.signal);
    } catch (error) { answer(res, 409, { error: { message: error.message, type: 'local_residency' } }); }
});
const timer = setInterval(() => { void scheduler.sampleLease(); void scheduler.restoreIfIdle(); }, 2500);
process.on('SIGTERM', () => { void backend.unload().finally(() => { if (comfyChild) comfyChild.kill(); server.close(); clearInterval(timer); process.exit(0); }); });
server.listen(config.gatewayPort, '127.0.0.1', () => console.log(`Local residency gateway listening on 127.0.0.1:${config.gatewayPort}`));
server.on('error', (error) => { console.error(error.message); clearInterval(timer); process.exitCode = 1; });
