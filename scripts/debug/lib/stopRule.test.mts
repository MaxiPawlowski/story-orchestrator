import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStop, interleave, isPlumbingError, pilotSize, stopRecord, wilson, withOneRetry, type StopDeclaration, type StopItem } from './stopRule.mts';

const ok = (pass: boolean, id = 'rate'): StopItem => ({ metrics: { [id]: pass } });

function firstStop(declaration: StopDeclaration, items: StopItem[]) {
  for (let index = 1; index <= items.length; index += 1) {
    const decision = evaluateStop(declaration, items.slice(0, index));
    if (decision.stop) return decision.stop;
  }
  return null;
}

test('S0 pilot is min(10, ceil(N/4))', () => {
  assert.deepEqual([1, 4, 5, 20, 37, 40, 41, 147].map(pilotSize), [1, 1, 2, 5, 10, 10, 10, 10]);
});

test('Wilson bounds bracket the rate', () => {
  const { lower, upper } = wilson(4, 40);
  assert.ok(lower < 0.1 && upper > 0.1);
  assert.ok(Math.abs(upper - 0.2302) < 1e-3);
  assert.deepEqual(wilson(0, 0), { lower: 0, upper: 1 });
});

test('table: each rule fires where plan 11 says', () => {
  const rows: Array<{ name: string; declaration: StopDeclaration; items: StopItem[]; want: { rule: string; verdict: string; at: string } | null }> = [
    {
      name: 'S1 exact: 3 misses where 0.9 over 20 allows 2, held until the pilot',
      declaration: { N: 20, floors: [{ id: 'rate', rate: 0.9, direction: 'atLeast' }] },
      items: [false, false, false, true, true, true].map((pass) => ok(pass)),
      want: { rule: 'S1', verdict: 'fail', at: '5/20' },
    },
    {
      name: 'S2 futility: 3/10 cannot reach 0.8 at 95%, misses still allowed exactly',
      declaration: { N: 100, floors: [{ id: 'rate', rate: 0.8, direction: 'atLeast' }] },
      items: Array.from({ length: 12 }, (_, index) => ok(index % 10 < 3)),
      want: { rule: 'S2', verdict: 'fail', at: '10/100' },
    },
    {
      name: 'S3 zero floor: first leak stops inside the pilot',
      declaration: { N: 40, floors: [{ id: 'rate', rate: 0.5, direction: 'atLeast' }], zeroFloors: ['leak'] },
      items: [{ metrics: { rate: true, leak: 0 } }, { metrics: { rate: true, leak: 1 } }, { metrics: { rate: true, leak: 0 } }],
      want: { rule: 'S3', verdict: 'fail', at: '2/40' },
    },
    {
      name: 'S5 plumbing after one retry is not a measurement',
      declaration: { N: 10, floors: [{ id: 'rate', rate: 0.5, direction: 'atLeast' }] },
      items: [ok(true), { plumbing: true, retried: true, error: 'ECONNREFUSED' }],
      want: { rule: 'S5', verdict: 'not-a-measurement', at: '2/10' },
    },
    {
      name: 'atMost: 2 violations where 0.02 over 50 allows 1',
      declaration: { N: 50, floors: [{ id: 'fi', rate: 0.02, direction: 'atMost' }] },
      items: Array.from({ length: 20 }, (_, index) => ok(index === 3 || index === 15, 'fi')),
      want: { rule: 'S1', verdict: 'fail', at: '16/50' },
    },
    {
      name: 'a measurement on track never stops before N',
      declaration: { N: 12, floors: [{ id: 'rate', rate: 0.5, direction: 'atLeast' }], needsAll: true },
      items: Array.from({ length: 12 }, (_, index) => ok(index % 3 !== 0)),
      want: null,
    },
  ];
  for (const row of rows) {
    const stop = firstStop(row.declaration, row.items);
    assert.deepEqual(stop && { rule: stop.rule, verdict: stop.verdict, at: stop.at }, row.want, row.name);
  }
});

test('planted measurement: S4 stops a decided pass early', () => {
  const declaration: StopDeclaration = { N: 20, floors: [{ id: 'rate', rate: 0.75, direction: 'atLeast' }] };
  const stop = firstStop(declaration, Array.from({ length: 20 }, () => ok(true)));
  assert.equal(stop?.rule, 'S4');
  assert.equal(stop?.verdict, 'pass');
  assert.equal(stop?.at, '15/20');
  assert.deepEqual(stop?.counts.metrics.rate, { hits: 15, of: 15, rate: 1 });
});

test('a paired or blind metric that needs every item never stops on S4, but S1 still applies', () => {
  const declaration: StopDeclaration = { N: 20, floors: [{ id: 'rate', rate: 0.75, direction: 'atLeast' }], needsAll: true };
  assert.equal(firstStop(declaration, Array.from({ length: 20 }, () => ok(true))), null);
  const failing = firstStop(declaration, Array.from({ length: 20 }, (_, index) => ok(index < 10)));
  assert.equal(failing?.at, '16/20');
  assert.equal(failing?.rule, 'S1');
});

test('the 2026-10-25 W4 shape (exact set 13/147, floor 0.9) stops on S2 at the 10-read pilot', () => {
  const perRead = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3];
  const hits = [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
  assert.equal(perRead.reduce((sum, value) => sum + value, 0), 147);
  assert.equal(hits.reduce((sum, value) => sum + value, 0), 13);
  const declaration: StopDeclaration = { N: perRead.length, floors: [{ id: 'exactSet', rate: 0.9, direction: 'atLeast' }], zeroFloors: ['asideKeptOut'], needsAll: true };
  const items: StopItem[] = perRead.map((of, index) => ({ metrics: { exactSet: { hits: hits[index], of }, asideKeptOut: 0 } }));
  const stop = firstStop(declaration, items);
  assert.equal(stop?.rule, 'S2');
  assert.equal(stop?.at, '10/37');
  assert.deepEqual(stop?.counts.metrics.exactSet, { hits: 4, of: 40, rate: 0.1 });
  assert.deepEqual(stopRecord(evaluateStop(declaration, items.slice(0, 10)))?.stopped, 'S2');
});

test('counted metrics without a planned denominator skip S1 and S4; a declared one makes S1 exact', () => {
  const items: StopItem[] = Array.from({ length: 4 }, () => ({ metrics: { rate: { hits: 1, of: 4 } } }));
  assert.equal(evaluateStop({ N: 4, floors: [{ id: 'rate', rate: 0.2, direction: 'atLeast' }] }, items.slice(0, 1)).stop, null);
  const planned = evaluateStop({ N: 8, floors: [{ id: 'rate', rate: 0.9, direction: 'atLeast', planned: 32 }] }, items.slice(0, 2)).stop;
  assert.equal(planned?.rule, 'S1');
});

test('pairs: interleaved arms with stops evaluated per pair leave balanced arms', () => {
  const units = Array.from({ length: 20 }, (_, index) => index);
  const declaration: StopDeclaration = { N: units.length, floors: [{ id: 'rate', rate: 0.9, direction: 'atLeast' }] };
  const done: Record<string, number> = { on: 0, off: 0 };
  const items: StopItem[] = [];
  let stopped = null;
  for (const slot of interleave(units, ['on', 'off'])) {
    done[slot.arm] += 1;
    if (!slot.last) continue;
    items.push(ok(slot.unit % 2 === 0));
    stopped = evaluateStop(declaration, items).stop;
    if (stopped) break;
  }
  assert.ok(stopped);
  assert.equal(done.on, done.off);
  assert.deepEqual(interleave(['a', 'b'], ['on', 'off']).map((slot) => `${slot.unit}:${slot.arm}`), ['a:on', 'a:off', 'b:on', 'b:off']);
});

test('one retry: a second throw is reported, a recovered call is marked retried', async () => {
  let calls = 0;
  const recovered = await withOneRetry(async () => { calls += 1; if (calls === 1) throw new Error('flake'); return 7; });
  assert.deepEqual(recovered, { ok: true, value: 7, retried: true });
  const failed = await withOneRetry(async () => { throw new Error('ECONNREFUSED'); });
  assert.deepEqual(failed, { ok: false, error: 'ECONNREFUSED', retried: true });
});

test('plumbing errors are told apart from product failures', () => {
  for (const message of ['Target closed', 'page.evaluate: Execution context was destroyed', 'connect ECONNREFUSED 127.0.0.1:18888', 'SillyTavern CSRF token is stale; reload', 'rt.foo is not a function', 'live harness refused: stale page']) assert.equal(isPlumbingError(message), true, message);
  for (const message of ['expect: activeCheckpoint cp2 != cp1', 'send_generate: no reply (expectReply)', 'vacuous: precondition step 10 kept=0', '', null]) assert.equal(isPlumbingError(message), false, String(message));
});
