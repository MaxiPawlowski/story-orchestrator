import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createControllerStop } from './controllerStop.mjs';
import { controlError, controlLine } from './controlLine.mjs';
import { ResidencyScheduler } from '../../server-plugin/story-orchestrator-gpu/broker/scheduler.mjs';
import { controlRequest } from '../../server-plugin/story-orchestrator-gpu/broker/arbiter.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const reading = { highCadence: true, gpus: [{ usedMiB: 2576, freeMiB: 22000 }], host: { availableMiB: 24000, commitFreeMiB: 80000 } };

function wedged() {
    const calls = [];
    const backend = { profile: 'fast', desiredProfile: 'fast', fitTarget: null,
        status: () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: backend.desiredProfile, fitTargetMiB: backend.fitTarget }),
        unload: async () => { calls.push('unload'); backend.profile = null; },
        load: async (name) => { calls.push('load'); backend.profile = name; } };
    const scheduler = new ResidencyScheduler({ config: { maxQueue: 4, queueTimeoutMs: 60000, reserves: { gpuMiB: 2048, ramMiB: 4096 }, imageCacheMode: 'evict', idleRestoreMs: 0 },
        backend, snapshot: async () => reading, queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => {}, startComfy: async () => {}, saveFootprints: async () => {} });
    scheduler.imagePending = true;
    return { scheduler, calls, backend };
}

function stopper(scheduler, overrides = {}) {
    const calls = [];
    const stop = createControllerStop({ scheduler, ownedChildren: () => [{ pid: 7 }], comfyQueue: async () => ({ queue_running: [], queue_pending: [] }),
        performance: { stop: () => calls.push('performance') }, stopArbiter: async () => { calls.push('arbiter'); }, close: async () => { calls.push('close'); },
        exit: (code) => calls.push(`exit ${code}`), schedule: (run) => run(), graceMs: 50, ...overrides });
    return { stop, calls };
}

test('plan 22 wedge: a stuck image lease plus an active reply refuses plain unload, and unload --force drops text anyway and says what it cut', async () => {
    const { scheduler, calls } = wedged();
    const gate = deferred();
    scheduler.imagePending = false;
    const reply = scheduler.text(() => gate.promise);
    scheduler.imagePending = true;
    await assert.rejects(scheduler.unload(), /active work/);
    const result = await scheduler.unload({ force: true, waitMs: 50 });
    assert.deepEqual(calls, ['unload']);
    assert.equal(result.forced, true);
    assert.deepEqual(result.interrupted, { activeText: 1, imageLease: false, imagePending: true, imageQueued: false });
    assert.equal(scheduler.status().phase, 'reserving');
    await assert.rejects(scheduler.text(async () => {}), /manually unloaded/);
    gate.resolve(); await reply;
});

test('unload --force waits for a reply that ends inside the wait and then reports nothing cut', async () => {
    const { scheduler } = wedged();
    scheduler.imagePending = false;
    const gate = deferred();
    const reply = scheduler.text(() => gate.promise);
    setTimeout(() => gate.resolve(), 20);
    const result = await scheduler.unload({ force: true, waitMs: 2000 });
    await reply;
    assert.equal(result.interrupted.activeText, 0);
});

test('unload --force never races a running text load: it refuses while a residency change holds the scheduler', async () => {
    const { scheduler, calls } = wedged();
    scheduler.imagePending = false;
    const gate = deferred();
    const loading = scheduler.exclusive(() => gate.promise);
    await assert.rejects(scheduler.unload({ force: true, waitMs: 30 }), /still running/);
    assert.deepEqual(calls, []);
    gate.resolve(); await loading;
});

test('plan 22 wedge: stop works under a stuck image lease after the wait, holds new text during it, and reports it was forced', async () => {
    const { scheduler } = wedged();
    const { stop, calls } = stopper(scheduler);
    const result = await stop({});
    assert.equal(result.forced, true);
    assert.equal(result.interrupted.imagePending, true);
    assert.equal(scheduler.manualHold, true);
    await settle();
    assert.deepEqual(calls, ['performance', 'arbiter', 'close', 'exit 0']);
});

test('stop on an idle controller is not forced, and stop still refuses a running ComfyUI job unless --force', async () => {
    const { scheduler } = wedged();
    scheduler.imagePending = false;
    assert.equal((await stopper(scheduler).stop()).forced, false);
    const busy = stopper(scheduler, { comfyQueue: async () => ({ queue_running: [[1, 'p']], queue_pending: [] }) });
    await assert.rejects(busy.stop({}), /existing job.*--force/);
    assert.deepEqual(busy.calls, []);
    assert.equal((await busy.stop({ force: true })).forced, false);
    await settle();
    assert.deepEqual(busy.calls, ['performance', 'arbiter', 'close', 'exit 0']);
});

test('the unload control accepts only a boolean force, and the CLI lines name a forced stop or unload and point a refusal at --force', () => {
    assert.deepEqual(controlRequest('unload', { force: true }, {}), { force: true });
    assert.throws(() => controlRequest('unload', { force: 'yes' }, {}), /force must be true or false/);
    assert.throws(() => controlRequest('restore', { force: true }, {}), /takes no force/);
    assert.equal(controlLine('stop', { stopped: true, forced: false }), 'stop: stopped');
    assert.match(controlLine('stop', { stopped: true, forced: true, interrupted: { imagePending: true } }), /wait ran out \(an image lease was stuck\)/);
    assert.equal(controlLine('unload', { phase: 'manual-hold', unload: { forced: true, interrupted: { activeText: 1 } } }), 'unload: manual-hold (forced; 1 reply cut off)');
    assert.equal(controlLine('unload', { phase: 'manual-hold', unload: { forced: false } }), 'unload: manual-hold');
    assert.match(controlError('unload', { error: 'Wait for the active work before changing text residency.' }), /unload --force/);
    assert.doesNotMatch(controlError('unload', { error: 'Wait for the active work before changing text residency.' }, true), /--force/);
    assert.match(controlError('stop', { error: 'ComfyUI has an existing job; finish it' }), /stop --force/);
});
