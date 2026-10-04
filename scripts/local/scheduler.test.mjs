import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResidencyScheduler } from './scheduler.mjs';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const free = (freeMiB) => ({ gpus: [{ usedMiB: 24576 - freeMiB, freeMiB }], host: { availableMiB: 24000, commitFreeMiB: 80000 } });

function setup(overrides = {}) {
    const { config: configOverrides = {}, ...rest } = overrides;
    const calls = [];
    const backend = {
        profile: 'fast', desiredProfile: 'fast', fitTarget: null,
        status: () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: backend.desiredProfile, fitTargetMiB: backend.fitTarget }),
        unload: async () => { calls.push('unload'); backend.profile = null; backend.fitTarget = null; },
        load: async (name, options = {}) => { calls.push('load'); backend.profile = name; backend.fitTarget = Number.isFinite(options.fitTarget) ? options.fitTarget : null; },
    };
    const config = { maxQueue: 2, queueTimeoutMs: 1000, reserves: { gpuMiB: 2048, ramMiB: 4096 }, shedCeilingMiB: 13000, defaultImageMiB: 12000, idleRestoreMs: 0, ...configOverrides };
    const scheduler = new ResidencyScheduler({ config, backend, snapshot: async () => free(22000),
        queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => { calls.push('free'); }, startComfy: async () => {}, saveFootprints: async () => {}, ...rest });
    return { scheduler, calls, backend };
}

test('lease waits for the active text reply, keeps text resident when it fits, and resumes FIFO after release', async () => {
    const { scheduler, calls } = setup();
    const gate = deferred();
    const first = scheduler.text(async () => { calls.push('first'); await gate.promise; });
    const next = scheduler.text(async () => { calls.push('next'); });
    const reserving = scheduler.reserve();
    await tick();
    assert.deepEqual(calls, ['first']);
    gate.resolve(); await first;
    const lease = await reserving;
    assert.deepEqual(calls, ['first']);
    assert.equal(lease.decision, 'retain-text');
    await scheduler.release(lease.lease); await next;
    assert.equal(calls.at(-1), 'next');
});

test('a foreign image job refuses the lease without unloading text or interrupting anything', async () => {
    const { scheduler, calls } = setup({ queue: async () => ({ queue_running: [[1, 'foreign']], queue_pending: [] }) });
    await assert.rejects(scheduler.reserve(), /existing job/);
    assert.deepEqual(calls, []);
    assert.equal(scheduler.status().phase, 'text');
});

test('cancelled queued text never runs after an image finishes', async () => {
    const { scheduler } = setup();
    const lease = await scheduler.reserve();
    const abort = new AbortController(); let ran = false;
    const text = scheduler.text(async () => { ran = true; }, abort.signal);
    const rejected = assert.rejects(text, /cancelled/);
    abort.abort(); await rejected;
    await scheduler.release(lease.lease);
    assert.equal(ran, false);
    assert.equal(scheduler.pending.length, 0);
});

test('manual unload does not interrupt active text and blocks autoload until automatic is selected', async () => {
    const { scheduler } = setup(); const gate = deferred();
    const text = scheduler.text(() => gate.promise);
    await assert.rejects(scheduler.unload(), /active work/);
    gate.resolve(); await text;
    await scheduler.unload();
    await assert.rejects(scheduler.text(async () => {}), /manually unloaded/);
    scheduler.resume(); await scheduler.text(async () => {});
});

test('an image that does not fit sheds the text profile to leave room instead of swapping it later', async () => {
    let n = 0;
    const { scheduler, calls, backend } = setup({ snapshot: async () => (n++ === 0 ? free(3000) : free(11048)) });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000 });
    assert.equal(lease.decision, 'shed-text');
    assert.deepEqual(calls, ['load']);
    assert.equal(backend.fitTarget, 9000 + 2048);
});

test('when shedding cannot free enough the image swaps the text model out', async () => {
    const { scheduler, calls } = setup({ snapshot: async () => free(3000) });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['load', 'unload', 'free']);
});

test('an image larger than the shed ceiling swaps without trying to shed', async () => {
    const { scheduler, calls } = setup({ snapshot: async () => free(3000) });
    const lease = await scheduler.reserve({ workflowKey: 'background', needGpuMiB: 17000 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['unload', 'free']);
});

test('a shed profile returns to full speed after the idle window', async () => {
    let n = 0;
    const { scheduler, backend } = setup({ snapshot: async () => (n++ === 0 ? free(3000) : free(11048)), config: { idleRestoreMs: 5 } });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000 });
    await scheduler.release(lease.lease);
    assert.equal(backend.fitTarget, 9000 + 2048);
    await scheduler.restoreIfIdle();
    assert.equal(backend.fitTarget, 9000 + 2048);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await scheduler.restoreIfIdle();
    assert.equal(backend.fitTarget, null);
});

test('a swap clears the shed intent so the next text request loads full speed', async () => {
    let n = 0;
    const { scheduler, backend } = setup({ snapshot: async () => (n++ < 2 ? free(10474) : free(3000)) });
    const shed = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000 });
    assert.equal(shed.decision, 'shed-text');
    assert.equal(backend.fitTarget, 9000 + 2048);
    await scheduler.release(shed.lease);
    const swap = await scheduler.reserve({ workflowKey: 'background', needGpuMiB: 17000 });
    assert.equal(swap.decision, 'swap-text');
    assert.equal(backend.fitTarget, null);
});

test('a mismatched lease cannot release another render; a single observation does not become verified', async () => {
    const { scheduler } = setup(); const lease = await scheduler.reserve({ workflowKey: 'scene' });
    assert.equal(await scheduler.release('wrong'), false);
    scheduler.lease.seenJob = true;
    await scheduler.release(lease.lease);
    assert.equal(scheduler.footprints.scene.verified, false);
});

test('a workflow becomes verified after two consistent observations', async () => {
    const { scheduler } = setup();
    const first = await scheduler.reserve({ workflowKey: 'scene' });
    scheduler.lease.seenJob = true;
    await scheduler.release(first.lease);
    assert.equal(scheduler.footprints.scene.verified, false);
    const second = await scheduler.reserve({ workflowKey: 'scene' });
    scheduler.lease.seenJob = true;
    await scheduler.release(second.lease);
    assert.equal(scheduler.footprints.scene.verified, true);
    assert.equal(scheduler.footprints.scene.runs, 2);
    assert.equal(scheduler.footprints.scene.samples.length, 2);
});

test('an inconsistent observation blocks verification', async () => {
    const { scheduler } = setup();
    const first = await scheduler.reserve({ workflowKey: 'scene' });
    scheduler.lease.seenJob = true;
    await scheduler.release(first.lease);
    const second = await scheduler.reserve({ workflowKey: 'scene' });
    scheduler.lease.seenJob = true;
    scheduler.lease.peakGpu = 9000;
    await scheduler.release(second.lease);
    assert.equal(scheduler.footprints.scene.verified, false);
    assert.equal(scheduler.footprints.scene.runs, 2);
});
