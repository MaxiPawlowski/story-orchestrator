import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MEASURED_RAM, measuredRamMiB, validateRamEstimates } from './ramEstimates.mjs';
import { estimateRamMiB } from './models.mjs';
import { admission } from './policy.mjs';
import { ResidencyScheduler } from './scheduler.mjs';
import { testTempDir } from '../../../scripts/lib/testTemp.mjs';

const RESERVES = { gpuMiB: 2048, ramMiB: 4096 };
const QWEN = [
    { kind: 'diffusionModels', name: 'qwen_image_2.1_int8_convrot.safetensors', weightsMiB: 6920.53662109375 },
    { kind: 'textEncoders', name: 'qwen3vl_8b_int8_convrot.safetensors', weightsMiB: 8917.48176574707 },
    { kind: 'vaes', name: 'qwen_image_2.1_vae_bf16.safetensors', weightsMiB: 644.1886978149414 },
];
const SQUARE = { width: 1024, height: 1024 };
const RECORDED = {
    rerunIdleGpuFreeMiB: 23290,
    rerunPostTextGrantRamMiB: 14774,
    rerunLowestGrantRamMiB: 14774,
    rerunHighestGrantRamMiB: 18381,
    oldEstimateClearedByMiB: 5,
    plan28DesktopLoadRamMiB: 12705.5,
    r14RefusedRamMiB: 9065,
    rerunMaxDropFromIdleMiB: 6782,
    rerunMaxDropFromGrantMiB: 4468,
};
const reading = (availableMiB, gpuFreeMiB = RECORDED.rerunIdleGpuFreeMiB) => ({ highCadence: true,
    gpus: [{ uuid: 'gpu', totalMiB: 24576, usedMiB: 24576 - gpuFreeMiB, freeMiB: gpuFreeMiB }], host: { totalMiB: 32678, availableMiB, commitFreeMiB: 65548 } });

test('the shipped Qwen row is the recorded max drop times 1.2, and the old loader estimate is the 10,673 MiB that refused batches', () => {
    const row = MEASURED_RAM.find((entry) => entry.id === 'qwen-image-2.1-int8-sprites');
    assert.equal(row.ramMiB, Math.ceil(RECORDED.rerunMaxDropFromIdleMiB * 1.2));
    assert.equal(validateRamEstimates(MEASURED_RAM), null);
    const old = estimateRamMiB({ weightMiB: QWEN.reduce((sum, model) => sum + model.weightsMiB, 0), ...SQUARE, streaming: true });
    assert.equal(old, 10673);
    assert.equal(RECORDED.rerunPostTextGrantRamMiB - (old + RESERVES.ramMiB), RECORDED.oldEstimateClearedByMiB);
    assert.ok(row.ramMiB + RESERVES.ramMiB - RECORDED.rerunMaxDropFromIdleMiB >= RESERVES.ramMiB);
});

test('a measured row matches only the same model set, a streaming runtime and its measured size', () => {
    const shuffled = [QWEN[2], QWEN[0], QWEN[1]];
    assert.deepEqual(measuredRamMiB({ models: shuffled, ...SQUARE, streaming: true }), { ramMiB: 8139, source: 'measured:qwen-image-2.1-int8-sprites' });
    assert.equal(measuredRamMiB({ models: QWEN, ...SQUARE, streaming: false }), null);
    assert.equal(measuredRamMiB({ models: QWEN, width: 1344, height: 1344, streaming: true }), null);
    assert.equal(measuredRamMiB({ models: QWEN, ...SQUARE, hires: true, streaming: true }), null);
    assert.equal(measuredRamMiB({ models: QWEN.slice(0, 2), ...SQUARE, streaming: true }), null);
    assert.equal(measuredRamMiB({ models: [{ ...QWEN[0], name: 'qwen_image_2.1_turbo_int8_convrot.safetensors' }, QWEN[1], QWEN[2]], ...SQUARE, streaming: true }), null);
    assert.equal(measuredRamMiB({ models: [], ...SQUARE, streaming: true }), null);
    const rows = [{ id: 'this-host', models: QWEN.map((model) => `${model.kind}:${model.name}`), ramMiB: 9000 }];
    assert.deepEqual(measuredRamMiB({ models: QWEN, ...SQUARE, streaming: true, rows }), { ramMiB: 9000, source: 'config:this-host' });
});

test('validateRamEstimates refuses rows that cannot be matched safely', () => {
    const good = { id: 'x', models: ['vaes:a.safetensors'], ramMiB: 1 };
    assert.equal(validateRamEstimates([good]), null);
    assert.match(validateRamEstimates([{ ...good, ramMiB: -1 }]), /positive number/);
    assert.match(validateRamEstimates([{ ...good, ramMiB: Infinity }]), /positive number/);
    assert.match(validateRamEstimates([{ ...good, models: [] }]), /kind:file name/);
    assert.match(validateRamEstimates([{ ...good, maxPixels: 1.5 }]), /maxPixels/);
    assert.match(validateRamEstimates([{ ...good, streaming: 'yes' }]), /streaming/);
    assert.match(validateRamEstimates('x'), /short list/);
});

async function qwenDirs() {
    const root = await testTempDir('so-ram-');
    const modelDirs = {};
    for (const model of QWEN) {
        const dir = path.join(root, model.kind);
        await fs.mkdir(dir, { recursive: true });
        const header = Buffer.from(JSON.stringify({ weight: { dtype: 'I8', shape: [1], data_offsets: [0, Math.round(model.weightsMiB * 1024 * 1024)] } }));
        const prefix = Buffer.alloc(8);
        prefix.writeBigUInt64LE(BigInt(header.length));
        await fs.writeFile(path.join(dir, model.name), Buffer.concat([prefix, header]));
        modelDirs[model.kind] = [dir];
    }
    return modelDirs;
}

function qwenScheduler({ availableMiB, modelDirs, config = {}, streaming = true }) {
    const calls = [];
    const backend = { status: () => ({ pid: null, profile: null, fitTargetMiB: null }), unload: async () => { calls.push('unload'); }, load: async () => { calls.push('load'); } };
    const scheduler = new ResidencyScheduler({ config: { maxQueue: 2, queueTimeoutMs: 1000, reserves: { ...RESERVES }, modelDirs, ...config }, backend,
        snapshot: async () => reading(availableMiB), queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => { calls.push('free'); },
        startComfy: async () => {}, saveFootprints: async () => {}, runtime: async () => ({ id: 'observed', streaming }) });
    return { scheduler, calls };
}
const qwenLease = { workflowKey: 'qwen21-face-edit', needGpuMiB: 18964, modelFiles: QWEN.map(({ kind, name }) => ({ kind, name })), ...SQUARE, hires: false };

test('recorded readings: the old estimate refuses the Qwen batch under desktop load, the measured one admits it and keeps the reserve', async () => {
    const modelDirs = await qwenDirs();
    const old = estimateRamMiB({ weightMiB: QWEN.reduce((sum, model) => sum + model.weightsMiB, 0), ...SQUARE, streaming: true });
    for (const availableMiB of [RECORDED.plan28DesktopLoadRamMiB, RECORDED.rerunPostTextGrantRamMiB - RECORDED.oldEstimateClearedByMiB - 1]) {
        assert.equal(admission(reading(availableMiB), { gpuMiB: 18964, ramMiB: old }, RESERVES).allowed, false);
        const { scheduler } = qwenScheduler({ availableMiB, modelDirs });
        const granted = await scheduler.reserve(qwenLease);
        assert.equal(granted.decision, 'retain-text');
        assert.equal(scheduler.lease.needRamMiB, 8139);
        const row = scheduler.status().lastResidency;
        assert.equal(row.ramSource, 'measured:qwen-image-2.1-int8-sprites');
        assert.equal(row.reserves.ramMiB, 4096);
        assert.ok(availableMiB - RECORDED.rerunMaxDropFromIdleMiB >= RESERVES.ramMiB);
        await scheduler.release(granted.lease);
    }
    for (const availableMiB of [RECORDED.rerunLowestGrantRamMiB, RECORDED.rerunHighestGrantRamMiB]) {
        const { scheduler } = qwenScheduler({ availableMiB, modelDirs });
        assert.equal((await scheduler.reserve(qwenLease)).decision, 'retain-text');
    }
});

test('recorded readings: genuinely short RAM still refuses (retryable), and the reserve is never traded for the smaller estimate', async () => {
    const modelDirs = await qwenDirs();
    for (const availableMiB of [RECORDED.r14RefusedRamMiB, 8139 + 4096 - 1]) {
        const { scheduler } = qwenScheduler({ availableMiB, modelDirs });
        await assert.rejects(scheduler.reserve(qwenLease), (error) => /admission refused: Insufficient physical RAM/.test(error.message) && error.retryable === true);
        assert.equal(scheduler.lease, null);
        assert.equal(scheduler.status().lastResidency.decision, 'ram-short');
    }
    const { scheduler } = qwenScheduler({ availableMiB: 8139 + 4096, modelDirs });
    assert.equal((await scheduler.reserve(qwenLease)).decision, 'retain-text');
});

test('without a matching row the loader estimate stands: non-streaming runtimes and unmeasured sizes refuse at the old need', async () => {
    const modelDirs = await qwenDirs();
    const nonStreaming = qwenScheduler({ availableMiB: RECORDED.rerunHighestGrantRamMiB, modelDirs, streaming: false });
    await assert.rejects(nonStreaming.scheduler.reserve(qwenLease), /Insufficient physical RAM/);
    assert.equal(nonStreaming.scheduler.status().lastResidency.ramSource, 'loader-estimate');
    const larger = qwenScheduler({ availableMiB: RECORDED.plan28DesktopLoadRamMiB, modelDirs });
    await assert.rejects(larger.scheduler.reserve({ ...qwenLease, width: 1344, height: 1344 }), /Insufficient physical RAM/);
    const requested = qwenScheduler({ availableMiB: RECORDED.plan28DesktopLoadRamMiB, modelDirs });
    await assert.rejects(requested.scheduler.reserve({ ...qwenLease, needRamMiB: 12000 }), /Insufficient physical RAM/);
    assert.equal(requested.scheduler.status().lastResidency.ramSource, 'request');
});

test('a config row for this host overrides the shipped row in both directions', async () => {
    const modelDirs = await qwenDirs();
    const models = QWEN.map((model) => `${model.kind}:${model.name}`);
    const tighter = qwenScheduler({ availableMiB: RECORDED.plan28DesktopLoadRamMiB, modelDirs, config: { ramEstimates: [{ id: 'host', models, ramMiB: 10000 }] } });
    await assert.rejects(tighter.scheduler.reserve(qwenLease), /Insufficient physical RAM/);
    assert.equal(tighter.scheduler.status().lastResidency.ramSource, 'config:host');
    const looser = qwenScheduler({ availableMiB: 10000, modelDirs, config: { ramEstimates: [{ id: 'host', models, ramMiB: 5000 }] } });
    assert.equal((await looser.scheduler.reserve(qwenLease)).decision, 'retain-text');
});
