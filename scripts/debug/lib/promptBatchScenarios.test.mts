import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARM_EVAL, DISARM_EVAL, drainRecorder, installRecorder, setRecorderPlan } from './promptBatchRecorder.mts';
import { captureVariant } from './promptBatchScenario.mts';
import {
  anchoredFirst, armOrder, DEFAULT_SAGA_REPLY, loadScenarioKit, ltCannedLines, ltDeclaration, ltStopItem, modelRefusals, splitNeedles, pairedBootstrap, sagaPlan, SAGA_RULES, SUGGESTION_RULE,
} from './promptBatchScenarios.mts';
import {
  fillTemplate, hiddenFacts, opencodeText, readPassA, readPassB, refuseModel, renderPlayerView, renderSet,
} from './promptBatchRater.mts';
import { evaluateStop } from './stopRule.mts';
import type { BatchItem } from './promptBatch.mts';

const run = (code: string) => new Function(`return (async () => { ${code} })()`)();

test('captureVariant arms the recorder around the record step, captures the context after it and makes the run no-model', () => {
  const scenario = { _note: 'x', requires: { lane: 'model', group: 'G' }, steps: [{ eval: 'a' }, { eval: "localStorage.setItem('so-v29-06lt-' + 1)" }, { eval: 'cleanup' }] };
  const out = captureVariant(scenario, { armBefore: (step) => String(step.eval).includes('so-v29-06lt-'), contextAfter: (step) => String(step.eval).includes('so-v29-06lt-'), contextEval: 'CTX', note: 'variant' });
  assert.deepEqual(out.requires, { lane: 'no-model', group: 'G' });
  assert.deepEqual(out.steps.map((step) => step.eval), ['a', ARM_EVAL, "localStorage.setItem('so-v29-06lt-' + 1)", 'CTX', DISARM_EVAL, 'cleanup']);
  assert.equal(out.steps[3].log, true);
  assert.match(String(out._note), /^variant x/);
  assert.equal(scenario.steps.length, 3);
});

test('captureVariant truncates after the context step, applies edits, and refuses an ambiguous or missing step', () => {
  const scenario = { steps: [{ eval: 'one' }, { eval: 'for (i < 300) seal' }, { slash: '/newchat' }] };
  const seal = (step: Record<string, unknown>) => String(step.eval ?? '').includes('seal');
  const out = captureVariant(scenario, { armBefore: (_step, index) => index === 0, contextAfter: seal, contextEval: 'CTX', truncate: true, edits: [{ step: seal, from: 'i < 300', to: 'i < 20' }], note: 'n' });
  assert.deepEqual(out.steps.map((step) => step.eval ?? step.slash), [ARM_EVAL, 'one', 'for (i < 20) seal', 'CTX', DISARM_EVAL]);
  assert.throws(() => captureVariant(scenario, { armBefore: () => true, contextAfter: seal, contextEval: 'C', note: 'n' }), /exactly one arm step, found 3/);
  assert.throws(() => captureVariant(scenario, { armBefore: seal, contextAfter: () => false, contextEval: 'C', note: 'n' }), /exactly one context step, found 0/);
  assert.throws(() => captureVariant(scenario, { armBefore: seal, contextAfter: seal, contextEval: 'C', edits: [{ step: seal, from: 'absent', to: 'x' }], note: 'n' }), /no "absent"/);
});

test('the recorder answers text calls by rule in sequence, passes the lore plugin through and refuses other model routes', async () => {
  const g = globalThis as any;
  const originalFetch = g.fetch;
  const passed: string[] = [];
  g.fetch = async (input: string) => { passed.push(String(input)); return new Response('{}', { status: 200 }); };
  g.__soPromptBatch = undefined;
  const page = { evaluate: (fn: (arg: unknown) => unknown, arg?: unknown) => Promise.resolve(fn(arg)) } as any;
  const post = (prompt: string) => fetch('/api/backends/text-completions/generate', { method: 'POST', body: JSON.stringify({ prompt: `<|turn>user\n${prompt}`, api_type: 'llamacpp' }) }).then((response) => response.text());
  try {
    await installRecorder(page);
    await setRecorderPlan(page, { rules: [{ id: 'saga', source: SAGA_RULES.saga, replies: ['first', 'second'] }], canned: 'other' });
    assert.equal(await post('The story below has ended; write its epilogue.'), '{}', 'not armed yet');
    await run(ARM_EVAL);
    assert.deepEqual([await post('The story below has ended; write its epilogue.'), await post('x The story below has ended; write its epilogue.'), await post('x The story below has ended; write its epilogue.'), await post('scene')], ['first', 'second', 'second', 'other']);
    await fetch('/api/plugins/story-orchestrator-lore/commit', { method: 'POST', body: '{}' });
    await assert.rejects(fetch('/api/plugins/story-orchestrator-harness/run', { method: 'POST', body: '{}' }), /refused model call/);
    await assert.rejects(fetch('/api/plugins/story-orchestrator-media/discover', { method: 'POST', body: '{}' }), /refused model call/);
    await run(DISARM_EVAL);
    const state = await drainRecorder(page);
    assert.deepEqual(state.calls.map((call) => call.rule), ['saga', 'saga', 'saga', null]);
    assert.deepEqual(modelRefusals(state.refused).map((call) => call.url), ['/api/plugins/story-orchestrator-harness/run']);
    assert.deepEqual(passed, ['/api/backends/text-completions/generate', '/api/plugins/story-orchestrator-lore/commit']);
    await assert.rejects(run(ARM_EVAL), /no plan/);
  } finally {
    g.fetch = originalFetch;
    delete g.__soPromptBatch;
  }
});

test('the suggestion rule matches the shipped prompt opening inside an instruct template', () => {
  assert.match('<|turn>user\nYou help a player who is stuck in a roleplay story. Write exactly 4', new RegExp(SUGGESTION_RULE));
  const plan = sagaPlan({ recordReplies: ['r1'], sagaReply: 'e' });
  assert.deepEqual(plan.rules.map((rule) => rule.id), ['saga', 'record', 'map', 'era']);
  assert.equal(JSON.parse(plan.rules[0].replies[0]).stop_type, 'limit');
  assert.match(JSON.parse(plan.rules[0].replies[0]).content, /began$/);
});

test('lt06 arm order and blind set order follow frozen.json', () => {
  assert.deepEqual(armOrder('s01'), ['current', 'anchored']);
  assert.deepEqual(armOrder('s02'), ['anchored', 'current']);
  assert.equal(anchoredFirst('abc', 's01'), anchoredFirst('abc', 's01'));
  const bits = Array.from({ length: 40 }, (_, index) => anchoredFirst('corpus', `s${String(index + 1).padStart(2, '0')}`));
  assert.ok(bits.includes(true) && bits.includes(false));
  const canned = ltCannedLines('anchored', { expect: { computed: { candidates: [{ id: 'a', text: 'Find the oil' }], selectedOffline: ['a'] } } });
  assert.equal(canned[0], '- [1] I work toward this: Find the oil');
  assert.equal(canned[1], '- [2] I ask about the matter that is still unresolved.');
  assert.ok(ltCannedLines('current', {}).every((line) => !line.includes('[')));
});

const item = (id: string, arm: string): BatchItem => ({ id, sha: 'x', path: '/completion', calls: 1, builderInBody: true, selfCheck: { ok: true }, inPage: null, meta: { arm } });

test('lt06 stop rule: a leak needle in either arm stops S3 at once, the mechanical floors stop S1 after the pilot, never S4', () => {
  const manifest = { items: Array.from({ length: 40 }, (_, index) => item(`s${index}/${index % 2 ? 'anchored' : 'current'}`, index % 2 ? 'anchored' : 'current')) };
  const declaration = ltDeclaration(manifest);
  assert.deepEqual(declaration.floors.map((floor) => [floor.id, floor.planned]), [['usable', 20], ['grounded', 20]]);
  assert.deepEqual(declaration.zeroFloors, ['leak']);
  const good = (arm: 'current' | 'anchored') => ltStopItem({ arm, usable: true, grounded: true, needles: [] });
  assert.equal(evaluateStop(declaration, [good('current'), ltStopItem({ arm: 'current', usable: true, grounded: false, needles: ['river barge'] })]).stop?.rule, 'S3');
  const allGood = Array.from({ length: 39 }, (_, index) => good(index % 2 ? 'anchored' : 'current'));
  assert.equal(evaluateStop(declaration, allGood).stop, null);
  const failing = Array.from({ length: 10 }, (_, index) => (index % 2 ? ltStopItem({ arm: 'anchored', usable: false, grounded: false, needles: [] }) : good('current')));
  assert.equal(evaluateStop(declaration, failing).stop?.rule, 'S1');
  assert.equal(evaluateStop(declaration, failing.slice(0, 6)).stop, null, 'pilot');
});

test('pairedBootstrap is seeded and brackets the mean', () => {
  const deltas = [1, 0, 2, 1, -1, 1, 0, 1];
  assert.deepEqual(pairedBootstrap(deltas, 'seed'), pairedBootstrap(deltas, 'seed'));
  const ci = pairedBootstrap(deltas, 'seed') as { low: number; high: number };
  assert.ok(ci.low <= 0.625 && ci.high >= 0.625);
  assert.equal(pairedBootstrap([], 'seed'), null);
});

test('rater helpers fill frozen templates, refuse -fast and DeepSeek, and validate answers', () => {
  assert.equal(fillTemplate('P {premise} / {set1} / {"set1": {x}}', { premise: 'lamp', set1: '1. a' }), 'P lamp / 1. a / {"set1": {x}}');
  assert.equal(renderSet([]), '(no suggestions came back)');
  assert.equal(renderSet(['a', 'b']), '1. a\n2. b');
  assert.equal(hiddenFacts(undefined, undefined), '(none)');
  assert.equal(hiddenFacts('bait', ['x', 'y']), 'bait (key phrases: x; y)');
  assert.equal(renderPlayerView({ sections: [{ label: 'Where', lines: ['Rocks'] }], transcript: [{ name: 'Arin', mes: 'hi' }] }), 'Where:\n- Rocks\n\nRecent messages:\nArin: hi');
  assert.throws(() => refuseModel('openai/gpt-6.1-sol-fast'), /-fast/);
  assert.throws(() => refuseModel('deepseek/deepseek-chat'), /DeepSeek/);
  refuseModel('openai/gpt-6.1-sol');
  const answer = JSON.stringify({ set1: { lines: [{ usable: true, leak: false }], usefulness: 4 }, set2: { lines: [], usefulness: 1 }, notes: 'n' });
  assert.deepEqual(readPassA(`ok ${answer}`, [1, 0]), { set1: { lines: [{ usable: true, leak: false }], usefulness: 4 }, set2: { lines: [], usefulness: 1 }, notes: 'n' });
  assert.match((readPassA(answer, [2, 0]) as { problem: string }).problem, /1 line verdicts for 2 lines/);
  assert.match((readPassA(answer.replace('"usefulness":4', '"usefulness":6'), [1, 0]) as { problem: string }).problem, /not 1-5/);
  assert.deepEqual(readPassB('{"engages": false, "why": "w"}'), { engages: false, why: 'w' });
  assert.ok('problem' in readPassB('nope'));
  assert.equal(opencodeText('{"type":"step"}\n{"type":"text","part":{"text":"{\\"a\\":"}}\n{"type":"text","part":{"text":"1}"}}'), '{"a":1}');
});

test('sagaVerdict reports verifySaga reasons: word count, names not in the records, and a cut reply before verifySaga', async () => {
  const kit = await loadScenarioKit();
  const records = [{ summary: 'Arin and Luke relit the lamp.', playerTitle: 'The Last Lantern', consequences: [], people: [{ name: 'Arin' }] }];
  const context = { records, cast: ['Arin', 'Luke', 'You'] };
  assert.equal(kit.sagaVerdict(DEFAULT_SAGA_REPLY, 'stop', context).accepted, true);
  const short = kit.sagaVerdict('Arin smiled at the sea.', 'stop', context);
  assert.deepEqual([short.accepted, short.words, short.reasons], [false, 5, ['the epilogue is too short']]);
  const invented = kit.sagaVerdict(`${DEFAULT_SAGA_REPLY} Later the town of Brindlemoor sent Captain Vell to thank them.`, 'stop', context);
  assert.deepEqual(invented.invented, ['Brindlemoor', 'Captain', 'Vell']);
  assert.match(invented.reasons.join(), /names not in the records: Brindlemoor, Captain, Vell/);
  const cut = kit.sagaVerdict(DEFAULT_SAGA_REPLY, 'length', context);
  assert.deepEqual([cut.accepted, cut.incomplete, cut.reasons], [false, true, ['cut at the token limit (refuseIncomplete)']]);
});

test('a needle the prompt already shows is set aside for adjudication, not counted as a leak', () => {
  assert.deepEqual(splitNeedles(['drowned bell', 'old pier'], ['drowned bell']), { needles: ['old pier'], visibleNeedles: ['drowned bell'] });
});
