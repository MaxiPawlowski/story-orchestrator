import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEntry } from './bundleEntry.mts';
import { gbnfParityVerdict, gbnfRequest, renderSurvivalVerdict, reserveSampleFromStatus, reserveVerdict, sendLatencyVerdict, turnsInRecord, type GbnfRow } from './controllerChecks.mts';

const rows = (entries: Array<[string, string | null, boolean]>): { rows: GbnfRow[] } => ({ rows: entries.map(([id, text, parsed]) => ({ id, kind: id.split('-')[0], text, parsed })) });

test('gbnf parity passes only when every reply parses in both arms and every pair is identical', () => {
  const a = rows([['expression-1', '1|Belle|joy\n', true], ['pose-1', 'sit_bench', true]]);
  assert.equal(gbnfParityVerdict(a, a).pass, true);
  const drift = gbnfParityVerdict(a, rows([['expression-1', '1|Belle|joy\n', true], ['pose-1', 'stand_relaxed', true]]));
  assert.equal(drift.pass, false);
  assert.deepEqual(drift.mismatches, [{ id: 'pose-1', a: 'sit_bench', b: 'stand_relaxed' }]);
  const broken = gbnfParityVerdict(rows([['expression-1', 'garbage', false], ['pose-1', 'x', true]]), rows([['expression-1', 'garbage', false], ['pose-1', 'x', true]]));
  assert.equal(broken.pass, false);
  assert.deepEqual(broken.unparsed, [{ id: 'expression-1', arm: 'a' }, { id: 'expression-1', arm: 'b' }]);
  assert.deepEqual(gbnfParityVerdict(a, rows([['expression-1', '1|Belle|joy\n', true]])).missing, ['pose-1']);
  assert.equal(gbnfParityVerdict({ rows: [] }, { rows: [] }).pass, false);
  const request = gbnfRequest('sys', 'user', 'root ::= "a"');
  assert.deepEqual([request.temperature, request.top_k, request.cache_prompt, request.stream, request.grammar], [0, 1, false, false, 'root ::= "a"']);
  assert.match(String(request.prompt), /^<\|turn>system\nsys<turn\|>\n<\|turn>user\nuser<turn\|>\n<\|turn>model\n$/);
});

test('the shipped sprite grammars build parity cases whose validators accept grammar-shaped answers and refuse others', async () => {
  const kit = await loadEntry<{ gbnfCases(): Promise<Array<{ id: string; kind: string; grammar: string; valid: (text: string) => boolean }>> }>('scripts/debug/lib/gbnfParityEntry.ts');
  const cases = await kit.gbnfCases();
  assert.deepEqual(cases.map((entry) => entry.kind).reduce<Record<string, number>>((sum, kind) => ({ ...sum, [kind]: (sum[kind] ?? 0) + 1 }), {}), { expression: 4, pose: 6 });
  const expression = cases.find((entry) => entry.id === 'expression-3');
  assert.ok(expression);
  assert.match(expression.grammar, /^root ::= line\+/);
  assert.equal(expression.valid('1|Arin|surprise\n'), true);
  assert.equal(expression.valid('nonsense'), false);
  const pose = cases.find((entry) => entry.id === 'pose-1');
  assert.ok(pose);
  assert.match(pose.grammar, /"none"/);
  assert.equal(pose.valid('none'), true);
  assert.equal(pose.valid('flying'), false);
});

test('render survival: completed or failed within 60 s of the event passes; hung, late or eventless fails', () => {
  const t = 1_000_000;
  assert.deepEqual(renderSurvivalVerdict([{ at: t, status: 'running' }, { at: t + 30_000, status: 'complete' }], t + 1000).outcome, 'completed');
  const fast = renderSurvivalVerdict([{ at: t, status: 'running' }, { at: t + 50_000, status: 'failed', error: 'dropped' }], t);
  assert.deepEqual([fast.outcome, fast.pass, fast.afterEventMs], ['failed-fast', true, 50_000]);
  assert.equal(renderSurvivalVerdict([{ at: t + 70_000, status: 'failed' }], t).outcome, 'failed-late');
  const hung = renderSurvivalVerdict([{ at: t, status: 'running' }, { at: t + 61_000, status: 'queued' }], t);
  assert.deepEqual([hung.outcome, hung.pass], ['hung', false]);
  assert.equal(renderSurvivalVerdict([{ at: t, status: 'running' }], t).outcome, 'unsettled');
  assert.equal(renderSurvivalVerdict([{ at: t, status: 'complete' }], null).outcome, 'no-event');
});

test('reserve: fitCorrection, a spill, a crash or a new reserve error fails; a quiet window passes', () => {
  const status = (extra: Record<string, unknown> = {}, root: Record<string, unknown> = {}) => ({ phase: 'text', ...root, text: { fitCorrectionMiB: 0, gpuReclaims: 2, lastError: null, crashed: false, ...extra } });
  const quiet = [reserveSampleFromStatus(status(), 1), reserveSampleFromStatus(status({ gpuReclaims: 3 }), 2)];
  const ok = reserveVerdict(quiet);
  assert.deepEqual([ok.pass, ok.reclaims, ok.samples], [true, 1, 2]);
  const fit = reserveVerdict([...quiet, reserveSampleFromStatus(status({ fitCorrectionMiB: 1536 }), 3)]);
  assert.match(fit.problems.join(' '), /fitCorrection reached 1536 MiB/);
  assert.match(reserveVerdict([...quiet, reserveSampleFromStatus(status({}, { spill: true }), 3)]).problems.join(' '), /spill/);
  assert.match(reserveVerdict([...quiet, reserveSampleFromStatus(status({ lastError: 'text load 409: 900 MiB short of the reserve' }), 3)]).problems.join(' '), /reserve errors/);
  assert.match(reserveVerdict([...quiet, reserveSampleFromStatus(status({ crashed: true }), 3)]).problems.join(' '), /crashed/);
  const old = reserveVerdict([reserveSampleFromStatus(status({ lastError: '409 before the window' }), 1), reserveSampleFromStatus(status({ lastError: '409 before the window' }), 2)]);
  assert.equal(old.pass, true);
  assert.equal(reserveVerdict([]).pass, false);
});

test('send latency needs a predeclared bound, balanced arms, and fails when the first-token p50 rises past it', () => {
  const turns = (ms: number[]) => ms.map((firstTokenMs) => ({ firstTokenMs, doneMs: firstTokenMs + 5000, replies: 1, chars: 300 }));
  const record = (ms: number[]) => ({ steps: [{ index: 0, key: 'eval', ok: true, ms: 1 }, { index: 1, key: 'eval', ok: true, ms: 1, output: { turns: turns(ms) } }] });
  assert.equal(turnsInRecord(record([1, 2])).length, 2);
  assert.equal(turnsInRecord({ result: record([1]) }).length, 1);
  assert.deepEqual(turnsInRecord({ steps: [] }), []);
  assert.throws(() => sendLatencyVerdict(turns([1]), turns([1]), null), /predeclared/);
  const ok = sendLatencyVerdict(turns([2000, 2200, 2100, 2300]), turns([2300, 2500, 2400, 2600]), 500);
  assert.deepEqual([ok.pass, ok.firstTokenDeltaMs], [true, 300]);
  const slow = sendLatencyVerdict(turns([2000, 2200, 2100, 2300]), turns([4000, 4200, 4100, 4300]), 500);
  assert.equal(slow.pass, false);
  assert.match(slow.problems[0], /rose 2000 ms/);
  assert.match(sendLatencyVerdict(turns([1, 2]), turns([1]), 10).problems.join(' '), /unbalanced/);
  assert.match(sendLatencyVerdict([], [], 10).problems.join(' '), /vacuous/);
});
