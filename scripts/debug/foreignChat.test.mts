// v2.6 plan 03 SP5: a step marked `adoptsNewChat: "other-group"` may move the run to a chat it created in another
// group; the guard then accepts that chat, and only that chat, and cleanup must be able to name it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptForeignChat, assertInSandbox } from './st-navigation.mts';

const page = { evaluate: (fn: (arg: unknown) => unknown, arg?: unknown) => Promise.resolve(fn(arg)) } as never;
const at = (groupId: string, chatId: string, groups: Array<{ id: string; chats: string[] }>) => {
  (globalThis as { SillyTavern?: unknown }).SillyTavern = { getContext: () => ({ groupId, chatId, groups }) };
};
const guard = () => ({ groupId: 'saga', owned: ['a1'], preexisting: [], sandboxChatId: 'a1' }) as never as { foreignChats?: Array<{ groupId: string; chatId: string }> };

test('a chat created in another group during the step is adopted, and the guard then accepts it', async () => {
  const g = guard();
  at('academy', 'b-new', [{ id: 'saga', chats: ['a1'] }, { id: 'academy', chats: ['b-old', 'b-new'] }]);
  const adopted = await adoptForeignChat(page, g, { saga: ['a1'], academy: ['b-old'] });
  assert.equal(adopted.adopted, 'b-new');
  assert.deepEqual(g.foreignChats, [{ groupId: 'academy', chatId: 'b-new' }]);
  assert.equal((await assertInSandbox(page, g, 'test')).chatId, 'b-new');
});

test('control: a chat that already existed in the other group is never adopted, so the guard still refuses it', async () => {
  const g = guard();
  at('academy', 'b-old', [{ id: 'saga', chats: ['a1'] }, { id: 'academy', chats: ['b-old'] }]);
  const adopted = await adoptForeignChat(page, g, { saga: ['a1'], academy: ['b-old'] });
  assert.equal(adopted.adopted, null);
  await assert.rejects(assertInSandbox(page, g, 'test'), /sandbox escaped/);
});

test('control: a new chat in the sandbox group is not a foreign chat', async () => {
  const g = guard();
  at('saga', 'a2', [{ id: 'saga', chats: ['a1', 'a2'] }]);
  assert.equal((await adoptForeignChat(page, g, { saga: ['a1'] })).adopted, null);
});
