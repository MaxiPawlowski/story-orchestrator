import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextRefusal, NativeBackend, nativeArgs, profileContext, profileGpuMiB, slotFor, slots } from './backend.mjs';
import { withControllerDefaults } from './controllerStatus.mjs';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const config = { defaultProfile: 'fast', maxContext: 98304, profiles: { fast: { args: ['--ctx-size', '32768', '--load-mode', 'none'] }, normal: { args: ['--ctx-size', '98304'] } }, reserves: { gpuMiB: 2048 } };

class Backend extends NativeBackend {
    constructor(options = config) { super(options); this.calls = []; this.gate = null; this.tokens = 100; }
    async promptTokens() { return this.tokens; }
    async start(name, profile, fitTarget) {
        this.calls.push({ name, fitTarget });
        if (this.gate) await this.gate.promise;
        this.child = { pid: 42 }; this.profile = name; this.fitTarget = fitTarget;
    }
    async stopOwned() { this.calls.push('unload'); this.child = null; this.profile = null; this.fitTarget = null; }
}

test('auxiliary and extraction readiness preserves the resident fit target without reloading', async () => {
    const backend = new Backend();
    await backend.load('fast', { fitTarget: 11048 });
    await backend.ensure();
    await backend.forRequest({ messages: [{ role: 'user', content: 'read' }], max_tokens: 400 });
    assert.deepEqual(backend.calls, [{ name: 'fast', fitTarget: 11048 }]);
    backend.tokens = 40000;
    await backend.forRequest({ prompt: 'long', n_predict: 400 });
    assert.deepEqual(backend.calls, [{ name: 'fast', fitTarget: 11048 }, { name: 'normal', fitTarget: 11048 }]);
    await backend.ensure('normal');
    assert.equal(backend.calls.length, 2);
});

test('three concurrent loads serialize every transition, not just the first waiter', async () => {
    const backend = new Backend(); backend.gate = deferred();
    const first = backend.load('fast', { fitTarget: 11048 });
    const second = backend.load('normal', { fitTarget: 11048 });
    const third = backend.load('fast');
    await Promise.resolve(); assert.equal(backend.calls.length, 1);
    backend.gate.resolve(); await Promise.all([first, second, third]);
    assert.deepEqual(backend.calls, [{ name: 'fast', fitTarget: 11048 }, { name: 'normal', fitTarget: 11048 }, { name: 'fast', fitTarget: null }]);
});

test('unload waits for an owned load and clears its shed intent', async () => {
    const backend = new Backend(); backend.gate = deferred();
    const load = backend.load('fast', { fitTarget: 11048 });
    const unload = backend.unload();
    await Promise.resolve(); assert.equal(backend.calls.length, 1);
    backend.gate.resolve(); await load; await unload;
    assert.equal(backend.fitTarget, null); assert.equal(backend.child, null);
});

test('a loading-mode experiment replaces the profile setting without changing context or KV', () => {
    const args = nativeArgs({ ...config, modelLoadMode: 'mmap' }, { args: ['--load-mode', 'none', '--ctx-size', '98304'] });
    assert.equal(args.filter((arg) => arg === '--load-mode').length, 1);
    assert.equal(args[args.indexOf('--load-mode') + 1], 'mmap');
    assert.equal(args[args.indexOf('--ctx-size') + 1], '98304');
    assert.equal(args[args.indexOf('--cache-type-k') + 1], 'q8_0');
});

test('a profile switch that cannot load puts the previous profile back and refuses only that request', async () => {
    const backend = new Backend();
    await backend.load('fast', { fitTarget: 11048 });
    const start = backend.start.bind(backend);
    backend.start = async (name, profile, fitTarget) => {
        if (name === 'normal') { backend.calls.push({ name, fitTarget }); throw new Error('Not enough free GPU/physical RAM for this profile while preserving desktop headroom.'); }
        return start(name, profile, fitTarget);
    };
    backend.tokens = 40000;
    await assert.rejects(backend.forRequest({ prompt: 'long', n_predict: 400 }), /needs the normal profile, which could not load: Not enough free GPU.*fast is loaded again/);
    assert.equal(backend.profile, 'fast');
    assert.equal(backend.desiredProfile, 'fast');
    assert.equal(backend.fitTarget, 11048);
    await backend.ensure();
    assert.equal(backend.profile, 'fast');
});

test('prompt + reply under the loaded context stays (llama-server keeps one position), one token more moves up, no gateway margin', async () => {
    const backend = new Backend();
    await backend.load('fast');
    backend.tokens = 32768 - 400 - 1;
    await backend.forRequest({ prompt: 'x', n_predict: 400 });
    assert.equal(backend.profile, 'fast');
    backend.tokens += 1;
    await backend.forRequest({ prompt: 'x', n_predict: 400 });
    assert.equal(backend.profile, 'normal');
});

test('over the served context the request is refused cleanly and nothing is loaded (F20)', async () => {
    const backend = new Backend({ ...config, maxContext: 32768 });
    await backend.load('fast');
    backend.tokens = 32368;
    const error = await backend.forRequest({ prompt: 'x', n_predict: 400 }).catch((caught) => caught);
    assert.ok(error instanceof ContextRefusal);
    assert.equal(error.context, 32768);
    assert.equal(error.promptTokens, 32368);
    assert.match(error.message, /needs 32768 tokens .*under the 32768-token context this machine serves.*nothing was loaded/);
    assert.deepEqual(backend.calls, [{ name: 'fast', fitTarget: null }]);
    assert.equal(backend.servedContext(), 32768);
});

test('a profile that failed to load is not retried for context; later requests refuse at once', async () => {
    const backend = new Backend();
    await backend.load('fast');
    const start = backend.start.bind(backend);
    backend.start = async (name, profile, fitTarget) => {
        if (name === 'normal') { backend.calls.push({ name, fitTarget }); throw new Error('Not enough free GPU/physical RAM for this profile while preserving desktop headroom.'); }
        return start(name, profile, fitTarget);
    };
    backend.tokens = 40000;
    await assert.rejects(backend.forRequest({ prompt: 'x', n_predict: 400 }), /needs the normal profile/);
    const before = backend.calls.length;
    const error = await backend.forRequest({ prompt: 'x', n_predict: 400 }).catch((caught) => caught);
    assert.ok(error instanceof ContextRefusal);
    assert.equal(error.context, 32768);
    assert.equal(backend.calls.length, before);
    assert.equal(backend.servedContext(), 32768);
});

test('profile context reads --ctx-size, and an unset maxContext is the default profile context', () => {
    assert.equal(profileContext({ args: ['--ctx-size', '40960'] }), 40960);
    assert.equal(profileContext({ args: [] }), null);
    assert.equal(withControllerDefaults({ ...config, maxContext: undefined }).maxContext, 32768);
});

test('the fit margin is added to the fit target llama-server plans for, never to the reserve it is checked against', () => {
    const args = nativeArgs({ ...config, model: 'm', backendPort: 1, modelAlias: 'a', fitMarginMiB: 512 }, { args: [] });
    assert.equal(args[args.indexOf('--fit-target') + 1], '2560');
    assert.equal(nativeArgs({ ...config, model: 'm', backendPort: 1, modelAlias: 'a' }, { args: [] }, 11048)[nativeArgs({ ...config, model: 'm', backendPort: 1, modelAlias: 'a' }, { args: [] }, 11048).indexOf('--fit-target') + 1], '11048');
});

async function fittedBackend(t, { gpu = 1700, ram = 12000, layers = 'auto', alwaysShort = false } = {}) {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'so-fit-'));
    let child = null;
    const calls = [];
    const backend = new NativeBackend({ ...config, stateDir, backendPort: 18889, model: 'fixture', modelAlias: 'fixture',
        fitMarginMiB: 512, admissionWindowMs: 0, reserves: { gpuMiB: 2048, ramMiB: 4096 },
        profiles: { fast: { args: ['--ctx-size', '32768', '--n-gpu-layers', layers], estimatedGpuMiB: 20500, estimatedRamMiB: 3000 } } }, {
        snapshot: async () => ({ host: { availableMiB: child ? ram : 16000, commitFreeMiB: 30000 },
            gpus: [{ freeMiB: child ? (alwaysShort || calls.length === 1 ? gpu : 2700) : 24000 }] }),
        fetch: async () => { if (!child) throw new Error('not listening'); return { ok: true }; },
        spawn: (_binary, args) => {
            calls.push(args);
            const next = new EventEmitter();
            next.pid = calls.length; next.exitCode = null;
            next.kill = () => { child = null; next.exitCode = 0; next.emit('exit', 0); };
            child = next;
            return next;
        },
    });
    t.after(async () => { await backend.unload(); await rm(stateDir, { recursive: true, force: true }); });
    return { backend, calls };
}

test('measured GPU reserve misses refit automatic layers once and retain the correction across image handoffs', async (t) => {
    const { backend, calls } = await fittedBackend(t);
    await backend.load('fast');
    const targets = () => calls.map((args) => Number(args[args.indexOf('--fit-target') + 1]));
    assert.deepEqual(targets(), [2560, 3420]);
    assert.equal(backend.status().fitTargetMiB, null);
    assert.equal(backend.status().fitCorrectionMiB, 860);
    assert.equal(backend.status().lastFitCorrection.gpuShortMiB, 348);
    assert.equal(backend.status().lastError, null);
    await backend.ensure();
    assert.equal(calls.length, 2);
    await backend.unload(); await backend.load('fast');
    assert.deepEqual(targets(), [2560, 3420, 3420]);
    assert.equal(calls.every((args) => args[args.indexOf('--ctx-size') + 1] === '32768'), true);
    assert.deepEqual(backend.config.reserves, { gpuMiB: 2048, ramMiB: 4096 });
});

test('a failed refit stays bounded and stops its owned text backend', async (t) => {
    const { backend, calls } = await fittedBackend(t, { alwaysShort: true });
    await assert.rejects(backend.load('fast'), /violates the measured memory reserve/);
    assert.equal(calls.length, 2);
    assert.equal(backend.status().pid, null);
    assert.equal(backend.status().loading, false);
});

test('host RAM reserve misses and fixed layer profiles refuse without a GPU refit', async (t) => {
    for (const options of [{ ram: 3500 }, { layers: 'all' }]) {
        const { backend, calls } = await fittedBackend(t, options);
        await assert.rejects(backend.load('fast'), /violates the measured memory reserve/);
        assert.equal(calls.length, 1);
        assert.equal(backend.status().pid, null);
        assert.equal(backend.status().lastFitCorrection, null);
    }
});

test('a configured MTP drafter adds the draft flags, its VRAM estimate and its status; off by default', () => {
    const base = nativeArgs({ ...config, backendPort: 1, model: 'm', modelAlias: 'a' }, config.profiles.fast);
    assert.equal(base.includes('--model-draft'), false);
    assert.equal(base[base.indexOf('--cache-ram') + 1], '512');
    assert.equal(base.includes('--ctx-checkpoints'), false);
    const spec = { ...config, backendPort: 1, model: 'm', modelAlias: 'a', speculative: { model: 'C:/m/mtp.gguf' }, cacheRamMiB: 6144, ctxCheckpoints: 3 };
    const args = nativeArgs(spec, config.profiles.fast);
    assert.deepEqual(args.slice(args.indexOf('--model-draft'), args.indexOf('--model-draft') + 6), ['--model-draft', 'C:/m/mtp.gguf', '--spec-type', 'draft-mtp', '--spec-draft-n-max', '2']);
    assert.equal(args[args.indexOf('--cache-ram') + 1], '6144');
    assert.equal(args[args.indexOf('--ctx-checkpoints') + 1], '3');
    assert.ok(args.indexOf('--model-draft') < args.indexOf('--fit'));
    assert.equal(Number(args[args.indexOf('--fit-target') + 1]) - Number(base[base.indexOf('--fit-target') + 1]), 900, 'llama-server fits without the drafter, so its VRAM is added to the target');
    assert.equal(profileGpuMiB(spec, { estimatedGpuMiB: 20500 }), 21400);
    assert.equal(profileGpuMiB({ ...spec, speculative: { ...spec.speculative, enabled: false } }, { estimatedGpuMiB: 20500 }), 20500);
    assert.equal(new NativeBackend(spec).status().speculative, 'draft-mtp2');
    assert.equal(new NativeBackend(config).status().speculative, null);
    assert.throws(() => nativeArgs({ ...spec, speculative: { nMax: 2 } }, config.profiles.fast), /speculative.model/);
    assert.throws(() => nativeArgs({ ...spec, speculative: { model: 'x', nMax: 0 } }, config.profiles.fast), /nMax/);
});

test('pinned slots set --parallel, add the extra slot to the VRAM estimate but not the fit target, and pick chat or side by streaming', () => {
    const base = { ...config, backendPort: 1, model: 'm', modelAlias: 'a' };
    const pinned = { ...base, slots: { count: 2 } };
    const args = nativeArgs(pinned, config.profiles.fast);
    assert.equal(args[args.indexOf('--parallel') + 1], '2');
    const plain = nativeArgs(base, config.profiles.fast);
    assert.equal(plain[plain.indexOf('--parallel') + 1], '1');
    assert.ok(args.includes('--slot-save-path'), 'llama-server answers /slots erase only with a slot save path');
    assert.equal(plain.includes('--slot-save-path'), false);
    assert.equal(args[args.indexOf('--fit-target') + 1], plain[plain.indexOf('--fit-target') + 1], 'llama-server fit measures its own KV slots');
    assert.equal(profileGpuMiB(pinned, { estimatedGpuMiB: 20500 }), 20900);
    assert.equal(slotFor(pinned, { stream: true }), 0);
    assert.equal(slotFor(pinned, { stream: false }), 1);
    assert.equal(slotFor(base, { stream: true }), null);
    assert.equal(slots({ slots: { count: 1 } }), null);
    assert.equal(slots({ slots: { count: 2, enabled: false } }), null);
    assert.throws(() => slots({ slots: { count: 2, side: 2 } }), /slots.side/);
    assert.throws(() => slots({ slots: { count: 9 } }), /slots.count/);
    assert.equal(new NativeBackend(pinned).status().slots.count, 2);
    assert.equal(new NativeBackend(base).status().slots, null);
});

test('a pinned request that would overflow the shared context with the other slot erases that slot first', async () => {
    const pinned = { ...config, slots: { count: 2 } };
    const backend = new Backend(pinned);
    const erased = [];
    backend.fetch = async (url, init) => { erased.push([url, init.method]); return new Response('{}'); };
    backend.tokens = 3000;
    await backend.forRequest({ prompt: 'side', n_predict: 100 }, undefined, 1);
    backend.tokens = 20000;
    await backend.forRequest({ prompt: 'chat', n_predict: 1000 }, undefined, 0);
    assert.deepEqual(erased, []);
    assert.deepEqual(backend.status().slots.held, { 0: 21000, 1: 3100 });
    backend.tokens = 29000;
    await backend.forRequest({ prompt: 'chat', n_predict: 1000 }, undefined, 0);
    assert.deepEqual(erased, [['http://127.0.0.1:undefined/slots/1?action=erase', 'POST']]);
    assert.deepEqual(backend.status().slots.held, { 0: 30000 });
    assert.equal(backend.status().slots.erased, 1);
    assert.deepEqual(backend.status().slots.requests, { chat: 2, side: 1 });
    assert.equal(backend.status().slots.side, 1);
    backend.fetch = async () => new Response('{}', { status: 501 });
    backend.tokens = 3000;
    await assert.rejects(backend.forRequest({ prompt: 'side', n_predict: 100 }, undefined, 1), /Could not free slot 0/);
});
