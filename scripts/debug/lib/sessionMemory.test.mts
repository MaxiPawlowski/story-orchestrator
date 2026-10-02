import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryLanded, resolveMemoryRow, runMemoryVerb, type MemoryRow } from './sessionMemory.mts';
import { parseLiveArgs } from '../so-session.mts';
import { runLive } from './sessionDriver.mts';
import { clearPage, fakePage, fakeSt, install, uninstall } from './sessionFakes.mts';

afterEach(() => { uninstall(); });

const rows = (): any[] => [
  { id: 'f3ae099d-1111-4444-8888-000000000001', tier: 'session_details', text: 'Killing the Devourer released them into dust.', pinned: false, locked: false },
  { id: 'ae05cf48-2222-4444-8888-000000000002', tier: 'facts', text: 'Natalia met Baroness Serenola once at court.', pinned: false },
  { id: 'c08cfdae-3333-4444-8888-000000000003', tier: 'facts', text: 'Javon sets three conditions before he will reveal the truth.' },
  { id: '62c4815e-4444-4444-8888-000000000004', tier: 'facts', text: 'Javon demands Max explain his conduct at the mines.' },
  { id: 'old', tier: 'facts', text: 'Javon sets three conditions (superseded copy).', supersededBy: 'c08cfdae-3333-4444-8888-000000000003' },
];

const memoryRuntime = (refuse = false) => {
  const fake = fakeSt({ chat: [] });
  const entries = rows();
  const calls: string[] = [];
  const write = (id: string, change: (entry: any) => any) => { if (refuse) return; const at = entries.findIndex((entry) => entry.id === id); entries[at] = change(entries[at]); };
  Object.assign(fake.runtime, {
    getSnapshot: () => ({ ...fake.state.snapshot, memory: { entries } }),
    setMemoryPinned: async (id: string, pinned: boolean) => { calls.push(`pin ${id} ${pinned}`); write(id, (entry) => ({ ...entry, pinned })); },
    excludeMemoryEntry: async (id: string) => { calls.push(`exclude ${id}`); if (!refuse) entries.splice(entries.findIndex((entry) => entry.id === id), 1); },
    editMemoryEntry: async (id: string, text: string) => { calls.push(`edit ${id} ${text}`); write(id, (entry) => ({ ...entry, text })); },
    memoryActions: { setMemoryLocked: async (id: string, locked: boolean) => { calls.push(`lock ${id} ${locked}`); write(id, (entry) => ({ ...entry, locked, pinned: locked || entry.pinned })); } },
  });
  install(fake);
  return { fake, entries, calls };
};

test('T2-5 mem: a row is named by id, an 8+ character id prefix, or a piece of text matching one live row', () => {
  const live = rows().filter((row) => !row.supersededBy) as MemoryRow[];
  assert.equal((resolveMemoryRow(live, 'ae05cf48') as any).row.id, live[1].id);
  assert.equal((resolveMemoryRow(live, 'released them into DUST') as any).row.id, live[0].id);
  assert.match((resolveMemoryRow(live, 'Javon') as any).error, /matches 2 rows; name one by id: c08cfdae/);
  assert.match((resolveMemoryRow(live, 'Witch King') as any).error, /no live memory row matches/);
  assert.match((resolveMemoryRow(live, 'ae05') as any).error, /no live memory row matches/, 'a short prefix is read as text, not as an id');
});

test('T2-5 mem: lock, pin, edit and exclude go through the runtime and the record holds the row before and after', async () => {
  const { calls } = memoryRuntime();
  const page = fakePage();
  const locked = await runMemoryVerb(page, 'lock', 'released them into dust');
  assert.equal(locked.ok, true, locked.problems.join('; '));
  assert.deepEqual([(locked as any).before.locked, (locked as any).after.locked], [false, true]);
  assert.equal((await runMemoryVerb(page, 'pin', 'ae05cf48')).ok, true);
  const edited = await runMemoryVerb(page, 'edit', 'ae05cf48', '  Natalia liked Serenola, an orc baroness.  ');
  assert.equal((edited as any).after.text, 'Natalia liked Serenola, an orc baroness.');
  const excluded = await runMemoryVerb(page, 'exclude', '62c4815e');
  assert.equal(excluded.ok, true);
  assert.equal((excluded as any).after, null);
  assert.deepEqual(calls.map((call) => call.split(' ').slice(0, 2).join(' ')), [
    'lock f3ae099d-1111-4444-8888-000000000001', 'pin ae05cf48-2222-4444-8888-000000000002', 'edit ae05cf48-2222-4444-8888-000000000002', 'exclude 62c4815e-4444-4444-8888-000000000004',
  ]);
});

test('T2-5 mem controls: a refused change, an ambiguous name and an edit without text fail the record and touch nothing', async () => {
  const refused = memoryRuntime(true);
  const page = fakePage();
  const lock = await runMemoryVerb(page, 'lock', 'released them into dust');
  assert.equal(lock.ok, false);
  assert.match(lock.problems.join(';'), /did not land/);
  const before = refused.calls.length;
  assert.equal((await runMemoryVerb(page, 'pin', 'Javon')).ok, false);
  assert.equal((await runMemoryVerb(page, 'edit', 'ae05cf48', '   ')).ok, false);
  assert.equal(refused.calls.length, before);
  assert.equal(memoryLanded('exclude', null), true);
  assert.equal(memoryLanded('pin', null), false);
});

test('T2-5 mem: the CLI parses the verb, and runLive drives it in the session chat', async () => {
  assert.deepEqual(parseLiveArgs('mem', ['d', 'edit', 'ae05cf48', 'New text.']).args, { memOp: 'edit', ref: 'ae05cf48', text: 'New text.' });
  assert.throws(() => parseLiveArgs('mem', ['d', 'pin']), /mem needs an op/);
  assert.throws(() => parseLiveArgs('mem', ['d', 'edit', 'ae05cf48']), /mem needs the new text/);
  memoryRuntime();
  const record = await runLive(fakePage(), { verb: 'mem', dir: 'd', chat: null, args: { memOp: 'unpin', ref: 'ae05cf48' } }, { ...clearPage, openChat: async () => undefined } as any);
  assert.equal((record as any).kind, 'memory');
  assert.equal(record.ok, true);
});
