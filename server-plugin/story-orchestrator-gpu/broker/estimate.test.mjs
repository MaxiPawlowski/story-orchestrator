import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activationMarginMiB, bytesToMiB, estimateGpuMiB } from './estimate.mjs';

test('the estimate reproduces the measured SDXL scene peak', () => {
    const weightsMiB = 6938040682 / 1048576;
    assert.ok(Math.abs(estimateGpuMiB({ weightsMiB, width: 1344, height: 768 }) - 9058) <= 9058 * 0.02);
});

test('the activation margin scales with pixels and jumps for a hires pass', () => {
    const wide = activationMarginMiB({ width: 1344, height: 768 });
    assert.equal(wide, 2442);
    assert.equal(activationMarginMiB({ width: 2688, height: 768 }), 2 * wide);
    assert.ok(activationMarginMiB({ width: 1344, height: 768, hires: true }) > wide);
});

test('bytes convert to MiB and a bad size is refused', () => {
    assert.equal(bytesToMiB(1024 * 1024), 1);
    assert.throws(() => bytesToMiB(-1), /non-negative byte count/);
    assert.throws(() => estimateGpuMiB({ weightsMiB: 0, width: 100, height: 100 }), /positive weights size/);
    assert.throws(() => activationMarginMiB({ width: 0, height: 100 }), /positive render size/);
});
