import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { ANOMALY_KINDS, digestSession, registerRows, renderFindings } from './sessionDigest.mts';
import { loadIndex, loadSessionFiles } from '../so-session.mts';

const fixture = (name: string) => resolve(REPO_ROOT, 'scripts', 'debug', 'fixtures', 'session', name);

async function digestOf(name: string) {
  const { files, paths } = await loadSessionFiles(fixture(name), await loadIndex());
  return digestSession(files, paths);
}

test('plan 14 digest: every planted anomaly kind is found, each with an evidence path and line', async () => {
  const digest = await digestOf('planted');
  for (const kind of ANOMALY_KINDS) assert.ok(digest.counts[kind] >= 1, `planted ${kind} was not found (counts ${JSON.stringify(digest.counts)})`);
  for (const anomaly of digest.anomalies) {
    assert.ok(anomaly.evidence.path.length > 0, `${anomaly.kind} has no evidence path`);
    assert.ok(Number.isInteger(anomaly.evidence.line) && anomaly.evidence.line > 0, `${anomaly.kind} has no evidence line`);
  }
});

test('plan 14 digest: the flag carries its note and +-3 turns of chat context', async () => {
  const digest = await digestOf('planted');
  assert.equal(digest.flags.length, 1);
  const [flag] = digest.flags;
  assert.equal(flag.note, 'the narrator packed my bags for me');
  assert.deepEqual(flag.context.map((message) => message.id), [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(flag.evidence.path, 'journal.jsonl');
});

test('plan 14 digest: a clean session yields zero flags and zero anomalies', async () => {
  const digest = await digestOf('clean');
  assert.deepEqual(digest.anomalies, []);
  assert.equal(digest.flags.length, 0);
});

test('plan 14 digest: controls — disabled fallbacks, pre-play rows and host console errors are not anomalies', async () => {
  const digest = await digestOf('planted');
  const fallbacks = digest.anomalies.filter((anomaly) => anomaly.kind === 'judge-fallback');
  assert.ok(fallbacks.every((anomaly) => anomaly.detail?.fallback !== 'disabled'));
  assert.ok(fallbacks.every((anomaly) => anomaly.at && anomaly.at >= '2026-09-30T10:00:30.000Z'), 'a fallback before playFrom was reported');
  assert.equal(digest.counts['console-error'], 1);
  assert.equal(digest.counts['extraction-rejected'], 1, 'audit rows and their extraction summaries counted twice');
});

test('plan 14 digest: the stall needs pending exits (a terminal checkpoint never stalls)', async () => {
  const { files, paths } = await loadSessionFiles(fixture('planted'), await loadIndex());
  const terminal = { ...files.story!, edges: files.story!.edges.filter(([from]) => from !== 'first-night') };
  assert.equal(digestSession({ ...files, story: terminal }, paths).counts.stall, 0);
});

test('plan 14 digest: findings.md and the draft register rows cite the session dir', async () => {
  const digest = await digestOf('planted');
  const rows = registerRows(digest, 'test/sessions/T1/T1-1-1');
  assert.equal(rows.length, digest.flags.length + digest.anomalies.length);
  assert.ok(rows.every((row) => row.evidence.startsWith('test/sessions/T1/T1-1-1/') && /:\d+$/.test(row.evidence)));
  const markdown = renderFindings(digest, 'test/sessions/T1/T1-1-1');
  for (const kind of ANOMALY_KINDS) assert.ok(markdown.includes(`### ${kind} (`), `findings.md has no ${kind} section`);
  assert.ok(markdown.includes('the narrator packed my bags for me'));
});
