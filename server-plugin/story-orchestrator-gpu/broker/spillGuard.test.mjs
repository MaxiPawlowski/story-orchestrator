import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpillGuard, spillGuardOptions, SPILL_DEFAULTS } from './spillGuard.mjs';

const sample = (readings) => ({ gpuProcesses: Object.fromEntries(Object.entries(readings).map(([pid, sharedMiB]) => [pid, { sharedMiB, dedicatedMiB: 20000 }])) });

test('a process whose shared GPU memory stays above its baseline for the sustain window is reported once', () => {
    const guard = new SpillGuard({ ...SPILL_DEFAULTS, thresholdMiB: 512, sustainMs: 3000, settleMs: 0 });
    const roles = { text: 42, comfy: 77 };
    assert.equal(guard.observe(sample({ 42: 1700, 77: 300 }), roles, 0), null);
    assert.equal(guard.observe(sample({ 42: 1640, 77: 300 }), roles, 1000), null);
    assert.equal(guard.observe(sample({ 42: 2100, 77: 300 }), roles, 2000), null);
    assert.equal(guard.observe(sample({ 42: 2400, 77: 300 }), roles, 3000), null);
    assert.equal(guard.observe(sample({ 42: 2400, 77: 300 }), roles, 5500), null);
    assert.deepEqual(guard.observe(sample({ 42: 2400, 77: 300 }), roles, 6100), { role: 'text', pid: 42, deltaMiB: 760, baseMiB: 1640, sharedMiB: 2400 });
    assert.equal(guard.observe(sample({ 42: 2500, 77: 300 }), roles, 9000), null);
    assert.equal(guard.observe(sample({ 42: 1700, 77: 300 }), roles, 9500), null);
    assert.equal(guard.observe(sample({ 42: 2300, 77: 300 }), roles, 10000), null);
    assert.equal(guard.observe(sample({ 42: 2300, 77: 300 }), roles, 13500)?.role, 'text');
});

test('a short burst, a missing reading or a new process id does not count as a spill', () => {
    const guard = new SpillGuard({ ...SPILL_DEFAULTS, sustainMs: 3000 });
    assert.equal(guard.observe(sample({ 42: 1000 }), { text: 42 }, 0), null);
    assert.equal(guard.observe(sample({ 42: 2000 }), { text: 42 }, 1000), null);
    assert.equal(guard.observe(sample({ 42: 1000 }), { text: 42 }, 2000), null);
    assert.equal(guard.observe(sample({ 42: 2000 }), { text: 42 }, 4500), null);
    assert.equal(guard.observe({}, { text: 42 }, 9000), null);
    assert.equal(guard.observe(sample({ 43: 2000 }), { text: 43 }, 9000), null);
    assert.equal(guard.observe(sample({ 43: 2000 }), { text: 43 }, 20000), null);
});

test('the back-off steps by at least the spilled amount and never past its ceiling', () => {
    const guard = new SpillGuard({ ...SPILL_DEFAULTS, stepMiB: 512, maxBackoffMiB: 2048 });
    assert.equal(guard.nextStep(0, 300), 512);
    assert.equal(guard.nextStep(0, 900), 1024);
    assert.equal(guard.nextStep(1536, 900), 512);
    assert.equal(guard.nextStep(2048, 900), 0);
    assert.equal(spillGuardOptions({ spillGuard: { enabled: false } }), null);
    assert.equal(spillGuardOptions({}).thresholdMiB, 512);
    assert.throws(() => spillGuardOptions({ spillGuard: { thresholdMiB: -1 } }), /thresholdMiB/);
});

test('readings during the settle window after a process appears, and zero readings, never set the baseline', () => {
    const guard = new SpillGuard({ ...SPILL_DEFAULTS, sustainMs: 0, settleMs: 15000 });
    assert.equal(guard.observe(sample({ 42: 0 }), { text: 42 }, 0), null);
    assert.equal(guard.observe(sample({ 42: 1640 }), { text: 42 }, 5000), null);
    assert.equal(guard.observe(sample({ 42: 0 }), { text: 42 }, 16000), null);
    assert.equal(guard.observe(sample({ 42: 1640 }), { text: 42 }, 17000), null);
    assert.equal(guard.observe(sample({ 42: 1700 }), { text: 42 }, 18000), null);
    assert.equal(guard.observe(sample({ 42: 2300 }), { text: 42 }, 19000)?.deltaMiB, 660);
});
