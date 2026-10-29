import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResidencyScheduler } from '../../server-plugin/story-orchestrator-gpu/broker/scheduler.mjs';
import { PRESETS, applyValues } from './modes.mjs';

const SMOKE = [
    { cycle: 1, beforeMiB: 1979, afterLightMiB: 4773, renderLowMiB: 537 },
    { cycle: 2, beforeMiB: 1865, afterLightMiB: 4659, renderLowMiB: 275 },
];
const SDXL_NEED_MIB = 2816;
const reading = (freeMiB) => ({ highCadence: true, gpus: [{ usedMiB: 24576 - freeMiB, freeMiB }], host: { availableMiB: 24000, commitFreeMiB: 80000 } });

function candidate(mode, { beforeMiB, afterLightMiB }) {
    const calls = [];
    const config = { maxQueue: 2, queueTimeoutMs: 1000, shedCeilingMiB: 0, defaultImageMiB: 12000, residencyObjective: 'switch', reserves: {}, streamImages: {},
        memberCache: { enabled: true, store: 'ram', budgetMiB: 12288, serverKeys: true, keepAcrossImages: true, lightSleep: true, lightSleepFreesMiB: 2800 } };
    applyValues(config, PRESETS[mode]);
    config.imageCacheMode = 'evict';
    config.idleRestoreMs = 0;
    const backend = { profile: 'fast', desiredProfile: 'fast', fitTarget: null, sleeping: null };
    backend.status = () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: backend.desiredProfile, fitTargetMiB: backend.fitTarget, sleeping: backend.sleeping });
    backend.unload = async (options = {}) => { calls.push(options.light ? 'sleep-light' : 'unload'); backend.sleeping = options.light ? { profile: backend.profile, light: true } : null; backend.profile = null; };
    backend.dropSleeping = async () => { calls.push('drop'); backend.sleeping = null; return 4096; };
    backend.load = async (name) => { calls.push('load'); backend.profile = name; };
    const scheduler = new ResidencyScheduler({ config, backend, runtime: async () => ({ id: 'r', streaming: true }),
        snapshot: async () => reading(backend.sleeping?.light ? afterLightMiB : backend.profile ? beforeMiB : 22000),
        queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => { calls.push('free'); }, startComfy: async () => {}, saveFootprints: async () => {} });
    return { scheduler, calls };
}

test('max: an SDXL image that fits beside the kept weights with the 1,024 MiB reserve left gets sleep-context, and /status says why', async () => {
    const { scheduler, calls } = candidate('max', SMOKE[0]);
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL_NEED_MIB });
    assert.equal(lease.decision, 'sleep-context');
    assert.deepEqual(calls, ['sleep-light']);
    const row = scheduler.status().lastResidency;
    assert.equal(row.decision, 'sleep-context');
    assert.deepEqual(row.lightSleep, { stage: 'measured', freeMiB: 4773, needGpuMiB: SDXL_NEED_MIB, reserveMiB: 1024, leftMiB: 4773 - SDXL_NEED_MIB, fits: true });
    assert.match(row.reason, /4773 MiB free covers image 2816 \+ reserve 1024 MiB/);
});

for (const smoke of SMOKE) {
    test(`max: smoke cycle ${smoke.cycle} (render left ${smoke.renderLowMiB} MiB free) would cross the reserve, so text is stopped and swapped instead`, async () => {
        const { scheduler, calls } = candidate('max', smoke);
        const needGpuMiB = smoke.afterLightMiB - smoke.renderLowMiB;
        const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB });
        assert.equal(lease.decision, 'swap-text');
        assert.equal(calls.includes('sleep-light'), false);
        assert.deepEqual(calls, ['unload', 'free']);
        const row = scheduler.status().lastResidency;
        assert.equal(row.lightSleep.stage, 'estimate');
        assert.equal(row.lightSleep.fits, false);
        assert.ok(row.lightSleep.leftMiB < 1024);
        assert.match(row.reason, new RegExp(`Light sleep skipped: about ${smoke.beforeMiB + 2800} MiB free after it, short of image ${needGpuMiB} \\+ reserve 1024 MiB`));
    });
}

test('max: the smoke\'s 9,059 MiB loader estimate no longer streams beside a light sleeper; it swaps text', async () => {
    const { scheduler, calls } = candidate('max', SMOKE[0]);
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 9059 });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['unload', 'free']);
});

test('max: an estimate that fits but a measured free reading that would cross the reserve drops the sleeper and swaps', async () => {
    const { scheduler, calls } = candidate('max', { beforeMiB: 1979, afterLightMiB: 3500 });
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL_NEED_MIB });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['sleep-light', 'drop', 'free']);
    const row = scheduler.status().lastResidency;
    assert.deepEqual(row.lightSleep, { stage: 'measured', freeMiB: 3500, needGpuMiB: SDXL_NEED_MIB, reserveMiB: 1024, leftMiB: 3500 - SDXL_NEED_MIB, fits: false });
    assert.match(row.reason, /A light sleep left 3500 MiB free, short of image 2816 \+ reserve 1024 MiB; text was stopped/);
});

test('headroom: the same SDXL image that fits in max would cut into the 4,096 MiB reserve, so text is swapped', async () => {
    const { scheduler, calls } = candidate('headroom', SMOKE[0]);
    const lease = await scheduler.reserve({ workflowKey: 'scene', needGpuMiB: SDXL_NEED_MIB });
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['unload', 'free']);
    const row = scheduler.status().lastResidency;
    assert.equal(row.lightSleep.reserveMiB, 4096);
    assert.equal(row.lightSleep.fits, false);
    assert.match(row.reason, /short of image 2816 \+ reserve 4096 MiB/);
});
