import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { armSaveRecorder, disarmSaveRecorder, drainSaveRecorder, flagSaves, readSaveRecorder } from './so-save-recorder.mts';

const fakePage = { evaluate: async (fn: any, arg: any) => fn(arg) } as any;
const realFetch = globalThis.fetch;
const g = globalThis as any;

const open = { chatId: 'group-chat', groupId: 'g1', characterId: null as string | null };
let metadataCalls = 0;
const baseFetch = async () => ({ status: 200, ok: true }) as any;

beforeEach(() => {
  delete g.__soSaveRecorder;
  open.chatId = 'group-chat';
  open.groupId = 'g1';
  open.characterId = null;
  metadataCalls = 0;
  globalThis.fetch = baseFetch as any;
  g.SillyTavern = { getContext: () => ({ chatId: open.chatId, groupId: open.groupId, characterId: open.characterId, saveMetadata: async () => { metadataCalls += 1; } }) };
});
afterEach(() => { globalThis.fetch = realFetch; delete g.SillyTavern; delete g.__soSaveRecorder; });

const save = (file: string, integrity: string | null, rows: number, path = '/api/chats/save') =>
  globalThis.fetch(path, { method: 'POST', body: JSON.stringify({ file_name: file, chat: [{ chat_metadata: integrity ? { integrity } : {} }, ...Array.from({ length: rows }, () => ({ mes: 'x' }))] }) } as any);

test('records the file, integrity, rows, what was open and the answer of every chat save, and nothing else', async () => {
  await armSaveRecorder(fakePage);
  await save('group-chat', 'slug-a', 4, '/api/chats/group/save');
  await globalThis.fetch('/api/backends/text-completions/generate', { method: 'POST', body: '{}' } as any);
  const state = await readSaveRecorder(fakePage, false);
  assert.equal(state?.saves.length, 1);
  assert.deepEqual({ ...state!.saves[0], stack: undefined, at: undefined }, { seq: 1, at: undefined, url: '/api/chats/group/save', file: 'group-chat', integrity: 'slug-a', rows: 4, open: { chatId: 'group-chat', groupId: 'g1', characterId: null }, status: 200, error: null, stack: undefined });
  assert.match(state!.saves[0].stack, /save posted/);
});

test('stack-traces saveMetadata through the context and still calls the host', async () => {
  await armSaveRecorder(fakePage);
  await g.SillyTavern.getContext().saveMetadata();
  const state = await readSaveRecorder(fakePage, false);
  assert.equal(metadataCalls, 1);
  assert.equal(state?.metadataCalls.length, 1);
  assert.match(state!.metadataCalls[0].stack, /saveMetadata asked/);
});

test('the spike shape: a save asked in the group chat that posts the group\'s rows and integrity under a solo chat is flagged twice', async () => {
  await armSaveRecorder(fakePage);
  await save('group-chat', 'slug-a', 4, '/api/chats/group/save');
  await g.SillyTavern.getContext().saveMetadata();
  open.chatId = 'ponticius-chat';
  open.groupId = null;
  open.characterId = '3';
  await save('ponticius-chat', 'slug-a', 4);
  const result = await drainSaveRecorder(fakePage);
  assert.equal(result.ok, true);
  assert.deepEqual((result as any).flags.map((flag: any) => flag.kind).sort(), ['foreign-integrity', 'posted-elsewhere']);
  assert.equal((await readSaveRecorder(fakePage, false))?.saves.length, 0, 'drain empties the ring');
});

test('control: ordinary saves of two chats, each asked in its own chat, flag nothing', async () => {
  await armSaveRecorder(fakePage);
  await g.SillyTavern.getContext().saveMetadata();
  await save('group-chat', 'slug-a', 4, '/api/chats/group/save');
  open.chatId = 'ponticius-chat';
  await g.SillyTavern.getContext().saveMetadata();
  await save('ponticius-chat', 'slug-b', 2);
  assert.deepEqual(flagSaves((await readSaveRecorder(fakePage, false))!), []);
});

test('a failed post is recorded with its error and still rejects', async () => {
  globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
  await armSaveRecorder(fakePage);
  await assert.rejects(save('group-chat', 'slug-a', 1, '/api/chats/group/save'), /network down/);
  assert.equal((await readSaveRecorder(fakePage, false))?.saves[0].error, 'network down');
});

test('arming twice keeps one wrapper; disarm restores the page and a drain after it says so', async () => {
  await armSaveRecorder(fakePage);
  assert.equal((await armSaveRecorder(fakePage) as any).already, true);
  await disarmSaveRecorder(fakePage);
  assert.equal(globalThis.fetch, baseFetch);
  assert.equal((await drainSaveRecorder(fakePage)).ok, false);
});
