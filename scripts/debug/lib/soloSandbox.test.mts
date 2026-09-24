import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSoloSandboxChat, soloChat, soloSpec, withoutSoloChats } from './soloSandbox.mts';
import { validateSteps } from './scenarioSchema.mts';

const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };

test('solo_chat: the spec takes a character or leave, never both and never neither', () => {
  assert.deepEqual(soloSpec({ character: ' DM Narrator ' }), { character: 'DM Narrator' });
  assert.deepEqual(soloSpec({ leave: true }), { leave: true });
  assert.throws(() => soloSpec({}), /exactly one/);
  assert.throws(() => soloSpec({ character: 'A', leave: true }), /exactly one/);
  assert.throws(() => soloSpec({ leave: false }), /expected true/);
  assert.throws(() => soloSpec({ character: '' }), /character name/);
  assert.throws(() => soloSpec('DM Narrator'), /expected/);
  assert.deepEqual(validateSteps([{ solo_chat: { character: 'DM Narrator' } }, { solo_chat: { leave: true } }]), []);
  assert.match(validateSteps([{ solo_chat: { character: 'A', leave: true } }])[0], /steps\[0\]\.solo_chat: solo_chat: exactly one/);
});

test('solo_chat: a solo chat counts as the sandbox only when the run made it and no group is open', () => {
  const guard = { soloChats: [{ chatId: 'Narrator - 1', avatar: 'n.png', name: 'Narrator' }] };
  assert.equal(isSoloSandboxChat(guard, null, 'Narrator - 1'), true);
  assert.equal(isSoloSandboxChat(guard, 'g1', 'Narrator - 1'), false);
  assert.equal(isSoloSandboxChat(guard, null, 'Narrator - 0'), false);
  assert.equal(isSoloSandboxChat({}, null, 'Narrator - 1'), false);
});

test('solo_chat: the group chat cleanup never sees a solo chat', () => {
  const guard = { owned: ['a', 'Narrator - 1', 'b'], soloChats: [{ chatId: 'Narrator - 1', avatar: 'n.png', name: 'Narrator' }] };
  assert.deepEqual(withoutSoloChats(guard).owned, ['a', 'b']);
  assert.deepEqual(guard.owned, ['a', 'Narrator - 1', 'b']);
});

test('solo_chat: refused outside a sandbox run', async () => {
  await assert.rejects(() => soloChat(page as never, { character: 'X' }, null), /needs --sandbox/);
});
