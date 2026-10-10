import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextRefusal, NativeBackend, nativeArgs, profileContext } from './backend.mjs';
import { withControllerDefaults } from './controllerStatus.mjs';

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
