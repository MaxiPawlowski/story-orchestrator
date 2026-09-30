import http from 'node:http';
import { GpuGate } from './gate.mjs';

export const info = {
    id: 'story-orchestrator-gpu',
    name: 'Story Orchestrator GPU broker',
    description: 'Coordinates local Artemis requests and ComfyUI renders on one GPU.',
};

let server;
let recovery;
const gate = new GpuGate();

export async function init(router) {
    router.get('/status', (_req, res) => res.json(gate.status()));
    router.post('/lease', async (_req, res) => {
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
    server = http.createServer((req, res) => gate.forward(req, res));
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(18888, '127.0.0.1', resolve);
    });
    recovery = setInterval(() => { void gate.recover(); }, 15_000);
    console.log('[story-orchestrator-gpu] local text broker listening on 127.0.0.1:18888');
}

export async function exit() {
    if (recovery) clearInterval(recovery);
    gate.resume();
    if (server) await new Promise((resolve) => server.close(resolve));
}

export default { info, init, exit };
