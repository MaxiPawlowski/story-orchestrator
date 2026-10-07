import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ramGateBytes, waitForFreeRam } from './lib/ramGate.mts';

const GIB = 1024 ** 3;

test('the RAM gate is off unless the threshold is set to a positive number', () => {
  assert.equal(ramGateBytes({}), null);
  assert.equal(ramGateBytes({ SO_MIN_FREE_RAM_GIB: '0' }), null);
  assert.equal(ramGateBytes({ SO_MIN_FREE_RAM_GIB: 'x' }), null);
  assert.equal(ramGateBytes({ SO_MIN_FREE_RAM_GIB: '8' }), 8 * GIB);
});

test('a row waits while free RAM is under the threshold, polls each interval and logs every pause', async () => {
  const readings = [5 * GIB, 7.5 * GIB, 9 * GIB];
  let clock = 0;
  const lines: string[] = [];
  const slept: number[] = [];
  const result = await waitForFreeRam(8 * GIB, { freemem: () => readings.shift() ?? 9 * GIB, sleep: async (ms) => { slept.push(ms); clock += ms; }, log: (line) => lines.push(line), now: () => clock }, 'lane 1 x run 1');
  assert.deepEqual(slept, [60000, 60000]);
  assert.equal(result.pausedMs, 120000);
  assert.deepEqual(result.pauses.map((pause) => pause.freeGiB), [5, 7.5]);
  assert.match(lines[0], /^PAUSE lane 1 x run 1: free RAM 5 GiB < 8 GiB/);
});

test('no pause when RAM is free, and none at all with the gate off (planted control)', async () => {
  const deps = { freemem: () => 2 * GIB, sleep: async () => { throw new Error('slept'); }, log: () => undefined, now: () => 0 };
  assert.deepEqual(await waitForFreeRam(null, deps, 'x'), { pausedMs: 0, pauses: [] });
  assert.deepEqual(await waitForFreeRam(1 * GIB, deps, 'x'), { pausedMs: 0, pauses: [] });
  await assert.rejects(waitForFreeRam(3 * GIB, deps, 'x'), /slept/);
});
