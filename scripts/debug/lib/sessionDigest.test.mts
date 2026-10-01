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

const plantedPrivate = async () => {
  const { files, paths } = await loadSessionFiles(fixture('planted'), await loadIndex());
  return { files, paths, only: (next: typeof files) => digestSession(next, paths).anomalies.filter((anomaly) => anomaly.kind === 'empty-private-block') };
};

test('AS-24 digest: the private-block anomaly names the chat and the boundary the knowledge predates', async () => {
  const { files, only } = await plantedPrivate();
  const [anomaly] = only(files);
  assert.equal(anomaly.chatId, 'c1');
  assert.equal(anomaly.detail?.boundary, 7);
  assert.match(anomaly.summary, /drafted in c1 at boundary 7/);
});

test('AS-24 digest: knowledge held in ANOTHER chat never accuses this chat\'s prompt', async () => {
  const { files, only } = await plantedPrivate();
  const payloads = files.payloads.map((row) => (row.value.draftMember === 2 ? { ...row, value: { ...row.value, chatId: 'c2' } } : row));
  assert.equal(only({ ...files, payloads }).length, 0);
  const states = { c2: { ...files.states.c1, epistemic: [] }, c1: files.states.c1 };
  assert.equal(only({ ...files, payloads, states }).length, 0);
});

test('AS-24 digest: knowledge acquired at or after the captured boundary does not count', async () => {
  const { files, only } = await plantedPrivate();
  const later = (createdAt: number, messageId: number) => ({ ...files.states, c1: { ...files.states.c1, epistemic: files.states.c1.epistemic!.map((item) => ({ ...item, createdAt, messageId })) } });
  assert.equal(only({ ...files, states: later(7, 2) }).length, 0, 'created at the capture boundary');
  assert.equal(only({ ...files, states: later(9, 6) }).length, 0, 'created after it');
  assert.equal(only({ ...files, states: later(6, 2) }).length, 1, 'control: created before it');
});

test('AS-24 digest: an index-only member is not resolved across page epochs, and a boundary counter is never compared to a wall clock', async () => {
  const { files, only } = await plantedPrivate();
  const otherEpoch = { ...files.states, c1: { ...files.states.c1, payloadEpoch: 'e2' } };
  assert.equal(only({ ...files, states: otherEpoch }).length, 0);
  const named = files.payloads.map((row) => (row.value.draftMember === 2 ? { ...row, value: { ...row.value, draftMemberName: 'Belle' } } : row));
  assert.equal(only({ ...files, states: otherEpoch, payloads: named }).length, 1, 'a capture that names the member needs no epoch');
  const wallClock = files.payloads.map((row) => (row.value.draftMember === 2 ? { ...row, value: { ...row.value, boundary: undefined, lastMessageId: undefined } } : row));
  const digest = digestSession({ ...files, payloads: wallClock }, { journal: 'journal.jsonl', payloads: 'payloads.jsonl', console: 'console.jsonl', logs: {} });
  assert.equal(digest.counts['empty-private-block'], 0);
  assert.equal(digest.unverifiable.privateBlock, 1);
});

test('T1-2/T1-3 digest: a side call made while a member is drafted is not that member\'s reply', async () => {
  const { files, only } = await plantedPrivate();
  const as = (body: unknown) => files.payloads.map((row) => (row.value.draftMember === 2 ? { ...row, value: { ...row.value, draftMemberName: 'Belle', body: JSON.stringify(body) } } : row));
  const compaction = { messages: [{ role: 'user', content: 'Write plain TEXT ONLY. Do NOT continue the roleplay or speak as any character.\nMaintain a rolling 3-5 sentence summary.' }], model: 'deepseek-flash' };
  const director = { messages: [{ role: 'user', content: 'Decide who speaks.\nAnswer: SPEAKER: <Adolion Narrator | Belle | Dalan>' }] };
  const summarize = { prompt: '<|turn>user\nI head north.<turn|>\n<|turn>system\n[Pause your roleplay. Summarize the most important facts. Your response should include nothing but the summary.]<turn|>\n<|turn>model\n' };
  assert.equal(only({ ...files, payloads: as(compaction) }).length, 0, 'payloads.jsonl:63 (T1-2): a one-message memory pass');
  assert.equal(only({ ...files, payloads: as(director) }).length, 0, 'T1-3 payloads.jsonl:59: the director call');
  assert.equal(only({ ...files, payloads: as(summarize) }).length, 0, 'T1-3 payloads.jsonl:142: ST Summarize, a quiet generation');
  assert.equal(only({ ...files, payloads: as({ prompt: '<|turn>user\nBelle?<turn|>\n<|turn>model\nBelle:' }) }).length, 1, 'control: Belle\'s own text-completion reply');
  assert.equal(only({ ...files, payloads: as({ messages: [{ role: 'system', content: 'card' }, { role: 'user', content: 'Belle?' }] }) }).length, 1, 'control: a chat-completion reply carries the transcript');
});

test('AS-22 digest: a missing capture file makes the session invalid instead of reading as zero anomalies', async () => {
  const { files, paths } = await loadSessionFiles(fixture('clean'), await loadIndex());
  assert.equal(digestSession(files, paths).valid, true);
  const missing = digestSession({ ...files, journal: [], missing: ['journal.jsonl'] }, paths);
  assert.equal(missing.valid, false);
  assert.match(missing.invalid[0], /journal\.jsonl is missing/);
  assert.match(renderFindings(missing, 'x'), /## INVALID SESSION/);
});

test('AS-22 digest: loading a session dir without its captures reports them missing', async () => {
  const { mkdtemp, writeFile, copyFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(resolve(tmpdir(), 'so-digest-'));
  await copyFile(resolve(fixture('clean'), 'session.json'), resolve(dir, 'session.json'));
  await writeFile(resolve(dir, 'console.jsonl'), '', 'utf-8');
  const { files } = await loadSessionFiles(dir, await loadIndex());
  assert.deepEqual(files.missing, ['journal.jsonl', 'payloads.jsonl']);
});

test('AS-23 digest: a flag keeps the transcript it was pressed on, not the edited end state', async () => {
  const { files, paths } = await loadSessionFiles(fixture('planted'), await loadIndex());
  const flagRow = files.journal.find((row) => row.value.kind === 'flag')!;
  const messages = [{ id: 3, name: 'Narrator', isUser: false, text: 'what the flag saw' }, { id: 4, name: 'You', isUser: true, text: 'later edited away' }];
  const turns = [{ line: 1, value: { kind: 'flag', note: flagRow.value.detail?.note, flag: { at: flagRow.value.at }, context: { chatId: 'c1', messageId: 4, messages } } }];
  const [flag] = digestSession({ ...files, turns }, paths).flags;
  assert.equal(flag.contextFrom, 'event-time');
  assert.ok(flag.context.some((message) => message.text === 'what the flag saw'));
  assert.equal(digestSession(files, paths).flags[0].contextFrom, 'end-of-session');
});
