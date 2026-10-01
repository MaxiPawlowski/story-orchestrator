import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { captureEvidence, EVIDENCE_SLICES, evidenceProblems, splitEvidence } from './sessionEvidence.mts';
import { fakePage, fakeSt, install, uninstall } from './sessionFakes.mts';

afterEach(uninstall);

function fullRuntime() {
  const fake = fakeSt({
    chat: [
      { name: 'Narrator', mes: 'Hall.', send_date: '2026-10-01T10:00:00Z' },
      { name: 'You', is_user: true, mes: 'Hello.', send_date: '2026-10-01T10:00:05Z' },
      { name: 'Belle', mes: 'two', swipes: ['one', 'two'], swipe_id: 1, swipe_info: [{ send_date: 'a' }, { send_date: 'b' }], send_date: '2026-10-01T10:00:20Z', extra: { reasoning: 'Belle weighs the coin.', api: 'textgenerationwebui' } },
    ],
  });
  fake.state.snapshot = {
    ...fake.state.snapshot,
    memory: { entries: [{ id: 'm1', text: 'The party is the Ash Lanterns.' }], chapters: [], canon: null, conflicts: [] },
    chapters: { declared: true, current: null, records: [{ playerTitle: 'The Hall' }] },
    modelCallRing: [{ at: 't', role: 'read', pass: 'shared-read', route: 'p1', result: 'ok', ms: 900, usage: { input: 1000, output: 80, costUsd: 0.0002 } }],
    stagecraft: { proposals: [] },
    talk: { decisions: [{ speaker: 'Belle' }] },
    inline: { items: [{ id: 'progress:transition:1' }] },
  };
  Object.assign(fake.runtime, {
    extras: { judge: { calls: [{ at: 't', use: 'director', inputTokens: 300, outputTokens: 2, cost: 0.0001 }] }, lastSessionAt: '2026-10-01T09:00:00.000Z' },
    getCanon: () => 'CANON',
    co: { memory: { canon: { getCanonProse: () => 'What has happened.' } } },
    memoryActions: { getConflicts: () => [{ key: 'held:a>b' }], lastRefusal: () => null },
    getEpistemic: () => [{ subject: 'Belle', tag: 'knows', content: 'x' }],
    getLedger: () => [],
    getStagecraftState: () => ({ proposals: [{ id: 'p1' }] }),
    getTalkState: () => ({ decisions: [{ speaker: 'Belle' }, { speaker: 'Dalan' }] }),
  });
  return fake;
}

test('evidence: every slice is captured from a live runtime, and none is reported missing', async () => {
  install(fullRuntime());
  const evidence = await captureEvidence(fakePage());
  assert.deepEqual(evidenceProblems(evidence), []);
  for (const slice of EVIDENCE_SLICES) assert.notEqual((evidence.slices as any)[slice], null, slice);
  assert.deepEqual((evidence.slices.judgeCalls as any[]).map((call) => call.use), ['director']);
  assert.equal((evidence.slices.modelCalls as any[])[0].usage.costUsd, 0.0002);
  assert.deepEqual(evidence.slices.memoryQueue, { conflicts: [{ key: 'held:a>b' }], lastRefusal: null });
  assert.equal((evidence.slices.canon as any).prose, 'What has happened.');
  assert.equal((evidence.slices.talkDecisions as any[]).length, 2);
});

test('evidence: the full chat export keeps swipes, swipe ids, swipe info, send dates and reasoning', async () => {
  install(fullRuntime());
  const { chatFull, slices, snapshot } = splitEvidence(await captureEvidence(fakePage()));
  const belle = chatFull[2];
  assert.deepEqual(belle.swipes, ['one', 'two']);
  assert.equal(belle.swipeId, 1);
  assert.equal(belle.swipeInfo.length, 2);
  assert.equal(belle.sendDate, '2026-10-01T10:00:20Z');
  assert.equal(belle.reasoning, 'Belle weighs the coin.');
  assert.equal(belle.extra.api, 'textgenerationwebui');
  assert.equal(chatFull[1].isUser, true);
  assert.ok(snapshot, 'the snapshot is kept beside the slices');
  assert.equal('chat' in slices, false);
});

test('evidence: a runtime that cannot answer a slice is named, never written as an empty success', async () => {
  const fake = fullRuntime();
  (fake.runtime as any).extras = {};
  (fake.runtime as any).getTalkState = () => { throw new Error('talk is not wired'); };
  fake.state.snapshot.talk = undefined;
  install(fake);
  const evidence = await captureEvidence(fakePage());
  const problems = evidenceProblems(evidence);
  assert.ok(problems.some((problem) => problem.startsWith('slice "judgeCalls" is missing')), problems.join('\n'));
  assert.ok(problems.some((problem) => problem.includes('talk is not wired')), problems.join('\n'));
  assert.deepEqual(evidenceProblems(null), ['no evidence was captured']);
});
