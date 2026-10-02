import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUDGET_START, estimateTokens, isOrchestratorRequest, meterSession, renderBudgetTable, updateBudgetDocument } from './sessionSpend.mts';

const row = (line: number, value: Record<string, unknown>) => ({ line, value });
const deepseekBody = (content: string) => JSON.stringify({ chat_completion_source: 'deepseek', model: 'deepseek-chat', messages: [{ role: 'user', content }] });

const payloads = [
  row(1, { index: 0, epoch: 'e1', capturedAt: '2026-10-01T09:59:00Z', body: deepseekBody('before play') }),
  row(2, { index: 1, epoch: 'e1', capturedAt: '2026-10-01T10:01:00Z', body: deepseekBody('a'.repeat(400)) }),
  row(3, { kind: 'response', epoch: 'e1', requestIndex: 1, text: JSON.stringify({ usage: { prompt_tokens: 120, completion_tokens: 30 }, choices: [{ message: { content: 'DELTA' } }] }) }),
  row(4, { index: 2, epoch: 'e1', capturedAt: '2026-10-01T10:02:00Z', body: deepseekBody('b'.repeat(800)) }),
  row(5, { kind: 'response', epoch: 'e1', requestIndex: 2, text: JSON.stringify({ choices: [{ message: { content: 'c'.repeat(40) } }] }) }),
  row(6, { index: 3, epoch: 'e1', capturedAt: '2026-10-01T10:03:00Z', draftMember: 1, body: JSON.stringify({ api_server: 'http://127.0.0.1:18080', prompt: 'roleplay' }) }),
];

test('spend: DeepSeek usage is measured from captured responses, estimated where the response has none, and pre-play rows are ignored', () => {
  const spend = meterSession({ payloads, playFrom: '2026-10-01T10:00:00Z' });
  assert.equal(spend.orchestrator.calls, 2);
  assert.equal(spend.orchestrator.measuredCalls, 1);
  assert.equal(spend.orchestrator.estimatedCalls, 1);
  assert.equal(spend.orchestrator.input, 120 + estimateTokens('b'.repeat(800)));
  assert.equal(spend.orchestrator.output, 30 + 10);
  assert.equal(spend.main.calls, 1, 'the Artemis roleplay request is not DeepSeek spend');
  assert.equal(spend.responsesCaptured, 2);
});

test('spend: the product\'s model-call ring supplies the cost, matched by the routed profile id', () => {
  const modelCalls = [
    { at: '2026-10-01T10:01:00Z', route: 'ds-profile', usage: { costUsd: 0.002 } },
    { at: '2026-10-01T10:02:00Z', route: 'ds-profile', usage: { costUsd: 0.001 } },
    { at: '2026-10-01T10:02:00Z', route: 'artemis', usage: { costUsd: 9 } },
  ];
  const spend = meterSession({ payloads, modelCalls, playFrom: '2026-10-01T10:00:00Z', orchestratorRoutes: ['ds-profile'] });
  assert.equal(spend.orchestrator.ringCalls, 2);
  assert.ok(Math.abs((spend.orchestrator.costUsd ?? 0) - 0.003) < 1e-9);
});

test('spend: the ring says which profile answered each orchestrator pass, primary or the outage fallback, and the budget table shows it', () => {
  const modelCalls = [
    { at: '2026-10-01T10:01:00Z', route: 'ds-profile', result: 'ok' },
    { at: '2026-10-01T10:02:00Z', route: 'ds-profile', result: 'timeout' },
    { at: '2026-10-01T10:02:01Z', route: 'artemis-memory', result: 'fallback', fallbackFrom: 'ds-profile' },
    { at: '2026-10-01T10:03:00Z', route: 'artemis-memory', result: 'fallback', fallbackFrom: 'ds-profile' },
    { at: '2026-10-01T10:04:00Z', route: 'artemis-memory', result: 'ok' },
    { at: '2026-10-01T09:00:00Z', route: 'ds-profile', result: 'ok' },
  ];
  const spend = meterSession({ payloads: [], modelCalls, playFrom: '2026-10-01T10:00:00Z', orchestratorRoutes: ['ds-profile'] });
  assert.deepEqual(spend.orchestrator.answeredBy, { primary: 1, fallback: 2, failed: 1 });
  assert.equal(spend.orchestrator.ringCalls, 4);
  const table = renderBudgetTable([{ session: 'T9/x', lane: 1, stoppedAt: null, spend }]);
  const lines = table.split('\n');
  assert.ok(lines[2].endsWith('| 1 / 2 / 1 |'), lines[2]);
  assert.ok(lines[3].endsWith('| 1 / 2 / 1 |'), lines[3]);
});

test('spend: TypeSafe judge calls are counted, cached answers and disabled fallbacks are not billed', () => {
  const judgeCalls = [
    { at: '2026-10-01T10:01:00Z', use: 'director', inputTokens: 300, outputTokens: 4, cost: 0.0003 },
    { at: '2026-10-01T10:01:30Z', use: 'director', cached: true, inputTokens: 300 },
    { at: '2026-10-01T10:02:00Z', use: 'loreSelect', fallback: 'disabled' },
    { at: '2026-10-01T09:00:00Z', use: 'director', inputTokens: 999, cost: 1 },
  ];
  const spend = meterSession({ payloads: [], judgeCalls, playFrom: '2026-10-01T10:00:00Z' });
  assert.deepEqual({ calls: spend.judge.calls, cached: spend.judge.cached, fallbacks: spend.judge.fallbacks, input: spend.judge.input, output: spend.judge.output }, { calls: 1, cached: 1, fallbacks: 1, input: 300, output: 4 });
  assert.ok(Math.abs((spend.judge.costUsd ?? 0) - 0.0003) < 1e-9);
});

test('spend: a request is the orchestrator\'s only when its body names the provider', () => {
  assert.equal(isOrchestratorRequest({ body: deepseekBody('x') }), true);
  assert.equal(isOrchestratorRequest({ body: JSON.stringify({ api_server: 'http://127.0.0.1:18080' }) }), false);
  assert.equal(isOrchestratorRequest({ body: 'not json' }), false);
});

test('budget: the generated table is replaced in place and the lead\'s pod-hours section survives', () => {
  const spend = meterSession({ payloads, playFrom: '2026-10-01T10:00:00Z' });
  const first = updateBudgetDocument(null, [{ session: 'test/sessions/T0/T0-1-1', lane: 1, stoppedAt: '2026-10-01T11:00:00Z', spend }]);
  assert.ok(first.includes(BUDGET_START));
  const podHeader = '| Date | Pod | GPU | $/h | Hours | Cost | Note |\n|---|---|---|---|---|---|---|\n';
  assert.ok(first.includes(podHeader));
  const withPod = first.replace(podHeader, `${podHeader}| 2026-10-01 | pod-x | RTX PRO 4500 | 0.72 | 2 | 1.44 | lead |\n`);
  const second = updateBudgetDocument(withPod, [{ session: 'test/sessions/T0/T0-1-1', lane: 1, stoppedAt: '2026-10-01T11:00:00Z', spend }, { session: 'test/sessions/T0/T0-3-1', lane: 2, stoppedAt: null, spend }]);
  assert.ok(second.includes('| 2026-10-01 | pod-x | RTX PRO 4500 | 0.72 | 2 | 1.44 | lead |'));
  assert.ok(second.includes('`test/sessions/T0/T0-3-1`'));
  assert.equal(second.split(BUDGET_START).length, 2);
  assert.match(renderBudgetTable([]), /\*\*Total\*\* \| \| \| 0 \|/);
});

test('stop metering: reads payloads.jsonl and every chat\'s evidence file, matching orchestrator routes from the pin', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { meterDir, readEvidenceFiles } = await import('../so-session.mts');
  const dir = await mkdtemp(join(tmpdir(), 'so-meter-'));
  await writeFile(join(dir, 'payloads.jsonl'), payloads.map((entry) => JSON.stringify(entry.value)).join('\n'), 'utf-8');
  await writeFile(join(dir, 'evidence-c1.json'), JSON.stringify({ slices: { modelCalls: [{ at: '2026-10-01T10:01:00Z', route: 'ds', usage: { costUsd: 0.004 } }], judgeCalls: [{ at: '2026-10-01T10:01:00Z', inputTokens: 10, outputTokens: 1, cost: 0.00001 }] } }), 'utf-8');
  await writeFile(join(dir, 'evidence-c2.json'), JSON.stringify({ slices: { modelCalls: [], judgeCalls: [{ at: '2026-10-01T10:02:00Z', inputTokens: 20, outputTokens: 2 }] } }), 'utf-8');
  assert.deepEqual(Object.keys(await readEvidenceFiles(dir)).sort(), ['c1', 'c2']);
  const spend = await meterDir(dir, { playFrom: '2026-10-01T10:00:00Z', pin: { orchestrator: 'deepseek', routing: { roles: [{ profileId: 'ds' }] } } });
  assert.equal(spend.orchestrator.calls, 2);
  assert.equal(spend.orchestrator.ringCalls, 1);
  assert.equal(spend.judge.calls, 2);
  assert.equal(spend.judge.input, 30);
});
