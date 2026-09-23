import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrationOk } from './calibrationVerdict.mts';

const families = [{ ok: true }, { ok: true }];

test('a use without families is judged by the overall rate against --min', () => {
  assert.equal(calibrationOk({ rate: 0.84, min: 0.85, minGiven: false, families: [], modelMatched: null }), false);
  assert.equal(calibrationOk({ rate: 0.86, min: 0.85, minGiven: false, families: [], modelMatched: null }), true);
});

test('family floors decide when no --min was asked for', () => {
  assert.equal(calibrationOk({ rate: 0.83, min: 0.85, minGiven: false, families, modelMatched: null }), true);
  assert.equal(calibrationOk({ rate: 0.99, min: 0.85, minGiven: false, families: [{ ok: true }, { ok: false }], modelMatched: null }), false);
});

test('an explicit --min binds the overall rate even when every family passes (the typed read at 0.83)', () => {
  assert.equal(calibrationOk({ rate: 0.8258, min: 0.85, minGiven: true, families, modelMatched: null }), false);
  assert.equal(calibrationOk({ rate: 0.9, min: 0.85, minGiven: true, families, modelMatched: null }), true);
});

test('a model other than the one asked for fails whatever the rate', () => {
  assert.equal(calibrationOk({ rate: 1, min: 0.85, minGiven: true, families, modelMatched: false }), false);
});
