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
    const config = { maxQueue: 2, queueTimeoutMs: 1000, reserves: { gpuMiB: 2048, ramMiB: 4096 }, shedCeilingMiB: 13000, defaultImageMiB: 12000, residencyObjective: 'switch', idleRestoreMs: 0, imageCacheMode: 'evict', ...configOverrides };
    const scheduler = new ResidencyScheduler({ config, backend, snapshot: async () => free(22000),
        queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => { calls.push('free'); }, startComfy: async () => {}, saveFootprints: async () => {}, ...rest });
    return { scheduler, calls, backend };
}

test('with a one-reply fair allowance a lease waits only for the active text reply, keeps text resident when it fits, and resumes FIFO after release', async () => {
    const { scheduler, calls } = setup({ config: { imageFairTextRequests: 1 } });
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

function warmImages(overrides = {}) {
    let snapshot = free(22000);
    const { config = {}, ...rest } = overrides;
    const result = setup({ config: { imageCacheMode: 'warm', defaultProfile: 'fast', ...config }, snapshot: async () => snapshot,
        freeImages: async () => { result.calls.push('free'); snapshot = free(22000); return { mode: 'ram-warm' }; }, ...rest });
    result.backend.profile = null;
    return { ...result, render: () => { snapshot = { ...free(5000), host: { availableMiB: 14000, commitFreeMiB: 70000 } }; },
        snapshot: (value) => { snapshot = value; } };
}

test('consecutive image leases retain GPU weights, avoid idle text reloads, and measure total demand across hot runs', async () => {
    const { scheduler, calls, backend, render } = warmImages();
    for (let index = 0; index < 3; index += 1) {
        const { lease } = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000, needRamMiB: 11000 });
        assert.equal(scheduler.lease.before.gpus[0].freeMiB, 22000);
        render(); await scheduler.sampleLease();
        scheduler.lease.seenJob = true;
        await scheduler.release(lease);
        assert.equal(scheduler.status().imageLease, false);
        assert.equal(scheduler.lastCacheMode, 'gpu-warm');
        assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].gpuMiB, 17512);
        await scheduler.keepResident(Date.now() + 6000);
        assert.equal(backend.profile, null);
    }
    assert.deepEqual(calls, []);
    assert.equal(scheduler.lastMeasurement.identity.cacheState, 'gpu-warm');
    assert.equal(scheduler.footprints[scheduler.lastMeasurement.key].verified, true);
    await scheduler.keepResident(Date.now() + 61000);
    assert.deepEqual(calls, ['free', 'load']);
    assert.equal(backend.profile, 'fast');
});

test('a text request reclaims hot images before loading text and waits for reclamation to finish', async () => {
    const gate = deferred();
    const { scheduler, calls, backend, render } = warmImages();
    const { lease } = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
    render(); await scheduler.release(lease);
    const reclaim = scheduler.freeImages;
    scheduler.freeImages = async (options) => { calls.push('reclaiming'); await gate.promise; return reclaim(options); };
    const text = scheduler.text(async () => { await backend.load('fast'); calls.push('reply'); });
    await tick();
    assert.deepEqual(calls, ['reclaiming']);
    gate.resolve(); await text;
    assert.deepEqual(calls, ['reclaiming', 'free', 'load', 'reply']);
    assert.equal(scheduler.residentImages, null);
});

test('deferred text reclamation carries the cold GPU baseline through native-allocation failures and retries', async () => {
    const targets = [];
    let fail = true;
    const { scheduler, render } = warmImages({ freeImages: async (options) => {
        targets.push(options.maxUsedGpuMiB);
        if (fail) throw new Error('Native CUDA allocations remain');
        return { mode: 'evicted' };
    } });
    const { lease } = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
    render(); await scheduler.release(lease);
    await assert.rejects(scheduler.text(async () => {}), /Native CUDA/);
    fail = false;
    await scheduler.text(async () => {});
    assert.deepEqual(targets, [24576 - 22000 + 512, 24576 - 22000 + 512]);
    assert.equal(scheduler.imageReleaseTargetMiB, null);
});

test('a failed hot-image reclamation refuses text and does not race a text load', async () => {
    const { scheduler, calls, render } = warmImages({ freeImages: async () => { throw new Error('GPU release failed'); } });
    const { lease } = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
    render(); await scheduler.release(lease);
    await assert.rejects(scheduler.text(async () => { calls.push('reply'); }), /GPU release failed/);
    await assert.rejects(scheduler.text(async () => { calls.push('reply'); }), /GPU release failed/);
    assert.deepEqual(calls, []);
    assert.equal(scheduler.status().activeText, 0);
});

test('a changed workflow, runtime or resident text invalidates hot-image credit and reclaims before admission', async () => {
    for (const change of ['workflow', 'runtime', 'text']) {
        let version = 1;
        const { scheduler, calls, backend, render } = warmImages({ runtime: async () => ({ id: version }) });
        const { lease } = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
        render(); await scheduler.release(lease);
        if (change === 'runtime') version += 1;
        if (change === 'text') backend.profile = 'fast';
        await scheduler.reserve({ workflowKey: change === 'workflow' ? 'pose' : 'face-edit', needGpuMiB: 18000 });
        assert.deepEqual(calls, ['free']);
        assert.notEqual(scheduler.lease.identity.cacheState, 'gpu-warm');
    }
});

test('hot images reclaim under GPU, RAM or commit pressure without weakening desktop reserves', async () => {
    for (const pressure of ['gpu', 'ram', 'commit']) {
        const { scheduler, calls, render, snapshot } = warmImages();
        const { lease } = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
        render();
        const low = free(pressure === 'gpu' ? 2047 : 5000);
        if (pressure === 'ram') low.host.availableMiB = 4095;
        if (pressure === 'commit') low.host.commitFreeMiB = 4095;
        snapshot(low);
        await scheduler.release(lease);
        assert.deepEqual(calls, ['free']);
        assert.equal(scheduler.residentImages, null);
    }
});

test('a larger same-workflow demand reclaims hot images before considering unloading text', async () => {
    const { scheduler, calls, render } = warmImages();
    const { lease } = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
    render(); await scheduler.release(lease);
    await assert.rejects(scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 24000 }), /admission refused/);
    assert.equal(calls[0], 'free');
    assert.equal(scheduler.status().imageLease, false);
});

test('a matching hot render carries the preceding measured RAM budget instead of charging cold-loader RAM again', async () => {
    const { scheduler, calls, render, snapshot } = warmImages();
    const cold = { ...free(22000), host: { availableMiB: 12500, commitFreeMiB: 70000 } };
    snapshot(cold);
    const key = footprintKey({ workflowKey: 'face-edit', runtime: { id: 'unknown', streaming: false }, models: [], cacheState: 'cold-or-unknown', text: null });
    scheduler.footprints[key] = { revision: FOOTPRINT_REVISION, verified: true, gpuMiB: 18000, ramMiB: 1500 };
    const first = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
    assert.equal(scheduler.lease.needRamMiB, 1500);
    render(); snapshot({ ...free(5000), host: { availableMiB: 11000, commitFreeMiB: 68500 } });
    scheduler.lease.seenJob = true;
    await scheduler.release(first.lease);
    const second = await scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 });
    assert.equal(scheduler.lease.needRamMiB, 2312);
    assert.equal(scheduler.lastResidency.ramSource, 'resident-observation');
    assert.deepEqual(calls, []);
    await scheduler.release(second.lease);
});

test('RAM-pressure retries defer speculative text restoration even after image cache reclamation', async () => {
    const { scheduler, backend, calls, snapshot } = warmImages();
    snapshot({ ...free(22000), host: { availableMiB: 5000, commitFreeMiB: 70000 } });
    scheduler.freeImages = async () => { scheduler.residentImages = null; throw new Error('Image memory admission refused after GPU release. Insufficient physical RAM headroom.'); };
    await assert.rejects(scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 }), /Host RAM is short/);
    await scheduler.keepResident(Date.now() + 6000);
    assert.equal(backend.profile, null);
    assert.equal(calls.includes('load'), false);
    await assert.rejects(scheduler.reserve({ workflowKey: 'face-edit', needGpuMiB: 18000 }), /Host RAM is short/);
    await scheduler.keepResident(Date.now() + 59000);
    assert.equal(calls.includes('load'), false);
    scheduler.freeImages = async () => { calls.push('free'); };
    await scheduler.text(async () => { await backend.load('fast'); });
    assert.equal(backend.profile, 'fast', 'actual text bypasses the image retry grace');
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
    const { scheduler, backend, calls } = setup({ config: { idleRestoreMs: 1, imageFairTextRequests: 0 } });
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

test('a release whose cache reclamation fails still frees the lease, so the next render is admitted', async () => {
    let fail = false;
    const { scheduler } = setup({ freeImages: async () => { if (fail) throw new Error('ComfyUI accepted free but its model memory has not been released; text will not race the release.'); } });
    const first = await scheduler.reserve({ workflowKey: 'base', needGpuMiB: 9000 });
    fail = true;
    assert.equal(await scheduler.release(first.lease), true);
    assert.equal(scheduler.status().imageLease, false);
    assert.match(scheduler.status().lastError, /not been released/);
    fail = false;
    const next = await scheduler.reserve({ workflowKey: 'pose', needGpuMiB: 9000 });
    assert.equal(typeof next.lease, 'string');
    await scheduler.release(next.lease);
});

test('a release survives an unreadable ComfyUI queue, a failed snapshot and a failed footprint write', async () => {
    let broken = false;
    const { scheduler } = setup({ config: { queueTimeoutMs: 0 },
        queue: async () => { if (broken) throw new Error('ComfyUI /queue answered 500'); return { queue_running: [], queue_pending: [] }; },
        snapshot: async () => { if (broken) throw new Error('telemetry down'); return free(22000); },
        saveFootprints: async () => { throw new Error('disk full'); } });
    const lease = await scheduler.reserve({ workflowKey: 'base', needGpuMiB: 9000 });
    scheduler.lease.seenJob = true;
    broken = true;
    assert.equal(await scheduler.release(lease.lease), true);
    assert.equal(scheduler.status().imageLease, false);
    broken = false;
    await scheduler.release((await scheduler.reserve({ workflowKey: 'pose', needGpuMiB: 9000 })).lease);
});

test('image work still running at the deadline keeps the lease; the backstop frees it once ComfyUI is idle', async () => {
    let busy = false;
    const { scheduler } = setup({ config: { queueTimeoutMs: 0 }, queue: async () => ({ queue_running: busy ? [[1, 'owned']] : [], queue_pending: [] }) });
    const lease = await scheduler.reserve({ workflowKey: 'base', needGpuMiB: 9000 });
    busy = true;
    await assert.rejects(scheduler.release(lease.lease), /still running/);
    assert.equal(scheduler.status().imageLease, true);
    await scheduler.sampleLease(Date.now() + 10 * 60000);
    assert.equal(scheduler.status().imageLease, true);
    busy = false;
    await scheduler.sampleLease(Date.now() + 10 * 60000);
    assert.equal(scheduler.status().imageLease, false);
    await scheduler.release((await scheduler.reserve({ workflowKey: 'pose', needGpuMiB: 9000 })).lease);
});

test('an abandoned lease is freed after it goes unrenewed, and a renewed one after its lifetime cap', async () => {
    const { scheduler } = setup({ config: { leaseIdleMs: 1000, leaseMaxMs: 5000 } });
    const idle = await scheduler.reserve({ workflowKey: 'base', needGpuMiB: 9000 });
    await scheduler.sampleLease(Date.now() + 500);
    assert.equal(scheduler.status().imageLease, true);
    await scheduler.sampleLease(Date.now() + 1500);
    assert.equal(scheduler.status().imageLease, false);
    assert.equal(await scheduler.release(idle.lease), false);
    const renewed = await scheduler.reserve({ workflowKey: 'pose', needGpuMiB: 9000 });
    const born = scheduler.lease.at;
    scheduler.lease.touched = born + 4900;
    await scheduler.sampleLease(born + 4950);
    assert.equal(scheduler.status().imageLease, true);
    await scheduler.sampleLease(born + 5100);
    assert.equal(scheduler.status().imageLease, false);
    assert.equal(scheduler.renew(renewed.lease), false);
    await scheduler.release((await scheduler.reserve({ workflowKey: 'next', needGpuMiB: 9000 })).lease);
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
    const { scheduler, calls } = setup({ runtime: streamingRuntime, snapshot: async () => free(4500),
        config: { modelDirs, streamImages: { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192 } } });
    const lease = await scheduler.reserve(sdxl);
    assert.equal(lease.decision, 'stream-image');
    assert.deepEqual(calls, []);
});

test('streaming is off unless enabled, needs a streaming runtime, a small checkpoint, GPU room and the RAM reserve', async () => {
    const modelDirs = await fakeCheckpoint(6600);
    const decide = async (config, options = {}) => {
        let n = 0;
        const { scheduler } = setup({ runtime: options.runtime ?? streamingRuntime, snapshot: options.snapshot ?? (async () => (n++ === 0 ? free(4500) : free(22000))),
            config: { modelDirs, ...config } });
        return (await scheduler.reserve(sdxl)).decision;
    };
    const policy = { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192 };
    assert.notEqual(await decide({}), 'stream-image');
    assert.notEqual(await decide({ streamImages: policy }, { runtime: async () => ({ id: 'r', streaming: false }) }), 'stream-image');
    assert.notEqual(await decide({ streamImages: { ...policy, maxWeightMiB: 4000 } }), 'stream-image');
    assert.notEqual(await decide({ streamImages: { ...policy, minFreeGpuMiB: 3000 } }), 'stream-image');
    assert.equal(await decide({ streamImages: policy }), 'stream-image');
    const lowRam = { highCadence: true, gpus: [{ usedMiB: 19876, freeMiB: 4500 }], host: { availableMiB: 5000, commitFreeMiB: 80000 } };
    let n = 0;
    assert.notEqual(await decide({ streamImages: policy }, { snapshot: async () => (n++ === 0 ? lowRam : free(22000)) }), 'stream-image');
});

test('streaming beside text keeps the GPU reserve: 2.5 GB free with a 1024 MiB reserve makes room for the image instead of spilling beside text (a10)', async () => {
    const modelDirs = await fakeCheckpoint(6600);
    const decide = async (freeMiB) => {
        let n = 0;
        const { scheduler } = setup({ runtime: streamingRuntime, snapshot: async () => (n++ === 0 ? free(freeMiB) : free(22000)),
            config: { modelDirs, reserves: { gpuMiB: 1024, ramMiB: 2048 }, streamImages: { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192 } } });
        return (await scheduler.reserve(sdxl)).decision;
    };
    assert.notEqual(await decide(2510), 'stream-image');
    assert.equal(await decide(3500), 'stream-image');
});

test('a queued image gets a fair window after a bounded number of text replies instead of waiting for an idle text queue', async () => {
    const { scheduler, calls } = setup({ config: { maxQueue: 8, imageFairTextRequests: 2, imageFairWaitMs: 60000 } });
    const gate = deferred();
    const texts = [scheduler.text(async () => { calls.push('t0'); await gate.promise; })];
    for (let n = 1; n <= 5; n += 1) texts.push(scheduler.text(async () => { calls.push(`t${n}`); await tick(); }));
    const reserving = scheduler.reserve().then((lease) => { calls.push('image'); return lease; });
    await tick();
    assert.equal(scheduler.status().imageWaiting, true);
    gate.resolve();
    const lease = await reserving;
    assert.deepEqual(calls, ['t0', 't1', 'image']);
    await scheduler.release(lease.lease);
    await Promise.all(texts);
    assert.deepEqual(calls.filter((row) => row !== 'free'), ['t0', 't1', 'image', 't2', 't3', 't4', 't5']);
    assert.equal(scheduler.status().servedText, 6);
});

test('a queued image takes the GPU between turns, or once it has waited the fair window under continuous text', async () => {
    const between = setup({ config: { imageFairTextRequests: 50, imageFairWaitMs: 60000 } });
    const gate = deferred();
    const turn = between.scheduler.text(async () => { between.calls.push('turn'); await gate.promise; });
    const reserving = between.scheduler.reserve().then((lease) => { between.calls.push('image'); return lease; });
    await tick(); gate.resolve(); await turn;
    await between.scheduler.release((await reserving).lease);
    assert.deepEqual(between.calls.filter((row) => row !== 'free'), ['turn', 'image']);

    const busy = setup({ config: { maxQueue: 64, queueTimeoutMs: 5000, imageFairTextRequests: 1000, imageFairWaitMs: 80 } });
    let stop = false; const order = [];
    const feed = async () => { while (!stop) await busy.scheduler.text(async () => { order.push('text'); await new Promise((resolve) => setTimeout(resolve, 5)); }); };
    const feeders = [feed(), feed()];
    await tick();
    const started = Date.now();
    const lease = await busy.scheduler.reserve();
    order.push('image');
    assert.ok(Date.now() - started >= 70, 'the image waited its fair window');
    assert.ok(order.filter((row) => row === 'text').length > 1, 'text kept flowing while the image waited');
    stop = true;
    await busy.scheduler.release(lease.lease);
    await Promise.all(feeders);
    assert.equal(busy.scheduler.status().imageWaiting, false);
});

test('a second image while one waits is told the GPU is owned, and a cancelled wait frees the queue', async () => {
    const { scheduler } = setup({ config: { imageFairTextRequests: 50, imageFairWaitMs: 60000, queueTimeoutMs: 100 } });
    const gate = deferred();
    const text = scheduler.text(() => gate.promise);
    scheduler.text(async () => {}).catch(() => {});
    const first = scheduler.reserve();
    await tick();
    await assert.rejects(scheduler.reserve(), /already owns the local GPU/);
    await assert.rejects(first, /deadline/);
    assert.equal(scheduler.status().imageWaiting, false);
    gate.resolve(); await text;
});

test('host RAM short for an image is a retryable refusal that frees the broker for text and does not unload text again while RAM stays short', async () => {
    let available = 9000, textModel = null;
    const snapshot = async () => ({ ...free(textModel?.profile ? 3000 : 22000), host: { availableMiB: available, commitFreeMiB: 80000 } });
    const { scheduler, calls, backend } = setup({ snapshot, config: { defaultProfile: 'fast', profiles: { fast: { estimatedRamMiB: 3000 } } }, freeImages: async ({ ramRequiredMiB }) => {
        calls.push('free');
        if (ramRequiredMiB && available + 1500 < ramRequiredMiB + 4096) throw new Error(`Image memory admission refused after GPU release. Insufficient physical RAM headroom. RAM available ${available + 1500} MiB; workload ${ramRequiredMiB} + reserve 4096 MiB.`);
    } });
    textModel = backend;
    const first = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 17000, needRamMiB: 8139 }).catch((error) => error);
    assert.match(first.message, /Host RAM is short/);
    assert.equal(first.retryable, true);
    assert.deepEqual(calls, ['unload', 'free']);
    assert.equal(scheduler.status().phase, 'text');
    assert.equal(scheduler.status().lastResidency.decision, 'ram-short');
    await scheduler.text(async () => { calls.push('text'); });
    assert.equal(calls.at(-1), 'text');
    await scheduler.backend.load('fast');
    calls.length = 0;
    const again = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 17000, needRamMiB: 8139 }).catch((error) => error);
    assert.match(again.message, /Host RAM is short/);
    assert.deepEqual(calls, [], 'no second text unload while RAM is still short');
    available = 14000;
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 17000, needRamMiB: 8139 });
    assert.equal(lease.decision, 'swap-text');
    await scheduler.release(lease.lease);
});

test('another workflow on the same resident model files keeps hot-image credit; other model files reclaim first', async () => {
    const modelDirs = await fakeCheckpoint(6600);
    const shared = { modelFiles: [{ kind: 'checkpoints', name: 'sdxl.safetensors' }], width: 1024, height: 1024 };
    const same = warmImages({ config: { modelDirs } });
    const first = await same.scheduler.reserve({ ...shared, workflowKey: 'face-edit', needGpuMiB: 18000 });
    same.render(); same.scheduler.lease.seenJob = true; await same.scheduler.release(first.lease);
    await same.scheduler.reserve({ ...shared, workflowKey: 'cast-scene', needGpuMiB: 18000 });
    assert.deepEqual(same.calls, []);
    assert.equal(same.scheduler.lease.identity.cacheState, 'gpu-warm');
    const otherDirs = await fakeCheckpoint(6600);
    const other = warmImages({ config: { modelDirs: { checkpoints: [...modelDirs.checkpoints, ...otherDirs.checkpoints] } } });
    await fs.writeFile(path.join(otherDirs.checkpoints[0], 'other.safetensors'), await fs.readFile(path.join(otherDirs.checkpoints[0], 'sdxl.safetensors')));
    const lease = await other.scheduler.reserve({ ...shared, workflowKey: 'face-edit', needGpuMiB: 18000 });
    other.render(); await other.scheduler.release(lease.lease);
    await other.scheduler.reserve({ ...shared, modelFiles: [{ kind: 'checkpoints', name: 'other.safetensors' }], workflowKey: 'cast-scene', needGpuMiB: 18000 });
    assert.deepEqual(other.calls, ['free']);
    assert.notEqual(other.scheduler.lease.identity.cacheState, 'gpu-warm');
});

test('recorded prompt time is the median of recent replies, so one slow outlier is not treated as the usual cost', async () => {
    const saved = [];
    const { scheduler } = setup({ saveTimings: async (timings) => { saved.push(structuredClone(timings)); } });
    for (const promptMs of [9000, 103842, 8800, 9100, 2000]) await scheduler.recordTiming({ timings: { predicted_per_second: 29, predicted_n: 100, prompt_ms: promptMs } });
    const row = scheduler.timings['fast:full'];
    assert.equal(row.promptMs, 9000);
    assert.equal(row.samples, 5);
    assert.equal(row.promptSamples.length, 5);
    for (let at = 0; at < 20; at += 1) await scheduler.recordTiming({ timings: { predicted_per_second: 30, predicted_n: 100, prompt_ms: 1500 } });
    assert.equal(scheduler.timings['fast:full'].promptSamples.length, 15);
    assert.equal(scheduler.timings['fast:full'].promptMs, 1500);
    assert.equal(saved.length, 25);
});

test('timings measured with a draft model are kept apart from timings without it', async () => {
    const { scheduler } = setup({ config: { speculative: { model: 'C:/m/mtp.gguf' } }, saveTimings: async () => {} });
    await scheduler.recordTiming({ timings: { predicted_per_second: 40, predicted_n: 100, prompt_ms: 900 } });
    assert.deepEqual(Object.keys(scheduler.timings), ['fast+draft-mtp2:full']);
});

test('image admission asks the member cache for RAM first and reads memory again only when it freed something', async () => {
    const { scheduler } = setup();
    const asked = [];
    let reads = 0;
    scheduler.snapshot = async () => { reads += 1; return free(22000); };
    scheduler.onImageRam = async (need) => { asked.push(need); return 0; };
    const lease = await scheduler.reserve({ needRamMiB: 3000 });
    const firstReads = reads;
    assert.equal(asked.length, 1);
    assert.equal(asked[0].availableMiB, 24000);
    assert.ok(asked[0].needRamMiB >= 3000);
    await scheduler.release(lease.lease);
    const before = reads;
    scheduler.onImageRam = async () => 1024 * 1048576;
    const second = await scheduler.reserve({ needRamMiB: 3000 });
    assert.equal(reads - before, firstReads + 1, 'a fresh snapshot follows a cache eviction');
    await scheduler.release(second.lease);
});

test('a text load left with a fit correction (layers on the CPU) is reloaded clean once images have been quiet, at most once per window', async () => {
    const { scheduler, calls, backend } = setup({ config: { reclaimImageGraceMs: 1000, fitRecoverMs: 60000 } });
    let correction = 1125;
    backend.status = () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: 'fast', fitTargetMiB: backend.fitTarget, fitCorrectionMiB: correction, loading: false });
    backend.clearFitCorrection = () => { const had = correction; correction = 0; calls.push(`clear ${had}`); return had; };
    const now = Date.now();
    scheduler.lastLeaseAt = now - 500;
    assert.equal(await scheduler.recoverFitSpill(now), false);
    scheduler.lastLeaseAt = now - 5000;
    assert.equal(await scheduler.recoverFitSpill(now), true);
    assert.deepEqual(calls, ['clear 1125', 'unload', 'load']);
    correction = 900;
    assert.equal(await scheduler.recoverFitSpill(now + 1000), false);
    assert.equal(await scheduler.recoverFitSpill(now + 61000), true);
});

