import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBuilderError } from './spriteBuilderUI.mts';

test('successful builder reads never wait for an absent alert', async () => {
  const root = { locator: () => ({ allTextContents: async () => [], textContent: () => { throw new Error('Would wait for thirty seconds.'); } }) };
  assert.equal(await readBuilderError(root), null);
});

test('actual builder errors are preserved without consulting nested base-history alerts', async () => {
  const root = { locator: (selector) => {
    assert.equal(selector, ':scope > [role="alert"]');
    return { allTextContents: async () => ['Missing model.', 'Invalid mouth region.'] };
  } };
  assert.equal(await readBuilderError(root), 'Missing model. Invalid mouth region.');
});
