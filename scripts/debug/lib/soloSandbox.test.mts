import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSoloSandboxChat, restoreActiveEntity, soloChat, soloSpec, withoutSoloChats, type ActiveEntity } from './soloSandbox.mts';
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

let moduleCount = 0;
type FakeScript = { active_character: string | null; active_group: string | null; setActiveCharacter: (key: string | null) => void; setActiveGroup: (key: string | null) => void };
async function fakeScriptModule(character: string | null, group: string | null) {
  moduleCount += 1;
  const source = `export let active_character = ${JSON.stringify(character)}; export let active_group = ${JSON.stringify(group)};
export function setActiveCharacter(key) { active_character = key || null; if (active_character) active_group = null; }
export function setActiveGroup(key) { active_group = key || null; if (active_group) active_character = null; }
// ${moduleCount}`;
  const url = `data:text/javascript,${encodeURIComponent(source)}`;
  return { url, script: await import(url) as FakeScript };
}
const entityOf = (script: FakeScript): ActiveEntity => ({ character: script.active_character, group: script.active_group });

test('solo_chat: the active character /go moves is captured first and put back at cleanup, with a save', async () => {
  const { url, script } = await fakeScriptModule(null, 'g1');
  const ctx = {
    groupId: 'g1' as string | null,
    chatId: 'group-chat' as string | null,
    characters: [{ name: 'Narrator', avatar: 'n.png' }],
    getRequestHeaders: () => ({}),
    executeSlashCommandsWithOptions: async (command: string) => {
      if (command.startsWith('/go')) { ctx.groupId = null; ctx.chatId = 'Narrator - old'; script.setActiveCharacter('n.png'); }
      if (command === '/newchat') ctx.chatId = 'Narrator - new';
    },
  };
  const realFetch = globalThis.fetch;
  (globalThis as { SillyTavern?: unknown }).SillyTavern = { getContext: () => ctx };
  globalThis.fetch = (async () => new Response(JSON.stringify([{ file_name: 'Narrator - old.jsonl' }]))) as typeof fetch;
  try {
    const guard = { groupId: 'g1', owned: ['group-chat'], sandboxChatId: 'group-chat' } as Parameters<typeof soloChat>[2] & object;
    await soloChat(page as never, { character: 'Narrator' }, guard, { module: url });
    assert.deepEqual(guard.activeEntityBefore, { character: null, group: 'g1' });
    assert.deepEqual(entityOf(script), { character: 'n.png', group: null });
    const saves: unknown[] = [];
    const restored = await restoreActiveEntity(page as never, guard, { module: url, save: async (target) => { saves.push(target); return { status: 200 }; } });
    assert.deepEqual(restored, { captured: true, before: { character: null, group: 'g1' }, found: { character: 'n.png', group: null }, after: { character: null, group: 'g1' }, restored: true, saved: { status: 200 } });
    assert.deepEqual(entityOf(script), { character: null, group: 'g1' });
    assert.equal(saves.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    delete (globalThis as { SillyTavern?: unknown }).SillyTavern;
  }
});

test('solo_chat: no capture restores nothing, an unmoved entity saves nothing, a refused save is not a restore', async () => {
  const { url } = await fakeScriptModule('n.png', null);
  let saves = 0;
  const save = async () => { saves += 1; return { status: 200 }; };
  assert.deepEqual(await restoreActiveEntity(page as never, {}, { module: url, save }), { captured: false });
  const unmoved = await restoreActiveEntity(page as never, { activeEntityBefore: { character: 'n.png', group: null } }, { module: url, save });
  assert.equal(unmoved.captured && unmoved.restored, true);
  assert.equal(unmoved.captured && unmoved.saved, null);
  assert.equal(saves, 0);
  const refused = await restoreActiveEntity(page as never, { activeEntityBefore: { character: null, group: 'g1' } }, { module: url, save: async () => { throw new Error('/api/settings/save answered 500; the settings were not written'); } });
  assert.equal(refused.captured && refused.restored, false);
  assert.deepEqual(refused.captured && refused.saved, { error: '/api/settings/save answered 500; the settings were not written' });
});
