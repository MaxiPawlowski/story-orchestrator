import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusWalkVerdict } from './focusWalk.mts';

const stop = (label: string, insideDialog = true) => ({ label, insideDialog });
const required = ['Save', 'Export JSON', 'Close studio'];

test('a walk that reaches every required control, stays in the dialog and wraps is ok', () => {
  const walk = ['Story title', 'Close studio', 'Graph', 'Export JSON', 'Save', 'Save As', 'Story title'].map((label) => stop(label));
  assert.deepEqual(focusWalkVerdict(walk, required), { ok: true, missing: [], escapedAt: null, wrapped: true });
});

test('a control focus never reaches is named', () => {
  const walk = ['Story title', 'Close studio', 'Graph', 'Graph layout', 'Story title'].map((label) => stop(label));
  const verdict = focusWalkVerdict(walk, required);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.missing, ['Save', 'Export JSON']);
});

test('focus leaving the dialog fails at the step it left', () => {
  const walk = [stop('Story title'), stop('Close studio'), stop('Save'), stop('Export JSON'), stop('Open studio', false), stop('Story title')];
  assert.equal(focusWalkVerdict(walk, required).escapedAt, 4);
  assert.equal(focusWalkVerdict(walk, required).ok, false);
});

test('a walk that never comes back to where it started is not a trap', () => {
  const walk = ['Story title', 'Close studio', 'Save', 'Export JSON', 'Save As'].map((label) => stop(label));
  assert.equal(focusWalkVerdict(walk, required).wrapped, false);
  assert.equal(focusWalkVerdict(walk, required).ok, false);
});
