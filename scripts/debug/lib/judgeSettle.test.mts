import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JUDGE_ROUTE, trackJudgeRequests } from './judgeSettle.mts';

const harness = () => {
  const page = new EventEmitter();
  let clock = 0;
  const now = () => clock;
  const tracker = trackJudgeRequests(page as never, now);
  const sleep = async (ms: number) => { clock += ms; };
  const request = (path: string) => ({ url: () => `http://127.0.0.1:8000${path}` });
  return { page, tracker, sleep, now, advance: (ms: number) => { clock += ms; }, request };
};

test('a judge call still on the wire holds the meter read until it lands and the page goes quiet', async () => {
  const h = harness();
  const call = h.request(`${JUDGE_ROUTE}/ask`);
  h.page.emit('request', call);
  let landedAt: number | null = null;
  const sleep = async (ms: number) => {
    await h.sleep(ms);
    if (landedAt === null && h.now() >= 4000) {
      landedAt = h.now();
      h.page.emit('requestfinished', call);
    }
  };
  const report = await h.tracker.settle({ quietMs: 3000, timeoutMs: 60000, pollMs: 250, now: h.now, sleep });
  assert.equal(report.settled, true);
  assert.equal(report.inFlight, 0);
  assert.equal(report.seen, 1);
  assert.ok(landedAt !== null && report.waitedMs >= landedAt + 3000, `read at ${report.waitedMs}, call landed at ${landedAt}`);
});

test('control: with no judge call the meter is read after one quiet window, not before', async () => {
  const h = harness();
  h.page.emit('request', h.request('/api/backends/text-completions/generate'));
  const report = await h.tracker.settle({ quietMs: 3000, now: h.now, sleep: h.sleep });
  assert.deepEqual({ settled: report.settled, inFlight: report.inFlight, seen: report.seen }, { settled: true, inFlight: 0, seen: 0 });
  assert.ok(report.waitedMs >= 3000);
});

test('a call that never lands times out as unsettled and says how many were in flight', async () => {
  const h = harness();
  h.page.emit('request', h.request(`${JUDGE_ROUTE}/ask`));
  const report = await h.tracker.settle({ quietMs: 3000, timeoutMs: 10000, now: h.now, sleep: h.sleep });
  assert.deepEqual({ settled: report.settled, inFlight: report.inFlight }, { settled: false, inFlight: 1 });
  assert.ok(report.waitedMs >= 10000);
});

test('a failed judge request counts as landed, and dispose stops listening', async () => {
  const h = harness();
  const call = h.request(`${JUDGE_ROUTE}/ask`);
  h.page.emit('request', call);
  h.page.emit('requestfailed', call);
  assert.equal(h.tracker.inFlight(), 0);
  h.tracker.dispose();
  h.page.emit('request', h.request(`${JUDGE_ROUTE}/ask`));
  assert.equal(h.tracker.inFlight(), 0);
  assert.equal(h.page.listenerCount('request'), 0);
});
