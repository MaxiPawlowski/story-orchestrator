import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { batchExitCode, createLineStamper, itemArgs, lanePreflight } from './st-lanes.mts';

test('A29: each child line is stamped when it arrives, a split line once it completes', () => {
  const lines: string[] = [];
  let tick = 0;
  const stamper = createLineStamper((line) => lines.push(line), () => new Date(Date.UTC(2026, 8, 26, 0, 0, tick)));
  stamper.push('automated: 3 pass\nFAIL J3.');
  tick = 5;
  stamper.push('2\r\ncleanup: ok\n');
  tick = 9;
  stamper.push('tail without newline');
  stamper.end();
  assert.deepEqual(lines, [
    '2026-09-26T00:00:00.000Z automated: 3 pass',
    '2026-09-26T00:00:05.000Z FAIL J3.2',
    '2026-09-26T00:00:05.000Z cleanup: ok',
    '2026-09-26T00:00:09.000Z tail without newline',
  ]);
});

test('A29 control: lines that arrived at different times do not share one stamp', () => {
  const stamps: string[] = [];
  let tick = 0;
  const stamper = createLineStamper((line) => stamps.push(line.slice(0, 24)), () => new Date(Date.UTC(2026, 8, 26, 0, 0, tick)));
  stamper.push('first\n');
  tick = 30;
  stamper.push('second\n');
  assert.notEqual(stamps[0], stamps[1]);
});

test('a batch with any red run exits non-zero, so `$?` after it is evidence', () => {
  assert.equal(batchExitCode({ green: 8, runs: 10 }), 1);
  assert.equal(batchExitCode({ green: 0, runs: 2 }), 1);
});

test('an all-green batch exits 0; an empty batch is not green', () => {
  assert.equal(batchExitCode({ green: 10, runs: 10 }), 0);
  assert.equal(batchExitCode({ green: 0, runs: 0 }), 1);
});

test('v2.5 plan 01: --wi-gating reaches a journey and never a scenario', () => {
  assert.deepEqual(itemArgs('j7', true, null, 'scan'), ['scripts/debug/so-journey.mts', 'run', 'J7', '--strict', '--wi-gating', 'scan']);
  assert.deepEqual(itemArgs('J3', false, null), ['scripts/debug/so-journey.mts', 'run', 'J3']);
  assert.deepEqual(itemArgs('test/scenarios/x.json', true, 'g1', 'scan'), ['scripts/debug/so-scenario.mts', 'run', 'test/scenarios/x.json', '--sandbox', '--group', 'g1']);
});

test('v2.5 plan 12: a lane batch refuses a prod or missing dist/ before any lane runs', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-lane-preflight-'));
  try {
    assert.match(String(lanePreflight(root)), /no dist\/manifest\.json/);
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'manifest.json'), JSON.stringify({ kind: 'build-manifest', flavor: 'prod' }));
    assert.match(String(lanePreflight(root)), /flavor "prod".*npm run build:dev && npm run serve:dev/);
    writeFileSync(join(root, 'dist', 'manifest.json'), '{not json');
    assert.match(String(lanePreflight(root)), /no dist\/manifest\.json/);
    writeFileSync(join(root, 'dist', 'manifest.json'), JSON.stringify({ kind: 'build-manifest', flavor: 'dev' }));
    assert.equal(lanePreflight(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
