import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busyRows, chunkRows, mergeCalibrationReports } from './calibrationChunks.mts';

test('chunkRows splits in order and refuses a non-positive size', () => {
  assert.deepEqual(chunkRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkRows([1, 2], 10), [[1, 2]]);
  assert.throws(() => chunkRows([1], 0));
});

test('mergeCalibrationReports sums counts and takes the median of the first answered row per case', () => {
  const merged = mergeCalibrationReports([
    { right: 2, total: 3, model: 'jev-1.13.0', p50LatencyMs: 100, rows: [{ id: 'R1.present:a', right: true, latencyMs: 100 }, { id: 'R1.location', right: true, latencyMs: 100 }, { id: 'R2.break', right: false, latencyMs: 300 }] },
    { right: 1, total: 2, model: 'jev-1.13.0', p50LatencyMs: 200, rows: [{ id: 'R3.time', right: true, latencyMs: 200 }, { id: 'R4.break', right: false, latencyMs: 5, fallback: 'timeout' }] },
  ]);
  assert.equal(merged.right, 3);
  assert.equal(merged.total, 5);
  assert.equal(merged.rows.length, 5);
  assert.equal(merged.p50LatencyMs, 200);
  assert.equal(merged.model, 'jev-1.13.0');
  assert.equal(merged.chunks, 2);
});

test('a single report passes through untouched', () => {
  const report = { right: 1, total: 1, model: 'm', p50LatencyMs: 7, rows: [{ id: 'a', right: true, latencyMs: 7 }] };
  assert.equal(mergeCalibrationReports([report]), report);
});

test('busyRows names every row the plugin limiter refused', () => {
  assert.deepEqual(busyRows([{ id: 'a', right: false, fallback: 'busy' }, { id: 'b', right: true }, { id: 'c', right: false, fallback: 'timeout' }]), ['a']);
});
