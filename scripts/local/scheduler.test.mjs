import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResidencyScheduler } from './scheduler.mjs';
import { footprintKey, FOOTPRINT_REVISION } from './footprints.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const free = (freeMiB) => ({ highCadence: true, gpus: [{ usedMiB: 24576 - freeMiB, freeMiB }], host: { availableMiB: 24000, commitFreeMiB: 80000 } });

function setup(overrides = {}) {
    const { config: configOverrides = {}, ...rest } = overrides;
    const calls = [];
    const backend = {
        profile: 'fast', desiredProfile: 'fast', fitTarget: null,
        status: () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: backend.desiredProfile, fitTargetMiB: backend.fitTarget }),
        unload: async () => { calls.push('unload'); backend.profile = null; backend.fitTarget = null; },
        load: async (name, options = {}) => { calls.push('load'); backend.profile = name; backend.fitTarget = Number.isFinite(options.fitTarget) ? options.fitTarget : null; },
    };
    const config = { maxQueue: 2, queueTimeoutMs: 1000, reserves: { gpuMiB: 2048, ramMiB: 4096 }, shedCeilingMiB: 13000, defaultImageMiB: 12000, residencyObjective: 'switch', idleRestoreMs: 0, ...configOverrides };
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
    let n = 0;
    const { scheduler, calls } = setup({ snapshot: async () => free(n++ < 2 ? 3000 : 22000) });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['load', 'unload', 'free']);
});

test('an image larger than the shed ceiling swaps without trying to shed', async () => {
    let n = 0;
    const { scheduler, calls } = setup({ snapshot: async () => free(n++ === 0 ? 3000 : 22000) });
    const lease = await scheduler.reserve({ workflowKey: 'background', needGpuMiB: 17000 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['unload', 'free']);
});

test('a shed profile returns to full speed after the idle window', async () => {
    let n = 0;
    const { scheduler, backend } = setup({ snapshot: async () => (n++ === 0 ? free(3000) : free(11048)), config: { idleRestoreMs: 500 } });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000 });
    await scheduler.release(lease.lease);
    assert.equal(backend.fitTarget, 9000 + 2048);
    await scheduler.restoreIfIdle();
    assert.equal(backend.fitTarget, 9000 + 2048);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await scheduler.restoreIfIdle();
    assert.equal(backend.fitTarget, null);
});

test('a swap clears the shed intent so the next text request loads full speed', async () => {
    let n = 0;
    const { scheduler, backend } = setup({ snapshot: async () => free([3000, 11048, 11048, 3000, 22000][n++] ?? 22000) });
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
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].verified, false);
});

test('a workflow becomes verified after two consistent observations', async () => {
    const { scheduler } = setup();
    const first = await scheduler.reserve({ workflowKey: 'scene' });
    scheduler.lease.seenJob = true;
    await scheduler.release(first.lease);
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].verified, false);
    const second = await scheduler.reserve({ workflowKey: 'scene' });
    scheduler.lease.seenJob = true;
    await scheduler.release(second.lease);
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].verified, true);
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].runs, 2);
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].samples.length, 2);
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
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].verified, false);
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].runs, 2);
});

test('an idle restore owns the lifecycle until it settles; queued text and an image wait', async () => {
    const gate = deferred();
    const { scheduler, backend, calls } = setup({ config: { idleRestoreMs: 1 } });
    backend.fitTarget = 11048;
    scheduler.lastLeaseAt = Date.now() - 10;
    backend.load = async () => { calls.push('restore'); await gate.promise; backend.fitTarget = null; };
    const restoring = scheduler.restoreIfIdle();
    await tick();
    const text = scheduler.text(async () => { calls.push('text'); });
    const reserving = scheduler.reserve({ needGpuMiB: 9000 });
    await tick();
    await assert.rejects(scheduler.load('fast'), /active work/);
    assert.deepEqual(calls, ['unload', 'free', 'restore']);
    gate.resolve(); await restoring;
    const lease = await reserving;
    assert.equal(calls.includes('text'), false);
    await scheduler.release(lease.lease); await text;
    assert.equal(calls.at(-1), 'text');
});

test('manual restore and free-cache controls cannot race a generation or another lifecycle change', async () => {
    const gate = deferred();
    const { scheduler } = setup();
    const operation = scheduler.exclusive(() => gate.promise);
    await assert.rejects(scheduler.restoreNow(), /active work/);
    await assert.rejects(scheduler.unload(), /active work/);
    let ran = false;
    const text = scheduler.text(async () => { ran = true; });
    await tick(); assert.equal(ran, false);
    gate.resolve(); await operation; await text;
    assert.equal(ran, true);
});

test('post-shed admission keeps the GPU reserve, not only the render allocation', async () => {
    let n = 0;
    const { scheduler, calls } = setup({ snapshot: async (options) => {
        assert.equal(options.fresh, true);
        return free([3000, 9500, 22000][n++] ?? 22000);
    } });
    const lease = await scheduler.reserve({ needGpuMiB: 9000 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['load', 'unload', 'free']);
});

test('image admission refuses insufficient physical RAM or commit and an impossible GPU workload', async () => {
    for (const snapshot of [
        { ...free(22000), host: { availableMiB: 8000, commitFreeMiB: 80000 } },
        { ...free(22000), host: { availableMiB: 24000, commitFreeMiB: 8000 } },
        free(3000),
    ]) {
        const { scheduler } = setup({ snapshot: async () => snapshot });
        await assert.rejects(scheduler.reserve({ needGpuMiB: 9000, needRamMiB: 9000 }), /admission refused/);
        assert.equal(scheduler.lease, null);
    }
});

test('verified same-runtime RAM demand replaces the conservative loader estimate without weakening reserves', async () => {
    const snapshot = { ...free(22000), host: { availableMiB: 13000, commitFreeMiB: 70000 } };
    const key = footprintKey({ workflowKey: 'edit', runtime: { id: 'unknown', streaming: false }, models: [], cacheState: 'cold-or-unknown', text: null });
    const make = (verified, revision = FOOTPRINT_REVISION) => {
        const result = setup({ snapshot: async () => snapshot, config: { defaultImageRamMiB: 20000 },
            footprints: { [key]: { revision, verified, ramMiB: 3000, gpuMiB: 9000 } } });
        result.backend.profile = null;
        return result.scheduler;
    };
    const learned = make(true);
    await learned.reserve({ workflowKey: 'edit', needGpuMiB: 9000 });
    assert.equal(learned.lease.needRamMiB, 3000);
    await assert.rejects(make(false).reserve({ workflowKey: 'edit', needGpuMiB: 9000 }), /admission refused/);
    await assert.rejects(make(true, FOOTPRINT_REVISION - 1).reserve({ workflowKey: 'edit', needGpuMiB: 9000 }), /admission refused/);
    await assert.rejects(make(true).reserve({ workflowKey: 'edit', needGpuMiB: 9000, needRamMiB: 20000 }), /admission refused/);
    const reserve = make(true);
    reserve.snapshot = async () => ({ ...snapshot, host: { availableMiB: 3000 + 4095, commitFreeMiB: 70000 } });
    await assert.rejects(reserve.reserve({ workflowKey: 'edit', needGpuMiB: 9000 }), /admission refused/);
});

test('a failed shed RAM admission falls back to swapping instead of stranding the request', async () => {
    let n = 0;
    const { scheduler, backend, calls } = setup({ snapshot: async () => free(n++ === 0 ? 3000 : 22000) });
    backend.load = async () => { calls.push('failed-shed'); throw new Error('Not enough physical RAM headroom.'); };
    const lease = await scheduler.reserve({ needGpuMiB: 9000 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['failed-shed', 'unload', 'free']);
});

test('duplicate releases free a lease only once and keep queued text behind cache reclamation', async () => {
    const gate = deferred();
    const { scheduler, calls } = setup({ freeImages: async () => { calls.push('free'); await gate.promise; } });
    const lease = await scheduler.reserve({ needGpuMiB: 9000 });
    const first = scheduler.release(lease.lease);
    const second = scheduler.release(lease.lease);
    const text = scheduler.text(async () => { calls.push('text'); });
    await tick(); assert.deepEqual(calls, ['free']);
    gate.resolve(); assert.equal(await first, true); assert.equal(await second, true); await text;
    assert.deepEqual(calls, ['free', 'text']);
});

test('total-wait policy swaps an unmeasured reduced profile and restores for a costly reply', async () => {
    let n = 0;
    const { scheduler, backend, calls } = setup({ config: { residencyObjective: 'total-wait' }, snapshot: async () => free(n++ === 0 ? 3000 : 22000) });
    const lease = await scheduler.reserve({ needGpuMiB: 9000 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['unload', 'free']);
    await scheduler.release(lease.lease);
    backend.profile = 'fast'; backend.fitTarget = 11048;
    scheduler.timings = { 'fast:full': { loadMs: 22000, tokensPerSecond: 30, promptMs: 1000 }, 'fast:11048': { loadMs: 22000, tokensPerSecond: 3 } };
    const before = calls.length;
    await scheduler.text(async () => { calls.push('reply'); }, null, 256);
    assert.deepEqual(calls.slice(before), ['unload', 'free', 'load', 'reply']);
    assert.equal(backend.fitTarget, null);
    assert.equal(scheduler.lastTextDecision.restore, true);
});

test('a cheap measured reply keeps the reduced profile and observations are distinct from estimates', async () => {
    const { scheduler, backend, calls } = setup({ config: { residencyObjective: 'total-wait' } });
    backend.fitTarget = 11048;
    scheduler.timings = { 'fast:full': { loadMs: 22000, tokensPerSecond: 30 }, 'fast:11048': { loadMs: 2000, tokensPerSecond: 3 } };
    await scheduler.text(async () => { calls.push('reply'); }, null, 16);
    assert.deepEqual(calls, ['reply']);
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000, needRamMiB: 10000 });
    scheduler.lease.seenJob = true;
    await scheduler.release(lease.lease);
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].ramMiB, 512);
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].gpuMiB, 512);
});

test('periodic lease sampling uses the fresh high-cadence seam instead of the cached status snapshot', async () => {
    let busy = false;
    const { scheduler } = setup({ snapshot: async (options) => {
        assert.equal(options?.fresh, true);
        return free(22000);
    }, queue: async () => ({ queue_running: busy ? [[1, 'owned']] : [], queue_pending: [] }) });
    const lease = await scheduler.reserve({ workflowKey: 'sdxl', needGpuMiB: 18000, needRamMiB: 4096 });
    busy = true; await scheduler.sampleLease(); busy = false;
    assert.equal(scheduler.lease.highCadence, true);
    assert.equal(scheduler.lease.seenJob, true);
    assert.equal(scheduler.lastError, null);
    await scheduler.release(lease.lease);
});

test('a failed text load is retried automatically with backoff instead of waiting for a manual load', async () => {
    const { scheduler, backend, calls } = setup();
    backend.profile = null;
    let fail = true;
    backend.load = async (name) => { calls.push('load'); if (fail) throw new Error('Command failed: powershell Get-CimInstance'); backend.profile = name; };
    await scheduler.keepResident(1000);
    assert.match(scheduler.status().lastError, /Get-CimInstance/);
    assert.equal(backend.profile, null);
    await scheduler.keepResident(Date.now() + 1000);
    assert.equal(calls.filter((call) => call === 'load').length, 1);
    fail = false;
    await scheduler.keepResident(Date.now() + 6000);
    assert.equal(backend.profile, 'fast');
    assert.equal(scheduler.status().lastError, null);
    await scheduler.keepResident(Date.now() + 60000);
    assert.equal(calls.filter((call) => call === 'load').length, 2);
});

test('text reloads after a swapped image once the grace window passes, never during a lease or a manual hold', async () => {
    let n = 0;
    const { scheduler, backend } = setup({ snapshot: async () => free(n++ === 0 ? 3000 : 22000), config: { textReloadGraceMs: 1000 } });
    const lease = await scheduler.reserve({ workflowKey: 'background', needGpuMiB: 17000 });
    await scheduler.keepResident();
    assert.equal(backend.profile, null);
    await scheduler.release(lease.lease);
    await scheduler.keepResident();
    assert.equal(backend.profile, null);
    await scheduler.keepResident(Date.now() + 1500);
    assert.equal(backend.profile, 'fast');
    await scheduler.unload();
    await scheduler.keepResident(Date.now() + 5000);
    assert.equal(backend.profile, null);
});

test('a physical-RAM refusal while releasing an image frees the lease so text is not wedged behind it', async () => {
    let release = false;
    const { scheduler } = setup({ freeImages: async () => { if (release) throw new Error('Image memory admission refused after GPU release. Insufficient physical RAM headroom.'); } });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9000 });
    release = true;
    assert.equal(await scheduler.release(lease.lease), true);
    assert.equal(scheduler.status().imageLease, false);
    assert.match(scheduler.status().lastError, /admission refused/);
});

const fakeCheckpoint = async (mib) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-stream-'));
    const header = Buffer.from(JSON.stringify({ w: { dtype: 'F16', shape: [1], data_offsets: [0, mib * 1048576] } }));
    const prefix = Buffer.alloc(8); prefix.writeBigUInt64LE(BigInt(header.length));
    await fs.writeFile(path.join(dir, 'sdxl.safetensors'), Buffer.concat([prefix, header]));
    return { checkpoints: [dir] };
};
const streamingRuntime = async () => ({ id: 'r', streaming: true });
const sdxl = { workflowKey: 'scene', modelFiles: [{ kind: 'checkpoints', name: 'sdxl.safetensors' }], width: 1344, height: 768 };

test('a measured streaming runtime keeps full text resident for an SDXL render instead of swapping it', async () => {
    const modelDirs = await fakeCheckpoint(6600);
    const { scheduler, calls } = setup({ runtime: streamingRuntime, snapshot: async () => free(2700),
        config: { modelDirs, streamImages: { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192 } } });
    const lease = await scheduler.reserve(sdxl);
    assert.equal(lease.decision, 'stream-image');
    assert.deepEqual(calls, []);
});

test('streaming is off unless enabled, needs a streaming runtime, a small checkpoint, GPU room and the RAM reserve', async () => {
    const modelDirs = await fakeCheckpoint(6600);
    const decide = async (config, options = {}) => {
        let n = 0;
        const { scheduler } = setup({ runtime: options.runtime ?? streamingRuntime, snapshot: options.snapshot ?? (async () => (n++ === 0 ? free(2700) : free(22000))),
            config: { modelDirs, ...config } });
        return (await scheduler.reserve(sdxl)).decision;
    };
    const policy = { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192 };
    assert.notEqual(await decide({}), 'stream-image');
    assert.notEqual(await decide({ streamImages: policy }, { runtime: async () => ({ id: 'r', streaming: false }) }), 'stream-image');
    assert.notEqual(await decide({ streamImages: { ...policy, maxWeightMiB: 4000 } }), 'stream-image');
    assert.notEqual(await decide({ streamImages: { ...policy, minFreeGpuMiB: 3000 } }), 'stream-image');
    const lowRam = { highCadence: true, gpus: [{ usedMiB: 21876, freeMiB: 2700 }], host: { availableMiB: 5000, commitFreeMiB: 80000 } };
    let n = 0;
    assert.notEqual(await decide({ streamImages: policy }, { snapshot: async () => (n++ === 0 ? lowRam : free(22000)) }), 'stream-image');
});
