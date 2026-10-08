import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { batchExitCode, createLineStamper, itemArgs, lanePreflight, rowStatus, runEvidenceRequired } from './st-lanes.mts';

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

test('a lane batch refuses a missing dist/ before any lane runs; the one build passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-lane-preflight-'));
  try {
    assert.match(String(lanePreflight(root)), /no dist\/manifest\.json/);
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'manifest.json'), JSON.stringify({ kind: 'not-a-build' }));
    assert.match(String(lanePreflight(root)), /no dist\/manifest\.json.*npm run build && npm run stage/);
    writeFileSync(join(root, 'dist', 'manifest.json'), '{not json');
    assert.match(String(lanePreflight(root)), /no dist\/manifest\.json/);
    writeFileSync(join(root, 'dist', 'manifest.json'), JSON.stringify({ kind: 'build-manifest' }));
    assert.equal(lanePreflight(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a row is GREEN only with exit 0 AND complete evidence; missing evidence is INCOMPLETE even when the run passed', () => {
  assert.equal(rowStatus(0, true, null), 'GREEN');
  assert.equal(rowStatus(0, false, null), 'INCOMPLETE');
  assert.equal(rowStatus(1, false, null), 'INCOMPLETE');
  assert.equal(rowStatus(1, true, null), 'RED');
  assert.equal(rowStatus(2, true, 'no pod'), 'NOT-RUNNABLE');
  assert.equal(batchExitCode({ green: 1, runs: 2 }), 1, 'an INCOMPLETE row is not counted green');
});

test('st-lanes run enforces evidence for B1 model runs, integration plays and --evidence, not for a plain script', () => {
  assert.equal(runEvidenceRequired(['scripts/debug/so-b1-hooks.mts', 'label'], []), true);
  assert.equal(runEvidenceRequired(['scripts/debug/so-b1-hooks.mts', 'score'], []), false);
  assert.equal(runEvidenceRequired(['scripts/debug/so-integration.mts', 'play'], []), true);
  assert.equal(runEvidenceRequired(['scripts/debug/st-session.mts', 'reload'], []), false);
  assert.equal(runEvidenceRequired(['scripts/debug/st-session.mts', 'reload'], ['--evidence']), true);
});

test('B1b H6: batch reloads the lane page before every repeat after the first (rule 11: clears the judge cache), never before run 1', async () => {
  const { betweenRunsArgs } = await import('./st-lanes.mts');
  assert.equal(betweenRunsArgs(1), null);
  assert.deepEqual(betweenRunsArgs(2), ['scripts/debug/st-session.mts', 'reload']);
  assert.deepEqual(betweenRunsArgs(3), ['scripts/debug/st-session.mts', 'reload']);
});
