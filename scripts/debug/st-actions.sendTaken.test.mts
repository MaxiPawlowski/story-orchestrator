import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postSendWaitMs, waitForSendTaken } from './st-actions.mts';

const fakePage = (lengths: number[]) => {
  let i = 0;
  (globalThis as any).SillyTavern = { getContext: () => ({ chat: Array(lengths[Math.min(i++, lengths.length - 1)]).fill({}), streamingProcessor: null }) };
  (globalThis as any).document = { getElementById: () => null, body: { dataset: {} } };
  return { evaluate: (fn: any, arg: any) => fn(arg), waitForTimeout: async () => {} };
};

test('a send that the host posts late is still taken (a slow interceptor before ST appends the line)', async () => {
  const page = fakePage([1, 1, 1, 1, 1, 1, 2]);
  assert.equal(await waitForSendTaken(page, 1, 60000), true);
});

test('a send that never lands is reported after the wait, never as taken', async () => {
  const page = fakePage([1]);
  assert.equal(await waitForSendTaken(page, 1, 0), false);
  assert.equal(postSendWaitMs({}), 120000);
  assert.equal(postSendWaitMs({ SO_POST_SEND_WAIT_MS: '0' }), 0);
});
