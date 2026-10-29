import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResidencyScheduler } from '../../server-plugin/story-orchestrator-gpu/broker/scheduler.mjs';
import { PRESETS, applyValues } from './modes.mjs';

const SDXL = { gpuMiB: 2816, ramMiB: 8192 };

function owner({ ramBeforeMiB, ramAfterSpillMiB, spill = 'frees' }) {
    const calls = [];
    const config = { maxQueue: 2, queueTimeoutMs: 1000, shedCeilingMiB: 0, defaultImageMiB: 12000, residencyObjective: 'switch', reserves: {}, streamImages: {},
        memberCache: { enabled: true, store: 'ram', budgetMiB: 12288, serverKeys: true, keepAcrossImages: true, spill: spill !== 'off' } };
    applyValues(config, PRESETS.max);
    config.imageCacheMode = 'evict';
    config.idleRestoreMs = 0;
    let spilled = false;
    const backend = { profile: 'fast', desiredProfile: 'fast', fitTarget: null, sleeping: null };
    backend.status = () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: backend.desiredProfile, fitTargetMiB: backend.fitTarget, sleeping: backend.sleeping });
    backend.unload = async () => { calls.push('sleep'); backend.sleeping = { profile: backend.profile, pid: 42 }; backend.profile = null; };
    backend.dropSleeping = async () => { calls.push('drop'); backend.sleeping = null; return 12288; };
    const scheduler = new ResidencyScheduler({ config, backend, runtime: async () => ({ id: 'r', streaming: false }),
        snapshot: async () => ({ highCadence: true, gpus: [{ usedMiB: backend.profile ? 22600 : 1500, freeMiB: backend.profile ? 1976 : 23076 }],
            host: { availableMiB: backend.sleeping || backend.profile ? (spilled ? ramAfterSpillMiB : ramBeforeMiB) : 24000, commitFreeMiB: 80000 } }),
        queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => { calls.push('free'); }, startComfy: async () => {}, saveFootprints: async () => {} });
    scheduler.log = (line) => calls.push(`log: ${line}`);
    if (spill !== 'off') {
        scheduler.onSpillForRam = async ({ availableMiB, floorMiB }) => {
            calls.push(`spill ${Math.round(availableMiB)} < ${floorMiB}`);
            if (spill === 'fails') return null;
            spilled = true;
            return { spilled: 3, freedMiB: ramAfterSpillMiB - ramBeforeMiB, wallMs: 1450 };
        };
        scheduler.onSleepingDropped = () => calls.push('sweep');
    }
    return { scheduler, calls, backend };
}

const order = (calls) => calls.filter((call) => !call.startsWith('log: '));

test('a RAM-short SDXL swap spills the sleeping server\'s member cache to disk before admission instead of dropping it', async () => {
    const { scheduler, calls, backend } = owner({ ramBeforeMiB: 7400, ramAfterSpillMiB: 11200 });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL.gpuMiB, needRamMiB: SDXL.ramMiB });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(order(calls), ['sleep', 'spill 7400 < 10240', 'free']);
    assert.ok(backend.sleeping, 'the sleeping server and its spilled cache survive the image');
    assert.ok(calls.some((call) => /spilled 3 member cache entries \(3800 MiB\) to disk in 1450 ms instead of dropping/.test(call)));
});

test('when the spill does not free enough the sleeping server is dropped as before, and its spill files are swept', async () => {
    const { scheduler, calls, backend } = owner({ ramBeforeMiB: 5000, ramAfterSpillMiB: 7000 });
    await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL.gpuMiB, needRamMiB: SDXL.ramMiB });
    assert.deepEqual(order(calls), ['sleep', 'spill 5000 < 10240', 'drop', 'sweep', 'free']);
    assert.equal(backend.sleeping, null);
});

test('a spill that answers nothing (off on the server, refused) falls back to the drop', async () => {
    const { scheduler, calls } = owner({ ramBeforeMiB: 7400, ramAfterSpillMiB: 11200, spill: 'fails' });
    await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL.gpuMiB, needRamMiB: SDXL.ramMiB });
    assert.deepEqual(order(calls), ['sleep', 'spill 7400 < 10240', 'drop', 'sweep', 'free']);
});

test('without the spill hook (memberCache.spill off) the drop path is unchanged', async () => {
    const { scheduler, calls } = owner({ ramBeforeMiB: 7400, ramAfterSpillMiB: 11200, spill: 'off' });
    await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL.gpuMiB, needRamMiB: SDXL.ramMiB });
    assert.deepEqual(order(calls), ['sleep', 'drop', 'free']);
});

test('with RAM above the floor nothing spills and nothing is dropped', async () => {
    const { scheduler, calls } = owner({ ramBeforeMiB: 14000, ramAfterSpillMiB: 14000 });
    await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL.gpuMiB, needRamMiB: SDXL.ramMiB });
    assert.deepEqual(order(calls), ['sleep', 'free']);
});
