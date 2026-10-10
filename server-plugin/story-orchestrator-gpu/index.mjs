import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GpuGate } from './gate.mjs';
import { managedControllerUrl, mountManagedRoutes } from './managed.mjs';
import { validateConfig } from './config.mjs';
import { createArbiter } from './broker/arbiter.mjs';
import { createGateway } from './broker/gateway.mjs';

export const info = {
    id: 'story-orchestrator-gpu',
    name: 'Story Orchestrator GPU broker',
    description: 'Shares one GPU between a local text model and ComfyUI renders.',
};

let server;
let recovery;
let gate;
let arbiter;
let gateway;

export const isAdmin = (req) => req?.user?.profile?.admin === true;
const hasUser = (req) => req?.user !== undefined && req?.user !== null;

export function killTreeDefault(pid, platform = process.platform) {
    return new Promise((resolve) => {
        if (!pid) return resolve();
        if (platform === 'win32') return execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
        try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
        return resolve();
    });
}

export async function init(router) {
    const raw = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json'), 'utf8').then(JSON.parse).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return { adapter: 'none' };
    });
    await start(router, raw);
}

const errorText = (error, fallback) => error instanceof Error ? error.message : fallback;

function mountSupervised(router, config) {
    router.get('/status', async (req, res) => {
        if (!hasUser(req)) return res.status(401).json({ error: 'Sign in to SillyTavern first.' });
        try { res.json({ ...await arbiter.status({ fresh: req.query?.fresh === '1' }), listenPort: config.listenPort }); }
        catch (error) { res.status(503).json({ adapter: 'supervise', guarding: true, state: 'degraded', error: errorText(error, 'Status unavailable.') }); }
    });
    router.post('/lease', async (req, res) => {
        if (!hasUser(req)) return res.status(401).json({ error: 'Sign in to SillyTavern first.' });
        try {
            const data = await arbiter.reserve(req.body ?? {});
            if (data.lease && (res.destroyed || res.writableEnded)) await arbiter.release(data.lease);
            else res.json(data);
        } catch (error) { if (!res.destroyed && !res.writableEnded) res.status(409).json({ error: errorText(error, 'GPU unavailable') }); }
    });
    router.post('/renew', (req, res) => {
        if (!hasUser(req)) return res.status(401).json({ error: 'Sign in to SillyTavern first.' });
        res.json({ renewed: arbiter.renew(req.body?.lease) });
    });
    router.post('/release', async (req, res) => {
        if (!hasUser(req)) return res.status(401).json({ error: 'Sign in to SillyTavern first.' });
        try { res.json({ released: await arbiter.release(req.body?.lease) }); }
        catch (error) { res.status(409).json({ error: errorText(error, 'The image work could not be released.') }); }
    });
    router.post('/control/:action', async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Broker controls are admin-only.' });
        try { res.json(await arbiter.control(req.params?.action, req.body ?? {})); }
        catch (error) { res.status(/Unknown control|takes no|configured profile|must be/.test(errorText(error, '')) ? 400 : 409).json({ error: errorText(error, 'The control failed.') }); }
    });
}

export async function start(router, raw, deps = {}) {
    const config = validateConfig(raw);
    if (config.adapter === 'managed') {
        mountManagedRoutes(router, managedControllerUrl(config));
        console.log('[story-orchestrator-gpu] managed adapter (kept one release as a bridge); the external controller owns the text port');
        return;
    }
    if (config.adapter === 'supervise') {
        arbiter = createArbiter(config.arbiter, { killTree: killTreeDefault, ...deps });
        await arbiter.start();
        mountSupervised(router, config);
        gateway = createGateway({ arbiter, config: config.arbiter, fetchImpl: deps.fetch ?? fetch });
        await gateway.listen(config.listenPort, config.listenHost);
        console.log(`[story-orchestrator-gpu] in-process broker; text gateway on ${config.listenHost}:${config.listenPort}, text loads on demand`);
        return;
    }
    gate = new GpuGate({ upstream: config.upstream, expected: config.model, comfy: config.comfyUrl });
    const guarding = config.adapter === 'observe';
    const statusBody = () => ({ ...gate.status(), adapter: config.adapter, guarding, state: !guarding ? 'idle' : gate.phase === 'image' ? 'image' : gate.waiting.length ? 'waiting' : 'text-loaded', mayRetain: false });
    router.get('/status', (_req, res) => res.json(statusBody()));
    router.post('/lease', async (_req, res) => {
        if (!guarding) return res.json({ lease: null, brokered: false, warning: 'No local text model is configured; images pass through.' });
        try {
            const lease = await gate.hold();
            if (res.destroyed || res.writableEnded) await gate.release(lease);
            else res.json({ lease });
        } catch (error) {
            res.status(409).json({ error: errorText(error, 'GPU unavailable') });
        }
    });
    router.post('/renew', (req, res) => res.json({ renewed: gate.renew(req.body?.lease) }));
    router.post('/release', async (req, res) => {
        try { res.json({ released: await gate.release(req.body?.lease) }); }
        catch (error) { res.status(409).json({ error: errorText(error, 'Image model could not be unloaded.') }); }
    });
    router.post('/control/:action', (_req, res) => res.status(404).json({ error: 'Controls exist only when the broker supervises the text server.' }));
    server = http.createServer((req, res) => {
        if (req.url === '/' || req.url === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(statusBody())); }
        else if (guarding) gate.forward(req, res);
        else res.writeHead(503).end('Configure a local text adapter before routing text through this broker.');
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.listenPort, config.listenHost, resolve);
    });
    if (guarding) recovery = setInterval(() => { void gate.recover(); }, 15_000);
    console.log(`[story-orchestrator-gpu] ${config.adapter} adapter; text proxy on ${config.listenHost}:${config.listenPort}`);
}

export async function exit() {
    if (recovery) clearInterval(recovery);
    recovery = null;
    gate?.resume();
    gate = null;
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
    if (gateway) await gateway.close();
    gateway = null;
    if (arbiter) await arbiter.stop();
    arbiter = null;
}

export default { info, init, exit };
