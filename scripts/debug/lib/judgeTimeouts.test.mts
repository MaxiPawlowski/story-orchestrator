import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeScene, closeWarden, eventsFromRecord, eventsFromJsonl, j1125Passes, stateBands, timeoutTable, type TimeoutEvent } from './judgeTimeouts.mts';

const at = (ms: number) => new Date(Date.UTC(2026, 8, 26, 12, 0, 0) + ms).toISOString();

const call = (use: string, endMs: number, latencyMs: number, patch: Partial<TimeoutEvent> = {}): TimeoutEvent => ({
  at: at(endMs), chatId: 'c1', messageId: 3, use, stateChars: 2000, questions: 4, latencyMs, fallback: null, cached: false, ...patch,
});

const many = (use: string, count: number, latencyMs = 600, start = 0) =>
  Array.from({ length: count }, (_, index) => call(use, start + index * 10_000, latencyMs, { messageId: index + 1 }));

test('a timed-out warden call that overlaps another warden call on the same message is flagged, an identical one twice over', () => {
  const events = [
    call('warden', 4_000, 4_000, { fallback: 'timeout' }),
    call('warden', 1_500, 1_200),
    call('warden', 9_000, 800, { stateChars: 3000 }),
  ];
  const table = timeoutTable(events, 'warden');
  assert.equal(table.calls, 3);
  assert.equal(table.timeouts.length, 1);
  assert.equal(table.timeouts[0].sharedMessageInFlight, true);
  assert.equal(table.timeouts[0].identicalInFlight, true);
});

test('overlap needs the same chat and the same message: another chat at the same index is not the A8 shape', () => {
  const table = timeoutTable([call('warden', 4_000, 4_000, { fallback: 'timeout' }), call('warden', 1_500, 1_200, { chatId: 'c2' })], 'warden');
  assert.equal(table.timeouts[0].sharedMessageInFlight, false);
});

test('never-sent fallbacks and cache hits are not calls; a cancelled call is not a timeout', () => {
  const table = timeoutTable([
    call('warden', 1_000, 0, { fallback: 'unavailable' }),
    call('warden', 2_000, 0, { cached: true }),
    call('warden', 3_000, 900, { fallback: 'cancelled' }),
    call('warden', 4_000, 700),
  ], 'warden');
  assert.equal(table.calls, 2);
  assert.equal(table.timeouts.length, 0);
  assert.equal(table.successful, 1);
});

test('warden close: fewer than 100 calls is unmeasured and open, never closed', () => {
  const verdict = closeWarden(timeoutTable(many('warden', 99), 'warden'));
  assert.equal(verdict.status, 'unmeasured');
  assert.equal(verdict.label, 'unmeasured (n = 99)');
  assert.equal(verdict.closed, false);
});

test('warden close: 100 calls with 2 timeouts closes, 3 does not', () => {
  const two = [...many('warden', 98), call('warden', 2_000_000, 4_000, { fallback: 'timeout', messageId: 900 }), call('warden', 2_100_000, 4_000, { fallback: 'timeout', messageId: 901 })];
  assert.equal(closeWarden(timeoutTable(two, 'warden')).status, 'closed');
  const three = [...two.slice(0, 97), call('warden', 2_200_000, 4_000, { fallback: 'timeout', messageId: 902 }), ...two.slice(98)];
  assert.equal(timeoutTable(three, 'warden').calls, 100);
  assert.equal(closeWarden(timeoutTable(three, 'warden')).status, 'open');
});

test('p99 is read only over at least 100 successful calls, and the timeout is raised only if p99 exceeds it', () => {
  const short = timeoutTable(many('warden', 99, 4_500), 'warden');
  assert.equal(short.successP99, null);
  assert.equal(closeWarden(short).raiseTimeout, false);
  const slow = timeoutTable(many('warden', 100, 4_500), 'warden');
  assert.equal(slow.successP99, 4_500);
  assert.equal(closeWarden(slow).raiseTimeout, true);
  assert.equal(closeWarden(timeoutTable(many('warden', 100, 3_900), 'warden')).raiseTimeout, false);
});

test('wardenLore-on calls are counted apart and never enter the close', () => {
  const lore = many('warden', 5, 600, 1_000_000).map((event) => ({ ...event, wardenLore: true }));
  const table = timeoutTable([...many('warden', 3), ...lore], 'warden');
  assert.equal(table.calls, 3);
  assert.equal(table.wardenLoreCalls, 5);
});

test('scene: two overlapping calls with one request shape at one message are a burst', () => {
  const table = timeoutTable([call('scene', 2_000, 1_800), call('scene', 2_500, 1_900), call('scene', 30_000, 900, { messageId: 9 })], 'scene');
  assert.equal(table.bursts.length, 1);
  assert.equal(closeScene(table, { j1125Passes: 2 }).closed, false);
});

test('scene close: 0 bursts, at most 1 timeout per 20 calls and J11.25 green twice', () => {
  const clean = [...many('scene', 19), call('scene', 5_000_000, 2_500, { fallback: 'timeout', messageId: 700 })];
  assert.equal(closeScene(timeoutTable(clean, 'scene'), { j1125Passes: 2 }).closed, true);
  assert.equal(closeScene(timeoutTable(clean, 'scene'), { j1125Passes: 1 }).closed, false);
  const twoOut = [...clean.slice(0, 18), call('scene', 6_000_000, 2_500, { fallback: 'timeout', messageId: 701 }), clean[19]];
  assert.equal(closeScene(timeoutTable(twoOut, 'scene'), { j1125Passes: 2 }).closed, false);
});

test('state bands put a single timeout beside its state size', () => {
  const bands = stateBands([call('scene', 1_000, 2_500, { fallback: 'timeout', stateChars: 14_200 }), call('scene', 9_000, 900, { stateChars: 3_000 })]);
  assert.deepEqual(bands.find((band) => band.band === '>12k'), { band: '>12k', calls: 1, timeouts: 1, p50: null, p90: null });
  assert.equal(bands.find((band) => band.band === '0-4k')?.p50, 900);
});

test('J11.25 counts once per record that passed it; a fail or a missing check is not a pass', () => {
  const record = (outcome: string | null) => ({ results: outcome ? [{ id: 'J11.24', outcome: 'pass' }, { id: 'J11.25', outcome }] : [{ id: 'J11.24', outcome: 'pass' }] });
  assert.equal(j1125Passes([record('pass'), record('fail'), record(null), record('pass')]), 2);
});

test('records and journal-follow lines read to the same event shape, duplicates dropped', () => {
  const line = { at: at(1_000), boundary: 1, messageId: 3, kind: 'judge', summary: 'judge warden in 500 ms', detail: { use: 'warden', model: 'jev-1.13.0', questions: 4, stateChars: 900, latencyMs: 500 }, chatId: 'c9' };
  const jsonl = [JSON.stringify(line), JSON.stringify(line), JSON.stringify({ kind: 'boundary', at: at(1) }), ''].join('\n');
  assert.deepEqual(eventsFromJsonl(jsonl), [{ at: at(1_000), chatId: 'c9', messageId: 3, use: 'warden', stateChars: 900, questions: 4, latencyMs: 500, fallback: null, cached: false, wardenLore: false }]);
  const record = { cleanup: { chat: { sandboxChatId: 'c5' }, judgeCalls: { events: [line] } } };
  assert.equal(eventsFromRecord(record)[0].chatId, 'c9');
  assert.equal(eventsFromRecord({ cleanup: { chat: { sandboxChatId: 'c5' }, judgeCalls: { events: [{ ...line, chatId: undefined }] } } })[0].chatId, 'c5');
});
