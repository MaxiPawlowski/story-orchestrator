import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeBackend, nativeArgs } from './backend.mjs';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const config = { defaultProfile: 'fast', profiles: { fast: { args: ['--load-mode', 'none'] }, normal: { args: [] } }, reserves: { gpuMiB: 2048 } };

class Backend extends NativeBackend {
    constructor() { super(config); this.calls = []; this.gate = null; }
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
    await backend.forRequest({ messages: [{ role: 'user', content: 'read' }] });
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
    await assert.rejects(backend.forRequest({ messages: [{ role: 'user', content: 'read' }] }), /needs the normal profile, which could not load: Not enough free GPU.*fast is loaded again/);
    assert.equal(backend.profile, 'fast');
    assert.equal(backend.desiredProfile, 'fast');
    assert.equal(backend.fitTarget, 11048);
    await backend.ensure();
    assert.equal(backend.profile, 'fast');
});
