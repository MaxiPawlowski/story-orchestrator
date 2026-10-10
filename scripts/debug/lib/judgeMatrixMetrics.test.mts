import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auroc, costPer1k, decisionBrier, expectedCalibrationError, flipRate, linkConfidence, percentile, preregIssues, questionsPerRequest, requestConfidence, rotateRequest, twinAgreement, unrotateResponse,
  type MatrixRequest, type MatrixRow,
} from './judgeMatrixMetrics.mts';

const row = (id: string, right: boolean, confidence: number | null, picked = right ? 'a' : 'b'): MatrixRow => ({ id, right, picked, latencyMs: 10, confidence });

test('v2.8 14: a request is as confident as its least certain answer; noul reads max(p, 1-p)', () => {
  assert.equal(requestConfidence({ answers: { a: { type: 'noul', noul: 0.2 }, b: { type: 'choice', choice: 'x', confidence: 0.9, probabilities: {} } } }), 0.8);
  assert.equal(requestConfidence({ answers: {} }), null);
  assert.equal(requestConfidence(null), null);
});

test('v2.8 14: rows link to responses one to one, or not at all', () => {
  assert.deepEqual(linkConfidence([row('1', true, null)], [{ answers: { a: { type: 'noul', noul: 0.9 } } }]).rows[0].confidence, 0.9);
  const grouped = linkConfidence([row('H01.direct:0', true, null), row('H01.kept:0', true, null), row('H02.kept:0', false, null)], [{ answers: { a: { type: 'noul', noul: 0.9 } } }, { answers: { a: { type: 'noul', noul: 0.4 } } }]);
  assert.equal(grouped.linked, true);
  assert.deepEqual(grouped.rows.map((entry) => entry.confidence), [0.9, 0.9, 0.6]);
  const unlinked = linkConfidence([row('1', true, null), row('2', true, null)], [{ answers: {} }]);
  assert.equal(unlinked.linked, false);
  assert.equal(unlinked.rows[1].confidence, null);
});

test('v2.8 14: Brier, ECE and AUROC on (confidence, right); a perfect ranker is 1, an inverted one 0', () => {
  const good = [row('1', true, 0.9), row('2', true, 0.8), row('3', false, 0.6), row('4', false, 0.55)];
  assert.equal(auroc(good), 1);
  assert.equal(auroc([row('1', true, 0.5), row('2', false, 0.9)]), 0);
  assert.equal(auroc([row('1', true, 0.7)]), null, 'one class only: undefined');
  assert.ok(Math.abs((decisionBrier([row('1', true, 1), row('2', false, 0)]) ?? 1)) < 1e-12);
  assert.ok(Math.abs((decisionBrier([row('1', true, 0.5)]) ?? 0) - 0.25) < 1e-12);
  assert.ok(Math.abs((expectedCalibrationError([row('1', true, 0.95), row('2', false, 0.95)]) ?? 0) - 0.45) < 1e-12);
  assert.equal(decisionBrier([{ ...row('1', false, 0.9), fallback: 'timeout' }]), null, 'a fallback row is not scored');
});

test('v2.8 14: p95, option-rotation flips and trigger-only twin agreement', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100], 95), 19);
  assert.equal(percentile([], 95), null);
  assert.deepEqual(flipRate([row('1', true, 0.9), row('2', true, 0.9)], [row('1', true, 0.9), row('2', false, 0.9)]), { flips: 1, compared: 2, rate: 0.5 });
  assert.deepEqual(twinAgreement([row('S1', true, 1), row('S1t', true, 1), row('S2', true, 1), row('S2t', false, 1), row('S3', true, 1)]), { agree: 1, pairs: 2, rate: 0.5 });
});

test('v2.8 14: rotation reverses option order and maps a score back to the original levels', () => {
  const request: MatrixRequest = {
    state: {},
    questions: {
      pick: { type: 'choice', instructions: 'x', criteria: { a: null, b: null, c: null } },
      yes: { type: 'noul', instructions: 'x', criteria: { true: 'y', false: 'n' } },
      lvl: { type: 'score', instructions: 'x', criteria: ['low', 'mid', 'high'] },
      bare: { type: 'noul', instructions: 'x' },
    },
  };
  const rotated = rotateRequest(request);
  assert.deepEqual(Object.keys(rotated.questions.pick.criteria as object), ['c', 'b', 'a']);
  assert.deepEqual(Object.keys(rotated.questions.yes.criteria as object), ['false', 'true']);
  assert.deepEqual(rotated.questions.lvl.criteria, ['high', 'mid', 'low']);
  assert.deepEqual(rotated.questions.bare, request.questions.bare);
  const back = unrotateResponse({ answers: { lvl: { type: 'score', score: 0.2, confidence: 0.8, probabilities: { 0: 0.8, 1: 0.2, 2: 0 } } } }, request);
  assert.deepEqual(back.answers?.lvl, { type: 'score', score: 1.8, confidence: 0.8, probabilities: { 2: 0.8, 1: 0.2, 0: 0 } });
});

test('v2.8 14: questions per request and cost per 1,000 decisions (reported cost first, then the tariff, then zero for a local arm)', () => {
  assert.equal(questionsPerRequest([{ state: {}, questions: { a: { type: 'noul', instructions: 'x' } } }, { state: {}, questions: { a: { type: 'noul', instructions: 'x' }, b: { type: 'noul', instructions: 'x' } } }]), 1.5);
  assert.equal(costPer1k([{ usage: { cost: 0.002 } }, { usage: { cost: 0.002 } }], 2, null), 2);
  assert.equal(costPer1k([{ usage: { input_tokens: 1_000_000 } }], 1000, { inputPerMillion: 1, outputPerMillion: 0 }), 1);
  assert.equal(costPer1k([{ usage: { input_tokens: 500 } }], 1, null), 0);
});

test('v2.8 14: a run needs a preregistration note for its arm that covers every use it runs', () => {
  const note = { arm: 'systemone-local', model: 'decider-4b-v2.1-Q4_K_M', uses: ['stall', 'agency'], runs: 2, thresholds: 'production defaults, none fitted', budget: 'policy.ts timeouts', committed: 'abc1234' };
  assert.deepEqual(preregIssues(note, { arm: 'systemone-local', uses: ['stall'] }), []);
  assert.deepEqual(preregIssues(note, { arm: 'typesafe', uses: ['director'] }), ['the note is for arm systemone-local, not typesafe', 'the note does not cover director']);
  assert.deepEqual(preregIssues({}, { arm: 'x', uses: [] }), ['missing arm', 'missing model', 'missing thresholds', 'missing budget', 'missing committed', 'missing uses', 'missing runs']);
});
