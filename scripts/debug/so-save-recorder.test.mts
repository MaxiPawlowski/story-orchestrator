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
afterEach(() => { globalThis.fetch = realFetch; delete g.SillyTavern; delete g.__soSaveRecorder; delete g.storyOrchestratorSaveRefusals; });

let refusalSeq = 0;
const installWatcher = (refuseFile: string, askedFor = 'group-chat') => {
  const ring: any[] = g.storyOrchestratorSaveRefusals ?? (g.storyOrchestratorSaveRefusals = []);
  const inner = globalThis.fetch;
  let passed = 0;
  globalThis.fetch = (async (input: any, init: any) => {
    const body = JSON.parse(init.body);
    const file = body.id ?? body.file_name;
    if (file !== refuseFile) { passed += 1; return inner(input, init); }
    ring.push({ seq: ++refusalSeq, at: Date.now(), url: input, file, rows: body.chat.length - 1, integrity: body.chat[0]?.chat_metadata?.integrity ?? null, askedFor, open: file, reason: `held back (asked for "${askedFor}")` });
    return { status: 200, ok: true } as any;
  }) as any;
  return { passed: () => passed };
};

test('a save our watcher refuses while it is OUTERMOST never reaches the recorder, and is drained from the refusal ring', async () => {
  await armSaveRecorder(fakePage);
  installWatcher('ponticius-chat');
  await g.SillyTavern.getContext().saveMetadata();
  open.chatId = 'ponticius-chat';
  await save('ponticius-chat', 'slug-p', 3);
  await save('ponticius-chat-2', 'slug-q', 1);
  const result = await drainSaveRecorder(fakePage) as any;
  assert.equal(result.saves, 2);
  const [refused, sent] = result.records.saves;
  assert.deepEqual({ file: refused.file, rows: refused.rows, integrity: refused.integrity, source: refused.source, askedFor: refused.askedFor, status: refused.status }, { file: 'ponticius-chat', rows: 3, integrity: 'slug-p', source: 'watcher', askedFor: 'group-chat', status: null });
  assert.match(refused.refused, /asked for "group-chat"/);
  assert.ok(refused.seq < sent.seq, 'the refusal is ordered before the save the recorder saw after it');
  assert.deepEqual(result.flags.filter((flag: any) => flag.kind === 'refused').map((flag: any) => flag.seq), [refused.seq]);
});

test('a save our watcher refuses while it is INNER is marked on the recorder\'s own record, not recorded twice', async () => {
  const watcher = installWatcher('ponticius-chat');
  await armSaveRecorder(fakePage);
  await save('ponticius-chat', 'slug-p', 3);
  await save('group-chat', 'slug-a', 2, '/api/chats/group/save');
  const state = (await readSaveRecorder(fakePage, false))!;
  assert.equal(state.saves.length, 2);
  assert.equal(state.saves[0].source, 'fetch');
  assert.match(state.saves[0].refused ?? '', /held back/);
  assert.equal(state.saves[1].refused, null);
  assert.equal(watcher.passed(), 1);
});

test('control: refusals already in the ring when the recorder is armed are not imported', async () => {
  installWatcher('old-chat');
  await save('old-chat', 'slug-o', 1);
  await armSaveRecorder(fakePage);
  await save('group-chat', 'slug-a', 2, '/api/chats/group/save');
  const state = (await readSaveRecorder(fakePage, false))!;
  assert.deepEqual(state.saves.map((record) => [record.file, record.refused]), [['group-chat', null]]);
  assert.deepEqual(flagSaves(state).filter((flag) => flag.kind === 'refused'), []);
});

const save = (file: string, integrity: string | null, rows: number, path = '/api/chats/save') =>
  globalThis.fetch(path, { method: 'POST', body: JSON.stringify({ file_name: file, chat: [{ chat_metadata: integrity ? { integrity } : {} }, ...Array.from({ length: rows }, () => ({ mes: 'x' }))] }) } as any);

test('records the file, integrity, rows, what was open and the answer of every chat save, and nothing else', async () => {
  await armSaveRecorder(fakePage);
  await save('group-chat', 'slug-a', 4, '/api/chats/group/save');
  await globalThis.fetch('/api/backends/text-completions/generate', { method: 'POST', body: '{}' } as any);
  const state = await readSaveRecorder(fakePage, false);
  assert.equal(state?.saves.length, 1);
  assert.deepEqual({ ...state!.saves[0], stack: undefined, at: undefined }, { seq: 1, at: undefined, url: '/api/chats/group/save', file: 'group-chat', integrity: 'slug-a', rows: 4, open: { chatId: 'group-chat', groupId: 'g1', characterId: null }, status: 200, error: null, stack: undefined, refused: null, source: 'fetch' });
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
