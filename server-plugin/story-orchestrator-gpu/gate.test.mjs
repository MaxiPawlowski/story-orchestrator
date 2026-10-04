import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { GpuGate } from './gate.mjs';

const listen = async (server) => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
};
const close = (server) => new Promise((resolve) => server.close(resolve));

let upstream;
let proxy;
let comfy;
let upstreamUrl;
let proxyUrl;
let comfyUrl;
let gate;
let completeText;
let statusModel;
let unloadBodies;

before(async () => {
    statusModel = 'TheDrummer/Artemis-31B-v1.1-GGUF:Q4_K_M';
    unloadBodies = [];
    upstream = http.createServer(async (req, res) => {
        if (req.url === '/v1/completions') {
            if (!completeText) {
                completeText = () => res.writeHead(200).end('first reply');
                return;
            }
            res.writeHead(200).end('later reply');
            return;
        }
        if (req.url === '/api/inference/status') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ active_model: statusModel, loading: [] }));
        if (req.url === '/api/inference/active-generations') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ count: 0 }));
        if (req.url === '/api/inference/unload') {
            const parts = [];
            for await (const part of req) parts.push(part);
            unloadBodies.push(JSON.parse(Buffer.concat(parts).toString('utf8')));
            statusModel = null;
            return res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"unloaded"}');
        }
        res.writeHead(404).end();
    });
    upstreamUrl = await listen(upstream);
    comfy = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"queue_running":[],"queue_pending":[]}');
    });
    comfyUrl = await listen(comfy);
    gate = new GpuGate({ upstream: upstreamUrl, comfy: comfyUrl, sleep: async () => {} });
    proxy = http.createServer((req, res) => gate.forward(req, res));
    proxyUrl = await listen(proxy);
});

after(async () => {
    gate.resume();
    await close(proxy);
    await close(upstream);
    await close(comfy);
});

test('refuses image ownership before an authenticated text request', async () => {
    await assert.rejects(gate.hold(), /No authenticated Artemis request/);
    assert.equal(gate.status().phase, 'text');
});

test('drains the active text request before unloading; queues new text until image release', async () => {
    const first = fetch(`${proxyUrl}/v1/completions`, { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: '{}' });
    while (!completeText) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(gate.status().activeText, 1);
    const holding = gate.hold();
    const second = fetch(`${proxyUrl}/v1/completions`, { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: '{}' });
    while (gate.status().waitingText === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(unloadBodies.length, 0);
    completeText();
    assert.equal(await (await first).text(), 'first reply');
    const lease = await holding;
    assert.equal(gate.status().phase, 'image');
    assert.deepEqual(unloadBodies, [{ model_path: 'TheDrummer/Artemis-31B-v1.1-GGUF', force_cancel_active: false }]);
    assert.equal(gate.status().waitingText, 1);
    assert.equal(await gate.release('wrong lease'), false);
    assert.equal(await gate.release(lease), true);
    assert.equal(await (await second).text(), 'later reply');
    assert.equal(gate.status().phase, 'text');
});

test('does not unload another model, and releases queued text after a refusal', async () => {
    statusModel = 'another-model';
    await assert.rejects(gate.hold(), /different text model/);
    assert.equal(gate.status().phase, 'text');
    assert.equal(unloadBodies.length, 1);
});

test('a lost browser lease releases after timeout only once ComfyUI is idle', async () => {
    let now = 0;
    let running = true;
    const calls = [];
    const abandoned = new GpuGate({ now: () => now, sleep: async () => {}, fetchImpl: async (url, options) => {
        calls.push({ url, body: options?.body });
        return Response.json({ queue_running: running ? ['render'] : [], queue_pending: [] });
    } });
    abandoned.phase = 'image';
    abandoned.lease = 'abandoned';
    abandoned.leaseAt = 1;
    now = 60_002;
    assert.equal(await abandoned.recover(), false);
    assert.equal(calls.filter(({ url }) => url.endsWith('/interrupt')).length, 0);
    now = 600_002;
    assert.equal(await abandoned.recover(), false);
    assert.equal(abandoned.status().phase, 'image');
    assert.equal(calls.filter(({ url }) => url.endsWith('/interrupt')).length, 0);
    running = false;
    assert.equal(await abandoned.recover(), true);
    assert.equal(abandoned.status().phase, 'text');
    assert.equal(calls.filter(({ url }) => url.endsWith('/free')).length, 1);
    assert.deepEqual(JSON.parse(calls.find(({ url }) => url.endsWith('/free')).body), { unload_models: true, free_memory: true });
});

test('an idle abandoned image lease frees the cache before text resumes at the short timeout', async () => {
    let now = 59_000;
    const calls = [];
    const abandoned = new GpuGate({ now: () => now, sleep: async () => {}, fetchImpl: async (url) => {
        calls.push(url);
        return Response.json({ queue_running: [], queue_pending: [] });
    } });
    abandoned.phase = 'image';
    abandoned.lease = 'abandoned';
    abandoned.leaseAt = 1;
    assert.equal(await abandoned.recover(), false);
    assert.deepEqual(calls, []);
    now = 60_002;
    assert.equal(await abandoned.recover(), true);
    assert.equal(calls.filter((url) => url.endsWith('/free')).length, 1);
    assert.equal(abandoned.status().phase, 'text');
});

test('recovery does not resume text over an image model that ComfyUI could not free', async () => {
    let now = 600_002;
    const abandoned = new GpuGate({ now: () => now, sleep: async () => {}, fetchImpl: async (url) =>
        url.endsWith('/free') ? Response.json({}, { status: 500 }) : Response.json({ queue_running: [], queue_pending: [] }) });
    abandoned.phase = 'image';
    abandoned.lease = 'abandoned';
    abandoned.leaseAt = 1;
    assert.equal(await abandoned.recover(), false);
    assert.equal(abandoned.status().phase, 'image');
    now += 15_000;
    assert.equal(await abandoned.recover(), false);
});

test('a renewed lease survives an idle queue until its heartbeats stop', async () => {
    let now = 1;
    const calls = [];
    const batch = new GpuGate({ now: () => now, sleep: async () => {}, fetchImpl: async (url) => {
        calls.push(url);
        return Response.json({ queue_running: [], queue_pending: [] });
    } });
    batch.phase = 'image';
    batch.lease = 'batch';
    batch.leaseAt = 1;
    assert.equal(batch.renew('other'), false);
    for (now = 30_000; now <= 3_600_000; now += 30_000) {
        assert.equal(batch.renew('batch'), true);
        assert.equal(await batch.recover(), false);
    }
    assert.equal(calls.length, 0);
    now = 3_600_000 + 119_000;
    assert.equal(await batch.recover(), false);
    now += 2_000;
    assert.equal(await batch.recover(), true);
    assert.equal(batch.status().phase, 'text');
    assert.equal(batch.renew('batch'), false);
});

test('a renewed lease is never interrupted while it keeps renewing', async () => {
    let now = 1;
    const calls = [];
    const batch = new GpuGate({ now: () => now, sleep: async () => {}, fetchImpl: async (url) => {
        calls.push(url);
        return Response.json({ queue_running: ['render'], queue_pending: [] });
    } });
    batch.phase = 'image';
    batch.lease = 'batch';
    batch.leaseAt = 1;
    for (now = 30_000; now <= 1_800_000; now += 30_000) {
        batch.renew('batch');
        assert.equal(await batch.recover(), false);
    }
    assert.equal(calls.filter((url) => url.endsWith('/interrupt')).length, 0);
});
