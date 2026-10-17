import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postSendWaitMs, readOpenPopups, waitForSendTaken } from './st-actions.mts';

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

test('a send blocked by a host popup names the popup, so a not-posted line is diagnosable', async () => {
  const button = (text: string) => ({ innerText: text });
  const popup = { className: 'popup vertical_scrolling_dialogue_popup', querySelector: () => ({ innerText: '  Keep   going?' + String.fromCharCode(10) }), querySelectorAll: () => [button('Yes'), button(' '), button('No')] };
  (globalThis as any).document = { querySelectorAll: (selector: string) => (selector === 'dialog.popup[open]' ? [popup] : []) };
  const page = { evaluate: (fn: any, arg: any) => fn(arg) };
  assert.deepEqual(await readOpenPopups(page), [{ classes: 'popup vertical_scrolling_dialogue_popup', text: 'Keep going?', buttons: ['Yes', 'No'] }]);
  (globalThis as any).document = { querySelectorAll: () => [] };
  assert.deepEqual(await readOpenPopups(page), []);
});
