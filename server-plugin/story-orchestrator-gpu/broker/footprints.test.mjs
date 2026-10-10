import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footprintKey, observedFootprint, FOOTPRINT_REVISION } from './footprints.mjs';
import { estimateRamMiB } from './models.mjs';
import { admission } from './policy.mjs';

const identity = { workflowKey: 'sdxl', runtime: { torch: '2.12.1+cu130', id: 'comfy' }, models: [{ name: 'sdxl', modified: 1 }], cacheState: 'cold' };
const lease = { identity, before: { gpus: [{ usedMiB: 1000 }], host: { availableMiB: 23000 } }, peakGpu: 18000, lowRam: 17000,
    lowGpu: 4000, lowCommit: 50000, highCadence: true, needRamMiB: 21000 };
const reserves = { gpuMiB: 2048, ramMiB: 4096 };

test('RAM observation is independent of GPU demand and its prior estimate', () => {
    const first = observedFootprint(lease, null, reserves);
    assert.equal(first.gpuMiB, 17512);
    assert.equal(first.ramMiB, 7712);
    assert.equal(first.verified, false);
    assert.equal(observedFootprint(lease, first, reserves).verified, true);
});

test('runtime, model identity, cache state and resident text each invalidate the footprint key', () => {
    const key = footprintKey(identity);
    for (const change of [{ runtime: { torch: '2.7.1+cu128' } }, { models: [{ name: 'sdxl', modified: 2 }] }, { cacheState: 'warm' }, { text: { fitTarget: 11107 } }]) {
        assert.notEqual(footprintKey({ ...identity, ...change }), key);
    }
});

test('old observations, sparse samples and any reserve miss cannot verify a budget', () => {
    const legacy = { samples: [{ gpuMiB: 1, ramMiB: 1 }], verified: true };
    assert.equal(observedFootprint(lease, legacy, reserves).samples.length, 1);
    const first = observedFootprint(lease, null, reserves);
    for (const change of [{ highCadence: false }, { lowRam: 3000 }, { lowGpu: 1000 }, { lowCommit: 2000 }]) {
        assert.equal(observedFootprint({ ...lease, ...change }, first, reserves).verified, false);
    }
});

test('disk streaming prices the host staging window instead of mirroring VRAM allocation', () => {
    const args = { weightMiB: 17000, width: 1344, height: 768, hires: false };
    assert.equal(estimateRamMiB({ ...args, streaming: true }), 10634);
    assert.equal(estimateRamMiB(args), 19442);
});

test('repeated safe Qwen renders remain admissible after learned demand replaces the estimate', () => {
    const rendered = { ...lease, before: { gpus: [{ usedMiB: 1500 }], host: { availableMiB: 24000 } },
        peakGpu: 20100, lowGpu: 4476, lowRam: 16000 };
    const first = observedFootprint(rendered, null, reserves);
    const learned = observedFootprint(rendered, first, reserves);
    assert.equal(learned.verified, true);
    assert.equal(learned.gpuMiB, 19112);
    const idle = { gpus: [{ freeMiB: 23076 }], host: { availableMiB: 24000, commitFreeMiB: 70000 } };
    assert.equal(admission(idle, learned, reserves).allowed, true);
    const inflated = { ...learned, gpuMiB: Math.ceil((rendered.peakGpu - 1500) * 1.2 + 512) };
    assert.equal(admission(idle, inflated, reserves).allowed, false);
    assert.equal(admission({ ...idle, gpus: [{ freeMiB: learned.gpuMiB + 2047 }] }, learned, reserves).allowed, false);
});

test('inflated prior-revision budgets stay historical and cannot verify the revised accounting', () => {
    const old = { revision: FOOTPRINT_REVISION - 1, verified: true, samples: [{ gpuMiB: 23000, ramMiB: 7712 }] };
    const fresh = observedFootprint(lease, old, reserves);
    assert.equal(fresh.samples.length, 1);
    assert.equal(fresh.verified, false);
});
