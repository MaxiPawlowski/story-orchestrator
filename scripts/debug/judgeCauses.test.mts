import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { TimeoutEvent } from './lib/judgeTimeouts.mts';
import { RECORDER_SOURCE, attribute, loreSelectPerTurn, matchCall, scoreC3, type RecordedCall, type StatusSample } from './lib/judgeCauses.mts';
import { drainRows } from './so-b1-judge-causes.mts';

const g = globalThis as Record<string, any>;
const realFetch = g.fetch;
afterEach(() => { g.fetch = realFetch; delete g.SillyTavern; delete g.__soJudgeCauses; });

const T0 = Date.parse('2026-10-07T12:00:00.000Z');
const event = (index: number, over: Partial<TimeoutEvent> = {}): TimeoutEvent => ({
  at: new Date(T0 + index * 10000 + 4000).toISOString(), chatId: 'c1', messageId: index, use: 'warden', stateChars: 900, questions: 2, latencyMs: 900, fallback: null, cached: false, wardenLore: false, ...over,
});
const sample = (at: number, served: number, over: Partial<StatusSample> = {}): StatusSample => ({ at, ok: true, adaptive: { typesafe: { factor: 1, coolingMs: 0 } }, refusals: { local: 0, lastUpstream: null }, served: { total: served, byUse: { warden: served, wardenLore: served } }, ...over });
const call = (index: number, over: Partial<RecordedCall> = {}): RecordedCall => {
  const startedAt = T0 + index * 10000;
  return { seq: index + 1, use: 'warden', startedAt, endedAt: startedAt + 4000, ms: 4000, status: null, retryAfter: null, outcome: 'aborted', before: sample(startedAt, index), after: sample(startedAt + 4000, index + 1), ...over };
};

const runOf = (calls: number, timeouts: number[], use: 'warden' | 'wardenLore' = 'warden') => Array.from({ length: calls }, (_, index) => event(index, {
  use: 'warden', wardenLore: use === 'wardenLore', stateChars: use === 'wardenLore' ? 1500 : 900, ...(timeouts.includes(index) ? { fallback: 'timeout', latencyMs: 4000 } : {}),
}));

test('B1-C3: <= 1 timeout per 50 calls per use over >= 100 calls; under 100 is INCOMPLETE', () => {
  const events = [...runOf(100, [3, 60]), ...runOf(100, [7], 'wardenLore')];
  const calls = [3, 60].map((index) => call(index));
  const result = scoreC3(events, [...calls, call(7, { use: 'wardenLore' })]);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.incomplete));
  assert.deepEqual(result.uses.map((table) => [table.use, table.calls, table.timeouts]), [['warden', 100, 2], ['wardenLore', 100, 1]]);
  assert.equal(scoreC3([...runOf(100, [1, 2, 3]), ...runOf(100, [], 'wardenLore')], [call(1)]).verdict, 'FAIL', '3 in 100 is over 1 in 50');
  assert.equal(scoreC3([...runOf(99, []), ...runOf(100, [], 'wardenLore')], [call(1)]).verdict, 'INCOMPLETE');
  assert.match(scoreC3([...runOf(100, []), ...runOf(100, [], 'wardenLore')], []).incomplete.join(), /no recorded calls/);
});

test('B1-C3 attribution: hold, queue, provider, and unattributed when the samples cannot say', () => {
  const quiet = call(1);
  assert.equal(attribute(quiet, [quiet]).cause, 'provider');
  const queued = call(1, { after: sample(T0 + 14000, 1) });
  assert.equal(attribute(queued, [queued]).cause, 'queue');
  const cooling = call(1, { before: sample(T0 + 10000, 1, { adaptive: { typesafe: { coolingMs: 3000 } } }) });
  assert.equal(attribute(cooling, [cooling]).cause, 'hold');
  const retry = call(1, { after: sample(T0 + 14000, 2, { refusals: { local: 0, lastUpstream: { at: new Date(T0 + 12000).toISOString(), retryAfter: '5', status: 429 } } }) });
  assert.equal(attribute(retry, [retry]).cause, 'hold');
  const overlap = [call(1, { after: sample(T0 + 14000, 2) }), call(1, { seq: 9, startedAt: T0 + 10500 }), call(1, { seq: 10, startedAt: T0 + 11000 })];
  assert.equal(attribute(overlap[0], overlap).cause, 'unattributed', '1 served of 3 overlapping calls');
  assert.equal(attribute(call(1, { after: null }), []).cause, 'unattributed');
  assert.equal(attribute(null, []).cause, 'unattributed');
  assert.equal(matchCall(event(1, { fallback: 'timeout' }), [call(1, { use: 'wardenLore' })]), null, 'a call of another use never matches');
  assert.equal(matchCall(event(1, { fallback: 'timeout', wardenLore: true }), [call(1, { use: 'wardenLore' })])?.use, 'wardenLore');
});

test('B1-C3 records the client wait against the 4000 ms budget, provider latency and the R4 turn latency', () => {
  const events = [...runOf(100, [5]), ...runOf(100, [], 'wardenLore')];
  const turns = [{ kind: 'turn', ok: true, timing: { totalMs: 9000 } }, { kind: 'turn', ok: true, timing: { totalMs: 12000 } }, { kind: 'turn', ok: false, timing: { totalMs: 99999 } }];
  const result = scoreC3(events, [call(5)], turns);
  const warden = result.uses.find((table) => table.use === 'warden');
  assert.deepEqual(warden?.timeoutRows.map((row) => [row.clientWaitMs, row.budgetMs, row.budgetHit, row.cause]), [[4000, 4000, true, 'provider']]);
  assert.equal(warden?.providerLatencyMs.p50, 900);
  assert.deepEqual([result.r4LatencyWithWardenLore.turns, result.r4LatencyWithWardenLore.p95], [2, 12000]);
  assert.equal(JSON.stringify(result).includes('2026-10-07T'), false, 'the public summary carries no call timestamps');
});

test('B1-C12: lore-select requests per loud turn, zero turns counted, record only', () => {
  const turns = [
    { kind: 'turn', chatId: 'c1', replies: [{ messageId: 2 }] },
    { kind: 'turn', chatId: 'c1', replies: [{ messageId: 4 }, { messageId: 5 }] },
    { kind: 'turn', chatId: 'c1', replies: [{ messageId: 7 }] },
    { kind: 'turn', chatId: 'c1', replies: [] },
  ];
  const lore = [1, 1, 3, 4, 4, 4, 30].map((messageId, index) => event(index, { use: 'lore', messageId, at: new Date(T0 + index * 1000).toISOString() }));
  const result = loreSelectPerTurn(lore, turns);
  assert.equal(result.verdict, 'RECORDED');
  assert.deepEqual([result.turns, result.requests, result.outsideTurns], [3, 6, 1]);
  assert.deepEqual(result.perTurn, { p50: 2, p95: 4, max: 4, zeroTurns: 1 });
  assert.equal(loreSelectPerTurn(lore, []).verdict, 'INCOMPLETE');
});

test('the recorder (against a fake page): labels each plugin call, samples /status around it, leaves other fetches alone', async () => {
  let served = 0;
  const seen: string[] = [];
  g.SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
  g.fetch = async (input: string) => {
    seen.push(input);
    if (input.endsWith('/status')) return { ok: true, status: 200, json: async () => ({ adaptive: {}, refusals: { local: 0 }, served: { total: served, byUse: { warden: served } } }) };
    if (input.endsWith('/systemone')) { served += 1; return { ok: true, status: 200, headers: { get: () => null } }; }
    return { ok: true, status: 200 };
  };
  const install = new Function(`return ${RECORDER_SOURCE}`)();
  assert.equal(install('/api/plugins/story-orchestrator-judge').already, false);
  assert.equal(install('/api/plugins/story-orchestrator-judge').already, true);
  await g.fetch('/api/plugins/story-orchestrator-judge/systemone', { headers: { 'X-SO-Judge-Use': 'wardenLore' } });
  await g.fetch('/api/chats/save', {});
  await new Promise((resolve) => setTimeout(resolve, 20));
  const rows = g.__soJudgeCauses.rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].use, 'wardenLore');
  assert.equal(rows[0].outcome, 'answered');
  assert.ok(rows[0].before?.ok && rows[0].after?.ok);
  assert.equal(seen.filter((url) => url.endsWith('/status')).length, 2);
  const drained = drainRows(rows, 0, 1);
  assert.equal(drained.cursor, 1);
  assert.match(drainRows([{ ...rows[0], seq: 4 }], 1, 1).lines[0], /"kind":"gap","from":2,"to":3/);
});
