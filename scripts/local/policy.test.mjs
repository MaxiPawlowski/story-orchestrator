import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admission, chooseResidency, renderSignature, stableSamples, withinReserve } from './policy.mjs';

const snapshot = { gpus: [{ uuid: 'gpu', freeMiB: 8000 }], host: { availableMiB: 6000, commitFreeMiB: 90000 } };
const reserves = { gpuMiB: 2048, ramMiB: 4096 };

test('admission uses live available memory, not installed capacity or the pagefile', () => {
    assert.equal(admission(snapshot, { gpuMiB: 5000, ramMiB: 1500 }, reserves).allowed, true);
    assert.equal(admission(snapshot, { gpuMiB: 5000, ramMiB: 3000 }, reserves).allowed, false);
    assert.equal(admission({ ...snapshot, gpus: [{ freeMiB: 6500 }] }, { gpuMiB: 5000, ramMiB: 1500 }, reserves).allowed, false);
});

test('unknown workflows swap; measured workflows retain only with current headroom', () => {
    assert.equal(chooseResidency({ snapshot, reserves }).action, 'swap');
    const footprint = { verified: true, additionalGpuMiB: 5000, additionalRamMiB: 1500 };
    assert.equal(chooseResidency({ snapshot, reserves, footprint }).action, 'retain');
    assert.equal(chooseResidency({ snapshot: { ...snapshot, host: { ...snapshot.host, availableMiB: 4200 } }, reserves, footprint }).action, 'swap');
});

test('a changed resolution, model or batch gets a new measurement key; prompt text and seed do not', () => {
    const graph = (width, model, seed) => ({ '1': { class_type: 'Loader', inputs: { ckpt_name: model } }, '2': { class_type: 'Sample', inputs: { width, seed, prompt: 'a scene' } } });
    assert.equal(renderSignature(graph(512, 'a', 1)), renderSignature(graph(512, 'a', 2)));
    assert.notEqual(renderSignature(graph(512, 'a', 1)), renderSignature(graph(1024, 'a', 1)));
    assert.notEqual(renderSignature(graph(512, 'a', 1)), renderSignature(graph(512, 'b', 1)));
});

test('the post-load reserve holds only while both live RAM and GPU stay above the floor', () => {
    assert.equal(withinReserve(snapshot, reserves), true);
    assert.equal(withinReserve({ ...snapshot, host: { ...snapshot.host, availableMiB: 3000 } }, reserves), false);
    assert.equal(withinReserve({ ...snapshot, gpus: [{ freeMiB: 1000 }] }, reserves), false);
});

test('footprints verify only after two consistent observations, never one', () => {
    assert.equal(stableSamples([]), false);
    assert.equal(stableSamples([{ gpuMiB: 5000, ramMiB: 2000 }]), false);
    assert.equal(stableSamples([{ gpuMiB: 5000, ramMiB: 2000 }, { gpuMiB: 5100, ramMiB: 2050 }]), true);
    assert.equal(stableSamples([{ gpuMiB: 5000, ramMiB: 2000 }, { gpuMiB: 9000, ramMiB: 2000 }]), false);
});
