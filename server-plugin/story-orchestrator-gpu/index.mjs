import http from 'node:http';
import { GpuGate } from './gate.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brokerAddress, managedControllerUrl, mountManagedRoutes } from './managed.mjs';

export const info = {
    id: 'story-orchestrator-gpu',
    name: 'Story Orchestrator GPU broker',
    description: 'Coordinates local Artemis requests and ComfyUI renders on one GPU.',
};

let server;
let recovery;
let gate;

export async function init(router) {
    const config = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json'), 'utf8').then(JSON.parse).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return { adapter: 'none' };
    });
    await start(router, config);
}

export async function start(router, config) {
    if (!['none', 'unsloth', 'managed'].includes(config.adapter)) throw new Error('GPU adapter must be none, unsloth or managed.');
    const address = brokerAddress(config);
    if (config.adapter === 'managed') {
        mountManagedRoutes(router, managedControllerUrl(config));
        console.log('[story-orchestrator-gpu] managed adapter; the external controller owns the text port');
        return;
    }
    if (config.adapter === 'unsloth' && (!config.upstream || !config.model || !config.comfyUrl)) throw new Error('Unsloth sharing requires upstream, model and comfyUrl.');
    gate = new GpuGate({ upstream: config.upstream, expected: config.model, comfy: config.comfyUrl });
    const guarding = config.adapter !== 'none';
    router.get('/status', (_req, res) => res.json({ ...gate.status(), adapter: config.adapter, guarding }));
    router.post('/lease', async (_req, res) => {
        if (!guarding) return res.json({ lease: null, brokered: false, warning: 'No local text model is configured; images pass through.' });
        try {
            const lease = await gate.hold();
            if (res.destroyed || res.writableEnded) await gate.release(lease);
            else res.json({ lease });
        } catch (error) {
            res.status(409).json({ error: error instanceof Error ? error.message : 'GPU unavailable' });
        }
    });
    router.post('/renew', (req, res) => res.json({ renewed: gate.renew(req.body?.lease) }));
    router.post('/release', async (req, res) => {
        try { res.json({ released: await gate.release(req.body?.lease) }); }
        catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Image model could not be unloaded.' }); }
    });
    server = http.createServer((req, res) => {
        if (req.url === '/' || req.url === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...gate.status(), adapter: config.adapter, guarding })); }
        else if (guarding) gate.forward(req, res);
        else res.writeHead(503).end('Configure a local text adapter before routing text through this broker.');
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(address.listenPort, address.listenHost, resolve);
    });
    recovery = setInterval(() => { void gate.recover(); }, 15_000);
    console.log(`[story-orchestrator-gpu] local text broker listening on ${address.listenHost}:${address.listenPort}`);
}

export async function exit() {
    if (recovery) clearInterval(recovery);
    gate?.resume();
    if (server) await new Promise((resolve) => server.close(resolve));
}

export default { info, init, exit };
