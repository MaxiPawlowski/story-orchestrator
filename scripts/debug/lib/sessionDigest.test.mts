import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { ANOMALY_KINDS, digestSession, registerRows, renderFindings, judgeHealth, renderJudgeHealth, withoutForeignRows } from './sessionDigest.mts';
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

test('pin bump digest: a session continued at the lane\'s pin says so in the findings, a normal one does not', async () => {
  const { files, paths } = await loadSessionFiles(fixture('clean'), await loadIndex());
  const plain = digestSession(files, paths);
  assert.equal(plain.continuedAtPin, null);
  assert.doesNotMatch(renderFindings(plain, 'x'), /Continued at the lane/);
  const pin = { lanePin: '59e8821', indexPin: '884380b', holder: 'T1-1', session: 'test/sessions/T1/T1-1-1', chat: 'chat-1', seedRecord: 'report-1.json' };
  const continued = digestSession({ ...files, session: { ...files.session, continuedAtPin: pin } }, paths);
  assert.deepEqual(continued.continuedAtPin, pin);
  assert.match(renderFindings(continued, 'x'), /## Continued at the lane's pin[\s\S]*seeded from `59e8821`; the story index was `884380b`[\s\S]*seed record `report-1\.json`/);
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

test('T1 digest: busy judge fallbacks are counted per session as a quality signal', () => {
  const row = (fallback: string | undefined, use = 'scene') => ({ line: 1, value: { kind: 'judge', detail: { use, ...(fallback ? { fallback } : {}) } } });
  const health = judgeHealth([row(undefined), row(undefined), row('busy', 'memoryPairs'), row('busy', 'memoryPairs'), row('busy', 'wardenLore'), row('timeout'), row('error'), row('disabled')]);
  assert.deepEqual(health, { calls: 7, answered: 2, busy: 3, timeout: 1, otherFallbacks: 1, busyRate: 0.429, busyByUse: { memoryPairs: 2, wardenLore: 1 } });
  assert.deepEqual(renderJudgeHealth(health).slice(0, 2), ['- calls: 7 (answered 2, busy 3, timeout 1, other fallbacks 1)', '- busy rate: 42.9% (by use: memoryPairs 2, wardenLore 1)']);
  assert.deepEqual(judgeHealth([]), { calls: 0, answered: 0, busy: 0, timeout: 0, otherFallbacks: 0, busyRate: null, busyByUse: {} });
  assert.deepEqual(renderJudgeHealth(judgeHealth([])), ['No judge calls in play.']);
});

test('T1 digest: model defects recorded by the loop guard are counted per session, pre-play rows excluded', async () => {
  const index = await loadIndex();
  const { files, paths } = await loadSessionFiles(fixture('planted'), index);
  const digest = digestSession(files, paths);
  assert.deepEqual(digest.modelDefects, { turns: 1, loop: 1, corrupt: 0, repaired: 1, unrepaired: 0 });
  const rows = digest.anomalies.filter((anomaly) => anomaly.kind === 'model-defect');
  assert.deepEqual(rows.map((row) => [row.summary, row.evidence.path, row.evidence.line]), [['model loop in message 7 (Dalan): hard as river stones (x4) (swiped once)', 'turns.jsonl', 2]]);
  assert.match(renderFindings(digest, 'x'), /1 turn\(s\) with a defective reply: loop 1, corrupt 0; swiped once by the loop guard: 1/);
  const clean = await loadSessionFiles(fixture('clean'), index);
  assert.deepEqual(digestSession(clean.files, clean.paths).modelDefects, { turns: 0, loop: 0, corrupt: 0, repaired: 0, unrepaired: 0 });
});

test('T1-7: two chats, two stories: each chat\'s transitions are read against its own story and counted under its own chat', async () => {
  const { files, paths } = await loadSessionFiles(fixture('planted'), await loadIndex());
  const index = await loadIndex();
  const row = (line: number, value: Record<string, unknown>) => ({ line, value });
  const aegis = index.stories['adolion-aegis'];
  const [from, to] = aegis.edges[0];
  const journal = [
    row(1, { at: '2026-10-01T17:33:25Z', kind: 'session', chatId: 'aegis-chat', detail: { chatId: 'aegis-chat', storyId: 'adolion-aegis', activeCheckpointId: from, boundary: 1 } }),
    row(2, { at: '2026-10-01T17:44:00Z', kind: 'transition', chatId: 'aegis-chat', boundary: 2, summary: `${from} → ${to}` }),
    row(3, { at: '2026-10-01T17:44:00Z', kind: 'boundary', chatId: 'aegis-chat', boundary: 2, summary: 'boundary 2' }),
  ];
  const digest = digestSession({ ...files, journal, session: { ...files.session, story: { kind: 'adolion', id: 'adolion-adventurer' }, playFrom: null }, story: index.stories['adolion-adventurer'], stories: index.stories }, paths);
  assert.equal(digest.counts['unexpected-jump'], 0, 'an Aegis transition was judged against the adventurer graph');
});

test('T1-7: rows a tail recorded under a chat whose story it could not name are not that chat\'s history', async () => {
  const row = (line: number, value: Record<string, unknown>) => ({ line, value });
  const rows = [
    row(1, { kind: 'session', chatId: 'b', detail: { chatId: 'b', storyId: 'adolion-aegis', boundary: 17 } }),
    row(2, { kind: 'boundary', chatId: 'b', boundary: 17 }),
    row(3, { kind: 'session', chatId: 'b', detail: { chatId: 'b', storyId: null, activeCheckpointId: 'road-to-wendhope', boundary: 10 } }),
    row(4, { kind: 'boundary', chatId: 'b', boundary: 10 }),
    row(5, { kind: 'boundary', chatId: 'a', boundary: 3 }),
    row(6, { kind: 'session', chatId: 'b', detail: { chatId: 'b', storyId: 'adolion-aegis', boundary: 18 } }),
    row(7, { kind: 'boundary', chatId: 'b', boundary: 18 }),
  ];
  assert.deepEqual(withoutForeignRows(rows).map((item) => item.line), [1, 2, 5, 6, 7]);
});

test('T1-7 recorded: the re-digested session has no phantom rollbacks or jumps and counts per chat', async () => {
  const { files, paths } = await loadSessionFiles(resolve(REPO_ROOT, 'test', 'sessions', 'T1', 'T1-7-1'), await loadIndex());
  const digest = digestSession(files, paths);
  assert.equal(digest.counts.rollback, 0, 'the old digest counted 24, all of them the other story\'s boundaries');
  assert.equal(digest.counts['unexpected-jump'], 0, 'the old digest counted 2');
  assert.ok(Object.keys(digest.countsByChat).filter((chat) => chat.startsWith('2026-10-01@')).length === 2);
  assert.match(renderFindings(digest, 'test/sessions/T1/T1-7-1'), /### By chat/);
});

test('T4-3 digest: a session stop marked INVALID is invalid in the digest too, with stop\'s reasons', async () => {
  const { files, paths } = await loadSessionFiles(fixture('clean'), await loadIndex());
  const stopped = digestSession({ ...files, session: { ...files.session, valid: false, invalid: ['the run header diff failed (exit 1)'] } }, paths);
  assert.equal(stopped.valid, false);
  assert.deepEqual(stopped.invalid, ['stop marked the session INVALID: the run header diff failed (exit 1)']);
  assert.match(renderFindings(stopped, 'x'), /## INVALID SESSION\n\n- stop marked the session INVALID/);
  assert.equal(digestSession({ ...files, session: { ...files.session, valid: true } }, paths).valid, true);
});

test('T4-1 digest: one rollback is one row (a replay past the old high-water mark is not three rollbacks), and repeated rows print once', async () => {
  const { files, paths } = await loadSessionFiles(fixture('clean'), await loadIndex());
  const at = (minute: number) => `2026-09-30T10:${String(minute).padStart(2, '0')}:00.000Z`;
  const boundary = (line: number, value: number) => ({ line, value: { at: at(line - 90), kind: 'boundary', boundary: value, messageId: value, summary: `boundary ${value}`, chatId: 'c1', detail: { source: 'gate', applied: [], discarded: [] } } });
  const busy = (line: number) => ({ line, value: { at: at(30), kind: 'judge', boundary: 9, messageId: 9, summary: 'judge memoryPairs fell back (busy) in 0 ms', chatId: 'c1', detail: { use: 'memoryPairs', fallback: 'busy' } } });
  const journal = [...files.journal.slice(0, 1), ...[9, 6, 7, 8, 9].map((value, at) => boundary(100 + at, value)), busy(200), busy(201), busy(202)];
  const digest = digestSession({ ...files, journal }, paths);
  assert.deepEqual(digest.anomalies.filter((anomaly) => anomaly.kind === 'rollback').map((anomaly) => anomaly.summary), ['boundary went back from 9 to 6']);
  assert.equal(digest.counts['judge-fallback'], 3);
  const markdown = renderFindings(digest, 'x');
  assert.equal(markdown.split('\n').filter((line) => line.startsWith('- ') && line.includes('memoryPairs fell back')).length, 1);
  assert.match(markdown, /memoryPairs fell back \(busy\) \(x3, last [^)]+\) \(`journal.jsonl:200`, `journal.jsonl:201`, `journal.jsonl:202`\)/);
});

test('T4-1 digest: two flags on the same messages print the shared context once', () => {
  const message = (id: number) => ({ id, name: id % 2 ? 'Max' : 'Natalia', isUser: id % 2 === 1, text: `line ${id}` });
  const flag = (at: string, messageId: number, ids: number[]) => ({ at, chatId: 'c1', messageId, note: at, evidence: { path: 'journal.jsonl', line: 1 }, context: ids.map(message), contextFrom: 'event-time' as const });
  const base = digestSession({ session: { charter: 'T4-1', tier: 'T4' }, journal: [], payloads: [], console: [], logs: {}, chats: {}, states: {}, story: null }, { journal: 'journal.jsonl', payloads: 'payloads.jsonl', console: 'console.jsonl', logs: {} });
  const markdown = renderFindings({ ...base, flags: [flag('a', 16, [13, 14, 15, 16]), flag('b', 18, [13, 14, 15, 16, 17, 18])] }, 'x');
  assert.equal(markdown.split('\n').filter((line) => line.includes('#13 Max: line 13')).length, 1);
  assert.match(markdown, /\(#13-#16 as in the flag above\)/);
  assert.match(markdown, /\*\*#18 Natalia: line 18\*\*/);
});
