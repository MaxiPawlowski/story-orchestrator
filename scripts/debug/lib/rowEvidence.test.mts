import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRowEvidence, recordPathsIn, rowEvidenceProblems, ROW_FILES, sliceServerLog, type RowLane } from './rowEvidence.mts';
import { POD_FILES } from './podCapture.mts';

const START = Date.parse('2026-10-07T10:00:00.000Z');
const END = Date.parse('2026-10-07T10:05:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function laneFixture(root: string, { pod }: { pod?: number | null } = {}) {
  const laneRoot = join(root, '3');
  mkdirSync(join(laneRoot, 'debug'), { recursive: true });
  writeFileSync(join(laneRoot, 'server.log'), 'old line\n');
  const lane: RowLane = { n: 3, root: laneRoot, serverLog: join(laneRoot, 'server.log'), lanesRoot: root, pod, noModel: false };
  return lane;
}

function runnerRow(rowDir: string, { page = true, summary = true, record = true, pageErrors = 0 } = {}) {
  mkdirSync(rowDir, { recursive: true });
  writeFileSync(join(rowDir, ROW_FILES.runner), '2026-10-07T10:00:01Z running\n');
  if (page) writeFileSync(join(rowDir, 'page.jsonl'), `${JSON.stringify({ at: iso(START), type: 'info', text: 'attached' })}\n`);
  if (summary) writeFileSync(join(rowDir, 'page-summary.json'), JSON.stringify({ rows: 1, consoleErrors: 0, pageErrorCount: pageErrors, pageErrors: Array.from({ length: pageErrors }, () => ({ at: iso(START), text: 'TypeError: boom\n at x' })), failedRequestCount: 1, httpErrorCount: 1, failedRequests: [{ at: iso(START), method: 'POST', url: 'http://h/api/chats/save', status: 500 }] }));
  const recordFile = join(rowDir, '..', 'so-scenario-result.json');
  if (record) writeFileSync(recordFile, JSON.stringify({ ok: true }));
  return record ? recordFile : null;
}

function podFixture(root: string, k: number, { tunnel = true, samples = true, logMissing = false, drop = false } = {}) {
  const dir = join(root, 'pods', String(k));
  mkdirSync(dir, { recursive: true });
  const jsonl = (name: string, rows: unknown[]) => writeFileSync(join(dir, name), rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
  if (tunnel) jsonl(POD_FILES.tunnel, [
    { at: iso(START - 30_000), kind: 'spawn' }, { at: iso(START - 25_000), kind: 'up' },
    ...(drop ? [{ at: iso(START + 60_000), kind: 'down', reason: 'ssh exited' }, { at: iso(START + 70_000), kind: 'up' }] : []),
    ...[1, 2, 3, 4, 5].map((m) => ({ at: iso(START + m * 60_000 - 5_000), kind: 'heartbeat', state: 'up' })),
  ]);
  if (samples) {
    const ticks = Array.from({ length: 21 }, (_, i) => START + i * 15_000);
    jsonl(POD_FILES.samples, ticks.map((t) => ({ at: iso(t), tunnel: true, health: 200, metrics: {} })));
    jsonl(POD_FILES.gpu, ticks.map((t) => ({ at: iso(t), gpus: [{ index: 0, util: 90, memUsedMiB: 80000, tempC: 70 }] })));
  }
  jsonl(POD_FILES.requests, [{ task: 1, slot: 0, promptTokens: 4000, predictedTps: 31, firstSeenAt: iso(START + 10_000), finishedAt: iso(START + 40_000) }]);
  jsonl(POD_FILES.events, logMissing ? [{ at: iso(START - 60_000), kind: 'log-missing', text: 'not found' }] : [{ at: iso(START + 50_000), kind: 'context-shift', task: 1, slot: 0, text: 'slot context shift' }]);
  if (!logMissing) writeFileSync(join(dir, 'llama-server.0.log'), 'bytes\n');
}

test('a complete row: runner log, copied record, page capture, server log slice; page errors and failed requests are surfaced', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-row-'));
  try {
    const lane = laneFixture(root);
    const offset = readFileSync(lane.serverLog).length;
    appendFileSync(lane.serverLog, 'during the row\n');
    const rowDir = join(root, '3', 'debug', 'batch', 'S', 'x-run1');
    const record = runnerRow(rowDir, { pageErrors: 2 });
    const evidence = collectRowEvidence({ rowDir, lane, start: START, end: END, serverOffset: offset, recordPath: record, notRunnable: null, expect: { record: true, page: true } });
    assert.equal(evidence.complete, true, evidence.problems.join('; '));
    assert.equal(readFileSync(join(rowDir, ROW_FILES.server), 'utf-8'), 'during the row\n');
    assert.ok(existsSync(join(rowDir, ROW_FILES.record)));
    assert.match(evidence.attention.join(' '), /2 page error\(s\): TypeError: boom/);
    assert.match(evidence.attention.join(' '), /1 failed request\(s\): POST http:\/\/h\/api\/chats\/save 500/);
    assert.equal(JSON.parse(readFileSync(join(rowDir, ROW_FILES.evidence), 'utf-8')).complete, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('planted: a row whose page capture is missing is INCOMPLETE, never green', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-row-nopage-'));
  try {
    const lane = laneFixture(root);
    const rowDir = join(root, '3', 'debug', 'batch', 'S', 'x-run1');
    const record = runnerRow(rowDir, { page: false, summary: false });
    const evidence = collectRowEvidence({ rowDir, lane, start: START, end: END, serverOffset: 0, recordPath: record, notRunnable: null, expect: { record: true, page: true } });
    assert.equal(evidence.complete, false);
    assert.match(evidence.problems.join(' '), /page\.jsonl is missing or empty/);
    assert.match(evidence.problems.join(' '), /page-summary\.json is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('planted: an empty runner log and a lost record are INCOMPLETE; a not-runnable row needs no record', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-row-norecord-'));
  try {
    const rowDir = join(root, 'row');
    runnerRow(rowDir, { record: false });
    writeFileSync(join(rowDir, ROW_FILES.runner), '');
    writeFileSync(join(rowDir, ROW_FILES.server), '');
    const problems = rowEvidenceProblems(rowDir, { record: true, page: true, pod: false });
    assert.match(problems.join(' '), /runner\.log is missing or empty/);
    assert.match(problems.join(' '), /record\.json is missing/);
    writeFileSync(join(rowDir, ROW_FILES.runner), 'not-runnable: no pod\n');
    assert.deepEqual(rowEvidenceProblems(rowDir, { record: false, page: true, pod: false }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a pod lane needs the tunnel and pod capture for the row window; with them the row carries tok/s, drops and llama events', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-row-pod-'));
  try {
    const lane = laneFixture(root, { pod: 1 });
    podFixture(root, 1, { drop: true });
    const rowDir = join(root, '3', 'debug', 'batch', 'S', 'x-run1');
    const record = runnerRow(rowDir);
    const evidence = collectRowEvidence({ rowDir, lane, start: START, end: END, serverOffset: 0, recordPath: record, notRunnable: null, expect: { record: true, page: true } });
    assert.equal(evidence.complete, true, evidence.problems.join('; '));
    assert.equal(evidence.podSummary!.tunnelAtStart, 'up');
    assert.equal(evidence.podSummary!.drops, 1);
    assert.equal(evidence.podSummary!.requests, 1);
    assert.equal(evidence.podSummary!.predictedTpsP50, 31);
    assert.match(evidence.attention.join(' '), /tunnel dropped 1 time/);
    assert.match(evidence.attention.join(' '), /context-shift/);
    const pod = JSON.parse(readFileSync(join(rowDir, ROW_FILES.pod), 'utf-8'));
    assert.equal(pod.gpuPeak.memUsedMiB, 80000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('planted: a pod lane without the capture, without the tunnel log, or without a llama log is INCOMPLETE', () => {
  for (const [label, setup, needle] of [
    ['no pod dir at all', () => undefined, /tunnel supervisor .*was not running/],
    ['no tunnel log', (root: string) => podFixture(root, 1, { tunnel: false }), /no tunnel events/],
    ['no samples', (root: string) => podFixture(root, 1, { samples: false }), /no \/health \/metrics sample/],
    ['no llama log', (root: string) => podFixture(root, 1, { logMissing: true }), /LLM_DEBUG_LOG=1/],
  ] as const) {
    const root = mkdtempSync(join(tmpdir(), 'so-row-podgap-'));
    try {
      const lane = laneFixture(root, { pod: 1 });
      setup(root);
      const rowDir = join(root, '3', 'debug', 'batch', 'S', 'x-run1');
      const record = runnerRow(rowDir);
      const evidence = collectRowEvidence({ rowDir, lane, start: START, end: END, serverOffset: 0, recordPath: record, notRunnable: null, expect: { record: true, page: true } });
      assert.equal(evidence.complete, false, label);
      assert.match(evidence.problems.join(' '), needle, label);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('a cloud or no-model lane needs no pod evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-row-cloud-'));
  try {
    for (const lane of [laneFixture(root, { pod: null }), { ...laneFixture(root, { pod: 2 }), noModel: true }]) {
      const rowDir = join(root, 'row');
      const record = runnerRow(rowDir);
      const evidence = collectRowEvidence({ rowDir, lane, start: START, end: END, serverOffset: 0, recordPath: record, notRunnable: null, expect: { record: true, page: true } });
      assert.equal(evidence.complete, true, evidence.problems.join('; '));
      assert.equal(evidence.podSummary, null);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('server log slice: from the row offset, restarted when the log was rotated, capped from the end', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-row-slice-'));
  try {
    const log = join(root, 'server.log');
    writeFileSync(log, 'aaaa\nbbbb\n');
    assert.deepEqual([sliceServerLog(log, 5, join(root, 'o1')).bytes, readFileSync(join(root, 'o1'), 'utf-8')], [5, 'bbbb\n']);
    const rotated = sliceServerLog(log, 999, join(root, 'o2'));
    assert.equal(rotated.rotated, true);
    assert.equal(readFileSync(join(root, 'o2'), 'utf-8'), 'aaaa\nbbbb\n');
    const capped = sliceServerLog(log, 0, join(root, 'o3'), 4);
    assert.equal(capped.truncated, true);
    assert.equal(readFileSync(join(root, 'o3'), 'utf-8'), 'bbb\n');
    assert.equal(sliceServerLog(join(root, 'none.log'), 0, join(root, 'o4')).missing, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the runner output names the record and the failure dump', () => {
  const output = 'Wrote JSON: C:\\lanes\\3\\debug\\2026_so-scenario-failure.json\nstuff\nWrote JSON: C:\\lanes\\3\\debug\\2026_so-scenario-result.json\n';
  assert.deepEqual(recordPathsIn(output), { record: 'C:\\lanes\\3\\debug\\2026_so-scenario-result.json', failure: 'C:\\lanes\\3\\debug\\2026_so-scenario-failure.json' });
  assert.equal(recordPathsIn('Wrote JSON: /x/2026_journey-J3.json\n').record, '/x/2026_journey-J3.json');
  assert.deepEqual(recordPathsIn('nothing'), { record: null, failure: null });
});
