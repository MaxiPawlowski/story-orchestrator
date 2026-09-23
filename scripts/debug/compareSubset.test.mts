import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSubset } from './so-scenario.mts';

test('oneOf and contains assert a property, not a literal (V24)', () => {
  assert.deepEqual(compareSubset({ status: 'validated' }, { status: { oneOf: ['validated', 'inserted'] } }), []);
  assert.match(compareSubset({ status: 'failed' }, { status: { oneOf: ['validated', 'inserted'] } })[0], /expected one of \["validated","inserted"\], got "failed"/);
  assert.deepEqual(compareSubset({ value: 'Pacing: hold. Do not narrate.' }, { value: { contains: ['Pacing: hold.', 'Do not narrate.'] } }), []);
  assert.match(compareSubset({ value: 'Pacing: hold.' }, { value: { contains: ['Pacing: hold.', 'Do not narrate.'] } })[0], /expected to contain "Do not narrate\."/);
  assert.match(compareSubset({ value: 42 }, { value: { contains: 'x' } })[0], /expected text containing/);
});

test('a matcher that could never fail is refused', () => {
  assert.match(compareSubset({ status: 'x' }, { status: { oneOf: [] } })[0], /non-empty list/);
  assert.match(compareSubset({ value: 'x' }, { value: { contains: '' } })[0], /non-empty strings/);
});

test('an object with other keys beside oneOf is still compared as a subset', () => {
  assert.match(compareSubset({ entry: { oneOf: 1, status: 'a' } }, { entry: { oneOf: 1, status: 'b' } })[0], /entry\.status: expected "b"/);
});
