import test from 'node:test';
import assert from 'node:assert/strict';
import { sagaRow, summarizeTurn, visibleText } from './sagaTurns.mts';

test('a thought-only reply is empty-visible, a user row never is', () => {
  const rows = [sagaRow({ is_user: true, mes: '' }, 10), sagaRow({ name: 'A', mes: '<channel|>', extra: { reasoning: 'x' } }, 11), sagaRow({ name: 'B', mes: 'Hi.' }, 12)];
  const summary = summarizeTurn(rows, [], []);
  assert.equal(summary.replies, 2);
  assert.equal(summary.emptyLeft, 1);
  assert.deepEqual(summary.emptyIds, [11]);
  assert.equal(visibleText('<think></think> ok'), 'ok');
});

test('a boundary on a still-empty reply, or before its recovery, counts; one after the recovery does not', () => {
  const rows = [sagaRow({ is_user: true, mes: 'go' }, 4), sagaRow({ name: 'A', mes: 'Fixed.' }, 5), sagaRow({ name: 'B', mes: '', extra: { reasoning: 'r' } }, 6)];
  const recoveries = [{ at: 100, messageId: 5, outcome: 'asked-again' }];
  assert.equal(summarizeTurn(rows, [{ lastMessageId: 5, at: 150 }], recoveries).boundariesOnEmpty, 0);
  assert.equal(summarizeTurn(rows, [{ lastMessageId: 5, at: 50 }], recoveries).boundariesOnEmpty, 1);
  assert.equal(summarizeTurn(rows, [{ lastMessageId: 6, at: 200 }], recoveries).boundariesOnEmpty, 1);
});

test('an asked-again recovery of the last reply that ends visible counts as a success', () => {
  const rows = [sagaRow({ is_user: true, mes: 'go' }, 1), sagaRow({ name: 'A', mes: 'Now visible.' }, 2)];
  const summary = summarizeTurn(rows, [], [{ at: 1, messageId: 2, outcome: 'asked-again' }]);
  assert.equal(summary.recoveriesAskedAgain, 1);
  assert.equal(summary.askedAgainEndedVisible, 1);
});
