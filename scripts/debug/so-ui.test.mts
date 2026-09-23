// The reconciliation queue verb (v2.3 plan 05) is driven by a selector string built from an action,
// a conflict key, a side index and a row index. A wrong selector fails the SAME way a right one does
// when the panel is empty — "nothing matched" — so the failure would be attributed to the queue
// rather than to the tool. The builder is pure and asserted here; the DOM half is exercised only in
// a live gate, which had not run when this was written.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryQueueSelector } from './so-ui.mts';

test('keep and lock address the side row inside the named pair', () => {
  assert.equal(memoryQueueSelector({ action: 'keep', key: 'fact:abc' }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-keep"] >> nth=0');
  assert.equal(memoryQueueSelector({ action: 'keep', key: 'fact:abc', side: 1 }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-keep"] >> nth=1');
  assert.equal(memoryQueueSelector({ action: 'lock', key: 'fact:abc' }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-lock"] >> nth=0');
});

test('reread and dismiss address the pair, not a side', () => {
  const reread = memoryQueueSelector({ action: 'reread', key: 'scene:x' });
  assert.equal(reread, '[data-so="conflict-pair"][data-key="scene:x"] [data-so="conflict-reread"]');
  assert.ok(!reread.includes('nth='), 'a pair-level action must not be narrowed to one side');
});

test('reconfirm and discard address the quarantined list by row', () => {
  assert.equal(memoryQueueSelector({ action: 'reconfirm', index: 0 }), '[data-so="quarantined"] >> nth=0 >> [data-so="reconfirm"]');
  assert.equal(memoryQueueSelector({ action: 'discard', index: 2 }), '[data-so="quarantined"] >> nth=2 >> [data-so="discard-quarantined"]');
});

test('a pair action without a key, and an unknown action, are refused rather than guessed', () => {
  assert.throws(() => memoryQueueSelector({ action: 'keep' }), /needs a conflict key/);
  assert.throws(() => memoryQueueSelector({ action: 'lock' }), /needs a conflict key/);
  assert.throws(() => memoryQueueSelector({ action: 'nuke' }), /unknown memory-queue action/);
  // reconfirm/discard take no key, so a missing key must NOT be an error for them.
  assert.ok(memoryQueueSelector({ action: 'reconfirm' }).includes('reconfirm'));
});
