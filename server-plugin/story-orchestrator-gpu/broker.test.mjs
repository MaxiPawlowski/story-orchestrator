import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { validateConfig } from './config.mjs';
import { start, exit, init } from './index.mjs';
import { createArbiter, controlRequest, leaseRequest, brokerState } from './broker/arbiter.mjs';
import { parseMeminfo, parseNvidiaSmi, probeReserves } from './broker/telemetry.mjs';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'so-gpu-'));
const abs = (name) => path.join(os.tmpdir(), name);

const reading = (freeMiB = 20000, availableMiB = 30000) => ({ at: 'now', highCadence: false,
    gpus: [{ uuid: 'gpu', totalMiB: 24576, usedMiB: 24576 - freeMiB, freeMiB }], host: { totalMiB: 65536, availableMiB, commitFreeMiB: availableMiB } });

function fakeProcesses() {
    const spawned = [];
    const killed = [];
    let next = 1000;
    const spawn = (bin, args) => {
        const child = new EventEmitter();
        child.pid = next++;
        child.exitCode = null;
        child.bin = bin;
        child.args = args;
        child.kill = () => { child.exitCode = 0; child.emit('exit', 0); };
        spawned.push(child);
        return child;
    };
    const killTree = async (pid) => {
        killed.push(pid);
        const child = spawned.find((row) => row.pid === pid);
        if (child && child.exitCode === null) { child.exitCode = 0; child.emit('exit', 0); }
    };
    return { spawn, killTree, spawned, killed };
}

function fakeFetch({ comfy = true, procs } = {}) {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        const target = String(url);
        calls.push([target, options.method ?? 'GET']);
        const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data), headers: new Headers({ 'content-type': 'application/json' }) });
        if (/:8188\//.test(target) || /comfy/.test(target)) {
            if (!comfy) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
            if (target.endsWith('/queue')) return ok({ queue_running: [], queue_pending: [] });
            if (target.endsWith('/system_stats')) return ok({ system: { argv: [] }, devices: [{ torch_vram_total: 0 }] });
            if (target.endsWith('/free')) return ok({});
            return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        }
        if (target.endsWith('/health')) {
            if (procs?.spawned.some((child) => child.exitCode === null && child.bin.endsWith('llama-server'))) return ok({ status: 'ok' });
            throw new Error('connection refused');
        }
        throw new Error(`unexpected ${target}`);
    };
    return { fetchImpl, calls };
}

const superviseConfig = async (overrides = {}) => ({
    adapter: 'supervise', listenPort: 20000 + Math.floor(Math.random() * 20000), stateDir: await tmp(),
    text: { binary: abs('llama-server'), model: abs('model.gguf'), port: 41000 + Math.floor(Math.random() * 1000), profiles: { normal: { args: ['--ctx-size', '8192'] } } },
    comfy: { url: 'http://127.0.0.1:8188' },
    ...overrides,
});

const router = () => {
    const routes = new Map();
    return { routes, get: (route, fn) => routes.set(`GET ${route}`, fn), post: (route, fn) => routes.set(`POST ${route}`, fn) };
};
const call = async (r, key, req = {}) => {
    const res = { code: 200, data: null, destroyed: false, writableEnded: false, status(code) { this.code = code; return this; }, json(data) { this.data = data; this.writableEnded = true; return this; } };
    await r.routes.get(key)({ user: { profile: { admin: false } }, body: {}, params: {}, query: {}, ...req }, res);
    return res;
};
const admin = { user: { profile: { admin: true } } };

test('config: an unknown adapter, a non-loopback bind and a remote switch are refused', () => {
    assert.throws(() => validateConfig({ adapter: 'unsloth' }), /unknown adapter "unsloth"/);
    assert.throws(() => validateConfig({ adapter: 'none', listenHost: '0.0.0.0' }), /loopback/);
    assert.throws(() => validateConfig({ adapter: 'none', allowRemote: true }), /never listens off loopback/);
    assert.throws(() => validateConfig({ adapter: 'observe', model: 'm', upstream: 'http://10.0.0.2:8888', comfyUrl: 'http://127.0.0.1:8188' }), /upstream must be an http loopback/);
    assert.equal(validateConfig({}).adapter, 'none');
});

test('config: supervise takes binaries and models only as absolute paths from the file, and profiles cannot rebind', async () => {
    const good = await superviseConfig();
    assert.equal(validateConfig(good).arbiter.backendPort, good.text.port);
    assert.throws(() => validateConfig({ ...good, text: { ...good.text, binary: 'llama-server' } }), /text.binary must be an absolute path/);
    assert.throws(() => validateConfig({ ...good, text: { ...good.text, profiles: { normal: { args: ['--host', '0.0.0.0'] } } } }), /may not set the host/);
    assert.throws(() => validateConfig({ ...good, text: { ...good.text, port: good.listenPort } }), /differ from listenPort/);
    assert.throws(() => validateConfig({ ...good, comfy: { url: 'http://192.168.1.4:8188' } }), /comfy.url must be an http loopback/);
    assert.throws(() => validateConfig({ ...good, comfy: { supervise: true, python: 'python' } }), /comfy.python must be an absolute/);
    assert.equal(validateConfig(good).arbiter.keepTextResident, false);
    assert.equal(validateConfig(good).arbiter.retainBatches, false);
});

test('controls: a path, a binary or an argument in the request body is refused; profiles are picked by id', () => {
    const config = { profiles: { normal: { args: [] } } };
    assert.throws(() => controlRequest('load', { profile: 'normal', binary: 'C:/evil.exe' }, config), /takes no binary/);
    assert.throws(() => controlRequest('load', { args: ['--x'] }, config), /takes no args/);
    assert.throws(() => controlRequest('load', { profile: '../normal' }, config), /configured profile/);
    assert.throws(() => controlRequest('spawn', {}, config), /Unknown control/);
    assert.deepEqual(controlRequest('load', { profile: 'normal' }, config), { profile: 'normal' });
    assert.throws(() => leaseRequest({ modelFiles: 'x' }), /short list/);
    assert.deepEqual(leaseRequest({ workflowKey: 'k', binary: '/bin/sh', benchmarkMode: 'swap' }), { workflowKey: 'k' });
});

test('telemetry parsers read nvidia-smi and /proc/meminfo; reserves come from a probe when the config names none', () => {
    assert.deepEqual(parseNvidiaSmi('GPU-1, 24576, 1000, 23576, 3\n'), [{ uuid: 'GPU-1', totalMiB: 24576, usedMiB: 1000, freeMiB: 23576, utilization: 3 }]);
    const mem = parseMeminfo('MemTotal: 16777216 kB\nMemAvailable: 8388608 kB\nCommitLimit: 20971520 kB\nCommitted_AS: 10485760 kB\n');
    assert.deepEqual(mem, { totalMiB: 16384, availableMiB: 8192, commitFreeMiB: 10240 });
    assert.deepEqual(probeReserves(reading()), { gpuMiB: 2458, ramMiB: 6554, from: 'probe' });
    assert.deepEqual(probeReserves({ gpus: [{ totalMiB: 6144 }], host: { totalMiB: 8192 } }), { gpuMiB: 1024, ramMiB: 2048, from: 'probe' });
    assert.equal(probeReserves({ gpus: [], host: {} }), null);
});

test('the broker state reads in plain words', () => {
    const base = { phase: 'text', waitingText: 0 };
    assert.equal(brokerState({ scheduler: base, backend: { pid: null }, crashed: null }), 'idle');
    assert.equal(brokerState({ scheduler: base, backend: { pid: 4 }, crashed: null }), 'text-loaded');
    assert.equal(brokerState({ scheduler: { ...base, phase: 'image' }, backend: {}, crashed: null }), 'image');
    assert.equal(brokerState({ scheduler: { ...base, waitingText: 2 }, backend: {}, crashed: null }), 'waiting');
    assert.equal(brokerState({ scheduler: base, backend: {}, crashed: { code: 1 } }), 'degraded');
});

test('fail-open: no config means the none adapter, and a lease passes through', async () => {
    const r = router();
    await start(r, { adapter: 'none', listenPort: 20000 + Math.floor(Math.random() * 20000) });
    try {
        const res = await call(r, 'POST /lease');
        assert.deepEqual([res.data.lease, res.data.brokered], [null, false]);
        assert.equal((await call(r, 'POST /control/:action', { ...admin, params: { action: 'load' } })).code, 404);
    } finally { await exit(); }
    assert.equal(typeof init, 'function');
});

test('supervise: starts nothing at init, loads text on demand, and the routes are scoped (admin-only controls)', async () => {
    const procs = fakeProcesses();
    const { fetchImpl } = fakeFetch({ procs });
    const raw = await superviseConfig({ reserves: { gpuMiB: 1024, ramMiB: 2048 } });
    const r = router();
    await start(r, raw, { spawn: procs.spawn, killTree: procs.killTree, fetch: fetchImpl, memorySnapshot: async () => reading(), fastTelemetry: null, timers: false });
    try {
        assert.equal(procs.spawned.length, 0);
        const status = await call(r, 'GET /status');
        assert.equal(status.data.state, 'idle');
        assert.equal(status.data.mayRetain, false);
        assert.equal(status.data.reservesFrom, 'config');
        assert.equal((await call(r, 'POST /control/:action', { params: { action: 'load' } })).code, 403);
        assert.equal((await call(r, 'GET /status', { user: null })).code, 401);
        const refused = await call(r, 'POST /control/:action', { ...admin, params: { action: 'load' }, body: { binary: '/bin/sh' } });
        assert.equal(refused.code, 400);
        assert.equal(procs.spawned.length, 0);
        const loaded = await call(r, 'POST /control/:action', { ...admin, params: { action: 'load' }, body: { profile: 'normal' } });
        assert.equal(loaded.code, 200, JSON.stringify(loaded.data));
        assert.equal(procs.spawned.length, 1);
        assert.equal(procs.spawned[0].bin, raw.text.binary);
        assert.deepEqual(procs.spawned[0].args.slice(procs.spawned[0].args.indexOf('--host'), procs.spawned[0].args.indexOf('--host') + 2), ['--host', '127.0.0.1']);
        assert.equal(loaded.data.state, 'text-loaded');
        const lease = await call(r, 'POST /lease', { body: { workflowKey: 'scene', width: 1024, height: 1024 } });
        assert.equal(lease.data.brokered, true, JSON.stringify(lease.data));
        assert.equal((await call(r, 'GET /status')).data.state, 'image');
        assert.equal((await call(r, 'POST /release', { body: { lease: lease.data.lease } })).data.released, true);
    } finally { await exit(); }
});

test('exit() stops only the children the broker started, never a server it did not start', async () => {
    const procs = fakeProcesses();
    const foreign = procs.spawn('C:/somewhere/else/other-server');
    const { fetchImpl } = fakeFetch({ procs });
    const r = router();
    await start(r, await superviseConfig({ reserves: { gpuMiB: 1024, ramMiB: 2048 } }), { spawn: procs.spawn, killTree: procs.killTree, fetch: fetchImpl, memorySnapshot: async () => reading(), fastTelemetry: null, timers: false });
    await call(r, 'POST /control/:action', { ...admin, params: { action: 'load' }, body: {} });
    const owned = procs.spawned.at(-1);
    assert.notEqual(owned, foreign);
    await exit();
    assert.deepEqual(procs.killed, [owned.pid]);
    assert.equal(foreign.exitCode, null);
});

test('fail-open: an unreachable observed ComfyUI and unreadable telemetry with no text loaded pass images through', async () => {
    const procs = fakeProcesses();
    const down = fakeFetch({ procs, comfy: false });
    const arbiter = createArbiter(validateConfig(await superviseConfig()).arbiter, { spawn: procs.spawn, killTree: procs.killTree, fetch: down.fetchImpl,
        memorySnapshot: async () => reading(), fastTelemetry: null, timers: false });
    await arbiter.start();
    const through = await arbiter.reserve({});
    assert.deepEqual([through.lease, through.brokered], [null, false]);
    assert.match(through.warning, /only observes it/);
    await arbiter.stop();
    const blind = createArbiter(validateConfig(await superviseConfig()).arbiter, { spawn: procs.spawn, fetch: fakeFetch({ procs }).fetchImpl,
        memorySnapshot: async () => { throw new Error('nvidia-smi missing'); }, fastTelemetry: null, timers: false });
    await blind.start();
    const open = await blind.reserve({});
    assert.equal(open.brokered, false);
    assert.match(open.warning, /nvidia-smi missing/);
    await blind.stop();
});

test('a crashed supervised text server reads degraded, fails text with a reason and lets images through', async () => {
    const procs = fakeProcesses();
    const { fetchImpl } = fakeFetch({ procs });
    const arbiter = createArbiter(validateConfig(await superviseConfig({ reserves: { gpuMiB: 1024, ramMiB: 2048 } })).arbiter, { spawn: procs.spawn, killTree: procs.killTree, fetch: fetchImpl,
        memorySnapshot: async () => reading(), fastTelemetry: null, timers: false });
    await arbiter.start();
    await arbiter.control('load', {});
    const child = procs.spawned.at(-1);
    child.exitCode = 139; child.emit('exit', 139);
    assert.equal((await arbiter.status()).state, 'degraded');
    await assert.rejects(arbiter.text(async () => 'never'), /exited \(code 139\)/);
    const lease = await arbiter.reserve({});
    assert.deepEqual([lease.lease, lease.brokered], [null, false]);
    await arbiter.control('automatic', {});
    assert.notEqual((await arbiter.status()).state, 'degraded');
    await arbiter.stop();
});

test('a text model that is loaded while admission cannot be read is a reasoned refusal, not a pass', async () => {
    const procs = fakeProcesses();
    const { fetchImpl } = fakeFetch({ procs });
    let readable = true;
    const arbiter = createArbiter(validateConfig(await superviseConfig({ reserves: { gpuMiB: 1024, ramMiB: 2048 } })).arbiter, { spawn: procs.spawn, killTree: procs.killTree, fetch: fetchImpl,
        memorySnapshot: async () => { if (!readable) throw new Error('no telemetry'); return reading(); }, fastTelemetry: null, timers: false });
    await arbiter.start();
    await arbiter.control('load', {});
    readable = false;
    await assert.rejects(arbiter.reserve({ workflowKey: 'scene' }));
    await arbiter.stop();
});

test('mayRetain is off by default and answers only for an idle broker within its reserves', async () => {
    const procs = fakeProcesses();
    const { fetchImpl } = fakeFetch({ procs });
    const make = async (retainBatches, free) => {
        const arbiter = createArbiter(validateConfig(await superviseConfig({ reserves: { gpuMiB: 2048, ramMiB: 4096 }, retainBatches })).arbiter,
            { spawn: procs.spawn, fetch: fetchImpl, memorySnapshot: async () => reading(free), fastTelemetry: null, timers: false });
        await arbiter.start();
        const status = await arbiter.status();
        await arbiter.stop();
        return status.mayRetain;
    };
    assert.equal(await make(false, 20000), false);
    assert.equal(await make(true, 20000), true);
    assert.equal(await make(true, 1000), false);
});
