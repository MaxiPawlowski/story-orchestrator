import { test } from 'node:test';
import assert from 'node:assert/strict';
import { M6_FLOORS, classifyCall, summarizeM6, type M6Row, type ModelCallRow } from './lib/m6Contention.mts';
import { armM6InPage } from './so-m6.mts';

const call = (id: number, t0: number, t1: number | null, extra: Partial<ModelCallRow> = {}): ModelCallRow => ({ kind: 'call', id, epoch: 'e1', t0, t1, profileId: 'mem', ok: true, ...extra });
const gen = (id: number, t0: number, t1: number | null, dry = false): M6Row => ({ kind: 'generation', id, epoch: 'e1', t0, t1, type: 'normal', dry });

test('v2.5 plan 05 M6: a failure is classified by what its error says', () => {
  assert.equal(classifyCall(call(1, 0, 10)), 'ok');
  assert.equal(classifyCall(call(1, 0, null, { ok: null })), 'open');
  assert.equal(classifyCall(call(1, 0, 10, { ok: false, errorMessage: 'Too Many Requests' })), 'rate-limit');
  assert.equal(classifyCall(call(1, 0, 10, { ok: false, errorMessage: 'API request failed: 429' })), 'rate-limit');
  assert.equal(classifyCall(call(1, 0, 10, { ok: false, errorName: 'AbortError', abortReason: 'TimeoutError: the memory model did not answer within 30000 ms' })), 'timeout');
  assert.equal(classifyCall(call(1, 0, 10, { ok: false, errorName: 'AbortError', errorMessage: 'signal is aborted without reason' })), 'lapse', 'an ownership lapse is not a timeout');
  assert.equal(classifyCall(call(1, 0, 10, { ok: false, errorMessage: 'API request failed' })), 'error');
});

test('v2.5 plan 05 M6: only a timeout that overlaps a real main generation in the same page epoch is coincident', () => {
  const timeout = { ok: false, errorName: 'TimeoutError', errorMessage: 'timed out' } as const;
  const rows: M6Row[] = [
    gen(1, 100, 200),
    gen(2, 500, 600, true),
    call(10, 150, 260, timeout),
    call(11, 300, 400, timeout),
    call(12, 520, 580, timeout),
    call(13, 120, 190),
    { ...call(14, 150, 260, timeout), epoch: 'e2' },
  ];
  const summary = summarizeM6(rows);
  assert.equal(summary.mainGenerations, 1);
  assert.equal(summary.timeouts, 4);
  assert.deepEqual(summary.coincident.map((row) => row.call), [10]);
  assert.equal(summary.opens.mutexDeferral, false);
  assert.equal(summary.opens.rpmSpacing, false);
});

test('v2.5 plan 05 M6: the predeclared floors open the items and nothing else does', () => {
  assert.deepEqual(M6_FLOORS, { rateLimited: 1, coincidentTimeouts: 3 });
  const timeout = { ok: false, errorMessage: 'timed out' } as const;
  const three = summarizeM6([gen(1, 0, 1000), call(1, 10, 20, timeout), call(2, 30, 40, timeout), call(3, 50, 60, timeout)]);
  assert.equal(three.opens.mutexDeferral, true);
  const two = summarizeM6([gen(1, 0, 1000), call(1, 10, 20, timeout), call(2, 30, 40, timeout)]);
  assert.equal(two.opens.mutexDeferral, false);
  assert.equal(summarizeM6([call(1, 0, 10, { ok: false, errorMessage: 'rate limit exceeded' })]).opens.rpmSpacing, true);
});

test('v2.5 plan 05 M6: the in-page recorder wraps the memory-model seam once and records generations', async () => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const service = { sendRequest: async (profileId: string) => { if (profileId === 'dead') throw new Error('Too Many Requests'); return { ok: 1 }; } };
  const context = {
    ConnectionManagerRequestService: service,
    eventSource: { on: (name: string, fn: (...args: unknown[]) => void) => { (listeners[name] ??= []).push(fn); } },
    eventTypes: { GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended', GENERATION_STOPPED: 'generation_stopped' },
  };
  const g = globalThis as Record<string, unknown>;
  g.SillyTavern = { getContext: () => context };
  try {
    armM6InPage();
    armM6InPage();
    assert.equal(listeners.generation_started.length, 1, 'arming twice installs once');
    listeners.generation_started[0]('normal', {}, false);
    await service.sendRequest('mem');
    await assert.rejects(service.sendRequest('dead'));
    listeners.generation_ended[0]();
    const state = g.__soM6 as { rows: M6Row[] };
    const summary = summarizeM6(state.rows);
    assert.equal(summary.calls, 2);
    assert.equal(summary.rateLimited, 1);
    assert.equal(summary.mainGenerations, 1);
    assert.ok(state.rows.every((row) => row.t1 !== null));
  } finally {
    delete g.SillyTavern;
    delete g.__soM6;
  }
});
