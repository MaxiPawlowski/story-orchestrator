import { test } from 'node:test';
import assert from 'node:assert/strict';
import { residencyChoice } from './policy.mjs';
import { ResidencyScheduler } from './scheduler.mjs';

const RESERVES = { gpuMiB: 2048, ramMiB: 4096 };
const RECORDED = {
    textResidentGpuUsedMiB: 18051,
    gpuTotalMiB: 24576,
    textResidentRamMiB: 13880,
    textResidentCommitMiB: 48197,
    plan28SdxlNeedGpuMiB: 9059,
    plan28SdxlNeedRamMiB: 9011,
    idleGpuFreeMiB: 23290,
    idleRamMiB: 16001,
};
const besideText = { highCadence: true, gpus: [{ uuid: 'gpu', totalMiB: RECORDED.gpuTotalMiB, usedMiB: RECORDED.textResidentGpuUsedMiB, freeMiB: RECORDED.gpuTotalMiB - RECORDED.textResidentGpuUsedMiB }],
    host: { totalMiB: 32678, availableMiB: RECORDED.textResidentRamMiB, commitFreeMiB: RECORDED.textResidentCommitMiB } };
const afterUnload = { highCadence: true, gpus: [{ uuid: 'gpu', totalMiB: RECORDED.gpuTotalMiB, usedMiB: RECORDED.gpuTotalMiB - RECORDED.idleGpuFreeMiB, freeMiB: RECORDED.idleGpuFreeMiB }],
    host: { totalMiB: 32678, availableMiB: RECORDED.idleRamMiB, commitFreeMiB: 65548 } };
const freeBeside = RECORDED.gpuTotalMiB - RECORDED.textResidentGpuUsedMiB;

function setup({ snapshots = [besideText, afterUnload], experiments = false } = {}) {
    const calls = [];
    const logs = [];
    const backend = { profile: 'fast', status: () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: 'fast', fitTargetMiB: null }),
        unload: async () => { calls.push('unload'); backend.profile = null; }, load: async () => { calls.push('load'); backend.profile = 'fast'; } };
    let n = 0;
    const scheduler = new ResidencyScheduler({ config: { maxQueue: 2, queueTimeoutMs: 1000, reserves: { ...RESERVES }, residencyObjective: 'total-wait', experiments },
        backend, snapshot: async () => snapshots[Math.min(n++, snapshots.length - 1)], queue: async () => ({ queue_running: [], queue_pending: [] }),
        freeImages: async () => { calls.push('free'); }, startComfy: async () => {}, saveFootprints: async () => {}, log: (line) => logs.push(line) });
    return { scheduler, calls, logs, backend };
}

test('recorded 3090 reading: the plan 28 SDXL render does not fit beside Artemis, so text swaps and status says why', async () => {
    const choice = residencyChoice({ snapshot: besideText, needGpuMiB: RECORDED.plan28SdxlNeedGpuMiB, needRamMiB: RECORDED.plan28SdxlNeedRamMiB, reserves: RESERVES, textResident: true });
    assert.equal(choice.keep, false);
    assert.equal(choice.shortBy.gpuMiB, RECORDED.plan28SdxlNeedGpuMiB + RESERVES.gpuMiB - freeBeside);
    assert.match(choice.reason, /Text must unload: Insufficient GPU headroom/);
    const { scheduler, calls, logs } = setup();
    const granted = await scheduler.reserve({ needGpuMiB: RECORDED.plan28SdxlNeedGpuMiB, needRamMiB: RECORDED.plan28SdxlNeedRamMiB });
    assert.equal(granted.decision, 'swap-text');
    assert.deepEqual(calls, ['unload', 'free']);
    const row = scheduler.status().lastResidency;
    assert.equal(row.decision, 'swap-text');
    assert.equal(row.textResident, true);
    assert.match(row.reason, /^Swapped text out\. Text must unload: Insufficient GPU headroom/);
    assert.deepEqual(row.readings, { gpuFreeMiB: freeBeside, ramAvailableMiB: RECORDED.textResidentRamMiB, commitFreeMiB: RECORDED.textResidentCommitMiB });
    assert.equal(row.admittedReadings.gpuFreeMiB, RECORDED.idleGpuFreeMiB);
    assert.deepEqual(row.reserves, RESERVES);
    assert.match(logs[0], /^lease swap-text: Swapped text out.*GPU free 6525 MiB, need 9059 \+ reserve 2048/);
});

test('recorded reading: a job that fits beside text with both reserves keeps text loaded (no unload, no reload)', async () => {
    const needGpuMiB = freeBeside - RESERVES.gpuMiB;
    const needRamMiB = RECORDED.textResidentRamMiB - RESERVES.ramMiB;
    const { scheduler, calls, backend } = setup();
    const granted = await scheduler.reserve({ needGpuMiB, needRamMiB });
    assert.equal(granted.decision, 'retain-text');
    assert.deepEqual(calls, []);
    assert.equal(backend.profile, 'fast');
    const row = scheduler.status().lastResidency;
    assert.match(row.reason, /^Kept text: the image fits beside the loaded text model/);
    assert.deepEqual(row.shortBy, { gpuMiB: 0, ramMiB: 0 });
    await scheduler.release(granted.lease);
    assert.deepEqual(calls, ['free']);
});

test('tight by one MiB on either reserve swaps instead of keeping text', async () => {
    for (const [needGpuMiB, needRamMiB, pattern, field] of [
        [freeBeside - RESERVES.gpuMiB + 1, 1000, /GPU headroom/, 'gpuMiB'],
        [1000, RECORDED.textResidentRamMiB - RESERVES.ramMiB + 1, /physical RAM headroom/, 'ramMiB'],
    ]) {
        const { scheduler, calls } = setup();
        const granted = await scheduler.reserve({ needGpuMiB, needRamMiB });
        assert.equal(granted.decision, 'swap-text');
        assert.deepEqual(calls, ['unload', 'free']);
        const row = scheduler.status().lastResidency;
        assert.match(row.reason, pattern);
        assert.equal(row.shortBy[field], 1);
    }
});

test('fail closed: no reading never keeps text, and a refusal after the swap is recorded with its reason', async () => {
    assert.equal(residencyChoice({ snapshot: null, needGpuMiB: 1, needRamMiB: 1, reserves: RESERVES, textResident: true }).keep, false);
    assert.equal(residencyChoice({ snapshot: { gpus: [], host: besideText.host }, needGpuMiB: 1, needRamMiB: 1, reserves: RESERVES, textResident: true }).keep, false);
    assert.equal(residencyChoice({ snapshot: besideText, needGpuMiB: 1, needRamMiB: 1, reserves: null, textResident: true }).keep, false);
    assert.equal(residencyChoice({ snapshot: { ...besideText, gpus: [{ freeMiB: NaN }] }, needGpuMiB: 1, needRamMiB: 1, reserves: RESERVES, textResident: true }).keep, false);
    const broken = { gpus: [], host: { availableMiB: 30000, commitFreeMiB: 60000 } };
    const { scheduler, calls } = setup({ snapshots: [broken, broken] });
    await assert.rejects(scheduler.reserve({ needGpuMiB: 1000, needRamMiB: 1000 }), /admission refused/);
    assert.deepEqual(calls, ['unload', 'free']);
    assert.equal(scheduler.status().lastResidency.decision, 'refused');
    assert.equal(scheduler.lease, null);
});

test('reserves always held: the admitted lease never leaves less than either reserve by the readings it was given', async () => {
    for (const needGpuMiB of [1000, 2000, 4477, 4478, 9059, 18964]) {
        const { scheduler } = setup();
        const granted = await scheduler.reserve({ needGpuMiB, needRamMiB: 2000 }).catch(() => null);
        if (!granted) continue;
        const row = scheduler.status().lastResidency;
        const source = granted.decision === 'retain-text' ? row.readings : row.admittedReadings;
        assert.ok(source.gpuFreeMiB - needGpuMiB >= RESERVES.gpuMiB, `${needGpuMiB} ${granted.decision}`);
        assert.ok(source.ramAvailableMiB - 2000 >= RESERVES.ramMiB);
    }
});

test('a forced benchmark swap says so instead of blaming memory', async () => {
    const { scheduler } = setup({ experiments: true });
    const granted = await scheduler.reserve({ needGpuMiB: 1000, needRamMiB: 1000, benchmarkMode: 'swap' });
    assert.equal(granted.decision, 'swap-text');
    assert.equal(scheduler.status().lastResidency.reason, 'Benchmark forced a swap.');
});
