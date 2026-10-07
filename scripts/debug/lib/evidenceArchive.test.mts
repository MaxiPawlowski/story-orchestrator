import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyArchive, destinationProblems, inside, planArchive, verifyArchive } from './evidenceArchive.mts';
import { checkRows } from '../so-evidence.mts';
import { ROW_FILES } from './rowEvidence.mts';

function lanesFixture(root: string) {
  const put = (path: string, body = 'x') => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), body); };
  put('3/server.log', 'server');
  put('3/pod.json', '{}');
  put('3/data/default-user/secrets.json', 'KEY');
  put('3/data/default-user/chats/a.jsonl', 'chat');
  put('3/debug/chromium-profile/Default/Cookies', 'c');
  put('3/debug/session.json', '{}');
  put('3/debug/run-header-before.json', '{}');
  put('3/debug/2026_so-scenario-result.json', '{}');
  put('3/debug/2026_other-thing.json', '{}');
  put('3/debug/journal-follow.jsonl', '{}');
  put('3/debug/batch/S/x-run1/runner.log', 'log');
  put('3/debug/b1/35-K2/run-1.raw.json', '{}');
  put('3/adolion-fresh/report-1.json', '{}');
  put('pods/1/llama-server.0.log', 'llama');
  put('pods/1/samples.jsonl', '{}');
  put('batch-2026.json', '{}');
  put('9/debug/run-header-x.json', '{}');
}

test('the archive plan takes run evidence and never data/, the browser profile, secrets or session.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-arch-'));
  try {
    lanesFixture(root);
    const plan = planArchive(root, { lanes: [3], pods: [1] });
    const to = plan.items.map((item) => item.to).sort();
    assert.deepEqual(to, [
      'batches/batch-2026.json',
      'lane-3/adolion-fresh/report-1.json',
      'lane-3/debug/2026_so-scenario-result.json',
      'lane-3/debug/b1/35-K2/run-1.raw.json',
      'lane-3/debug/batch/S/x-run1/runner.log',
      'lane-3/debug/journal-follow.jsonl',
      'lane-3/debug/run-header-before.json',
      'lane-3/pod.json',
      'lane-3/server.log',
      'pod-1/llama-server.0.log',
      'pod-1/samples.jsonl',
    ]);
    assert.ok(!to.some((path) => /secrets|chromium|session\.json|data\//.test(path)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('copy writes ARCHIVE.json with sha256 per file; verify catches a file changed or lost afterwards', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-arch-copy-'));
  try {
    lanesFixture(root);
    const dest = join(root, 'out');
    const manifest = copyArchive(planArchive(root, { lanes: [3], pods: [1] }), dest, { label: 't' });
    assert.equal(manifest.files, 11);
    assert.deepEqual(verifyArchive(dest), []);
    writeFileSync(join(dest, 'pod-1', 'samples.jsonl'), 'edited');
    rmSync(join(dest, 'lane-3', 'server.log'));
    const problems = verifyArchive(dest);
    assert.match(problems.join(' '), /samples\.jsonl changed after archiving/);
    assert.match(problems.join(' '), /server\.log is missing/);
    assert.deepEqual(verifyArchive(join(root, 'nothing')), ['ARCHIVE.json is missing']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the destination must be inside the private work tree and ignored by the public repo', () => {
  assert.deepEqual(destinationProblems('C:/repo/test/sessions/evidence/phase-c/x', { sessionsRoot: 'C:/repo/test/sessions', publicIgnored: true }), []);
  assert.match(destinationProblems('C:/repo/docs/x', { sessionsRoot: 'C:/repo/test/sessions', publicIgnored: true }).join(' '), /not inside the private so-sessions/);
  assert.match(destinationProblems('C:/repo/test/sessions/charters', { sessionsRoot: 'C:/repo/test/sessions', publicIgnored: false }).join(' '), /not ignored by the public repo/);
  assert.match(destinationProblems('C:/x', { sessionsRoot: null, publicIgnored: null }).join(' '), /work tree is unknown/);
  assert.equal(inside('C:/a/b', 'C:/a'), true);
  assert.equal(inside('C:/a', 'C:/a'), false);
  assert.equal(inside('C:/ab', 'C:/a'), false);
});

test('check: a finished batch row whose evidence is incomplete, or never checked, fails; a complete one passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-arch-check-'));
  try {
    const stamp = join(root, '2', 'debug', 'batch', 'S');
    const good = join(stamp, 'a-run1');
    mkdirSync(good, { recursive: true });
    writeFileSync(join(stamp, 'batch.json'), '{}');
    for (const [name, body] of [[ROW_FILES.runner, 'ok\n'], [ROW_FILES.record, '{}'], [ROW_FILES.server, ''], ['page.jsonl', '{}\n'], ['page-summary.json', '{}'], [ROW_FILES.evidence, JSON.stringify({ complete: true, problems: [], podSummary: null })]]) writeFileSync(join(good, name), body);
    const lost = join(stamp, 'b-run1');
    mkdirSync(lost, { recursive: true });
    writeFileSync(join(lost, ROW_FILES.runner), 'ok\n');
    const rows = checkRows(root, [2]);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.dir === good)!.complete, true);
    assert.match(rows.find((row) => row.dir === lost)!.problems.join(' '), /never checked/);
    rmSync(join(good, 'page.jsonl'));
    assert.equal(checkRows(root, [2]).find((row) => row.dir === good)!.complete, false, 'a file removed after the row is caught at archive time');
    assert.ok(existsSync(join(stamp, 'batch.json')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
