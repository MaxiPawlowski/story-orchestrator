import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeMessage } from './st-actions.mts';

const stub = (chat: any[], generates: boolean) => {
  const calls: any[] = [];
  (globalThis as any).SillyTavern = {
    getContext: () => ({
      chat,
      swipe: {
        to: async (_event: unknown, direction: string, options: any) => {
          calls.push({ direction, ...options });
          const message = chat[options.forceMesId];
          if (generates && options.forceSwipeId >= message.swipes.length) {
            message.swipes.push('a new reply');
            message.swipe_id = message.swipes.length - 1;
          } else if (options.forceSwipeId < message.swipes.length) message.swipe_id = options.forceSwipeId;
        },
      },
      eventSource: { on() {}, removeListener() {} },
      eventTypes: { MESSAGE_SWIPED: 'message_swiped' },
    }),
  };
  return { page: { evaluate: (fn: any, arg: any) => fn(arg) } as any, calls };
};

const reply = () => ({ is_user: false, mes: 'first', swipes: ['first'], swipe_id: 0 });

test('swipeId "new" overswipes the last reply into a real generation', async () => {
  const chat = [{ is_user: true, mes: 'hi' }, reply()];
  const { page, calls } = stub(chat, true);
  const result: any = await swipeMessage(page, 'last', 'new');
  assert.equal(result.generated, true);
  assert.equal(result.swipesBefore, 1);
  assert.equal(result.swipesAfter, 2);
  assert.deepEqual(calls.map((call) => [call.direction, call.forceSwipeId]), [['right', 1]]);
});

test('swipeId "new" fails loudly when nothing was generated', async () => {
  const chat = [{ is_user: true, mes: 'hi' }, reply()];
  const { page } = stub(chat, false);
  await assert.rejects(swipeMessage(page, 'last', 'new'), /no new swipe was generated/);
});

test('swipeId "new" refuses a player line or a reply that is not last', async () => {
  await assert.rejects(swipeMessage(stub([reply(), { is_user: true, mes: 'me', swipes: ['me'] }], true).page, 'last', 'new'), /not a character reply/);
  await assert.rejects(swipeMessage(stub([reply(), { is_user: true, mes: 'me' }], true).page, 0, 'new'), /not the last message/);
});

test('a numeric swipe id past the end is still refused', async () => {
  await assert.rejects(swipeMessage(stub([reply()], true).page, 'last', 1), /no deterministic swipe 1/);
});
