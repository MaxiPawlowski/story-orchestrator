import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dumpEngineHistory, dumpTargets, engineHistoryFileName, historyOf, readChatBlobs, type ChatBlobRead } from './engineHistoryDump.mts';
import { readCleanup } from './journeyTallies.mts';
import { archiveJourneyRecord } from './journeyArchive.mts';
import { engineHistoryOfCleanup, runCleanup } from '../so-journey.mts';

const guard = (over: Record<string, unknown> = {}) => ({ groupId: 'g1', sandboxChatId: 'sandbox', owned: ['sandbox'], preexisting: [], current: 'sandbox', escaped: null, storyTitles: [] as string[], mirrorBooks: [] as Array<{ name: string; chatId: string }>, branchChats: [] as string[], ...over });

const blob = (chatId: string, stories: Record<string, unknown> = { 'sun-ruins': { engineState: { activeCheckpointId: 'cp2', boundary: 4, visitedPath: ['cp1', 'cp2'] }, engineHistory: { floor: 0, log: [{ boundary: 1 }, { boundary: 2 }] } } }) => ({ version: 6, chatId, selectedStoryId: 'sun-ruins', stories });

const reads = (rows: ChatBlobRead[]) => async () => rows;

test('the dump covers every chat the run owns: sandbox, adopted, branch and solo', () => {
  const targets = dumpTargets(guard({ owned: ['sandbox', 'adopted', 'solo-1'], branchChats: ['branch-1'], soloChats: [{ chatId: 'solo-1', avatar: 'p.png', name: 'Ponticius' }] }));
  assert.deepEqual(targets, [
    { chatId: 'sandbox', kind: 'group', groupId: 'g1' },
    { chatId: 'adopted', kind: 'group', groupId: 'g1' },
    { chatId: 'solo-1', kind: 'solo', avatar: 'p.png', name: 'Ponticius' },
    { chatId: 'branch-1', kind: 'group', groupId: 'g1' },
  ]);
});

test('a persisted blob becomes engineState + engineHistory per story', () => {
  const history = historyOf({ chatId: 'sandbox', kind: 'group', source: 'page', blob: blob('sandbox') });
  assert.equal(history.selectedStoryId, 'sun-ruins');
  assert.deepEqual(history.stories.map((story) => [story.storyId, story.boundary, story.visitedPath]), [['sun-ruins', 4, ['cp1', 'cp2']]]);
  assert.deepEqual(history.stories[0].engineHistory, { floor: 0, log: [{ boundary: 1 }, { boundary: 2 }] });
});

test('H-k: the dump is written as engine-history-<journey>.json and reports what it holds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-history-'));
  const report = await dumpEngineHistory({} as never, guard(), { dir, label: 'J3', playedStory: true, read: reads([{ chatId: 'sandbox', kind: 'group', source: 'page', blob: blob('sandbox') }]) });
  assert.deepEqual(report, { file: 'engine-history-J3.json', path: join(dir, 'engine-history-J3.json'), chats: 1, stories: 1 });
  const written = JSON.parse(await readFile(join(dir, 'engine-history-J3.json'), 'utf-8'));
  assert.equal(written.kind, 'engine-history');
  assert.deepEqual(written.chats[0].stories[0].engineState.visitedPath, ['cp1', 'cp2']);
  assert.equal(engineHistoryFileName('J1/../x'), 'engine-history-J1_.._x.json');
});

test('H-k negative controls: a missing dump is recorded as a failure, never skipped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-history-'));
  const empty = await dumpEngineHistory({} as never, guard(), { dir, label: 'J3', playedStory: true, read: reads([{ chatId: 'sandbox', kind: 'group', source: 'page', blob: null }]) });
  assert.match((empty as { error: string }).error, /imported a story and none of its 1 chat\(s\) holds engine state/);
  const noHistory = await dumpEngineHistory({} as never, guard(), { dir, label: 'J3', playedStory: true, read: reads([{ chatId: 'sandbox', kind: 'group', source: 'disk', blob: blob('sandbox', { s: { engineState: { boundary: 1 } } }) }]) });
  assert.match((noHistory as { error: string }).error, /sandbox\/s: no engineHistory/);
  const foreign = await dumpEngineHistory({} as never, guard(), { dir, label: 'J3', playedStory: true, read: reads([{ chatId: 'sandbox', kind: 'group', source: 'page', blob: blob('another-chat') }]) });
  assert.match((foreign as { error: string }).error, /stamped for another-chat/);
  const unreadable = await dumpEngineHistory({} as never, guard(), { dir, label: 'J3', playedStory: false, read: reads([{ chatId: 'sandbox', kind: 'group', source: null, blob: null, error: '/api/chats/group/get answered 500' }]) });
  assert.match((unreadable as { error: string }).error, /could not be read/);
  const thrown = await dumpEngineHistory({} as never, guard(), { dir, label: 'J3', playedStory: true, read: async () => { throw new Error('page closed'); } });
  assert.deepEqual(thrown, { error: 'engine history could not be read: page closed' });
  const unwritable = await dumpEngineHistory({} as never, guard(), { dir, label: 'J3', playedStory: true, read: reads([{ chatId: 'sandbox', kind: 'group', source: 'page', blob: blob('sandbox') }]), write: async () => { throw new Error('EACCES'); } });
  assert.match((unwritable as { error: string }).error, /could not be written .* EACCES/);
  assert.deepEqual(await dumpEngineHistory({} as never, null, { dir, label: 'J3', playedStory: true }), { error: 'no sandbox guard: the run owns no chat whose engine history could be dumped' });
  for (const report of [empty, noHistory, unreadable, thrown, unwritable]) assert.equal(readCleanup({ engineHistory: report }).ok, false, 'the journey cleanup gate must fail on it');
  const storyless = await dumpEngineHistory({} as never, guard(), { dir, label: 'J0', playedStory: false, read: reads([{ chatId: 'sandbox', kind: 'group', source: 'page', blob: null }]) });
  assert.equal((storyless as { error?: string }).error, undefined, 'a run that imported nothing has nothing to dump');
});

test('the in-page read takes the open chat from the page and every other chat from the server', async () => {
  const g = globalThis as any;
  const before = { SillyTavern: g.SillyTavern, fetch: g.fetch };
  const posted: Array<{ url: string; body: any }> = [];
  g.SillyTavern = { getContext: () => ({ groupId: 'g1', chatId: 'sandbox', chatMetadata: { story_orchestrator: blob('sandbox') }, getRequestHeaders: () => ({}) }) };
  g.fetch = async (url: string, init: { body: string }) => {
    posted.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => [{ chat_metadata: { story_orchestrator: blob('adopted') } }, { mes: 'hi' }] };
  };
  try {
    const page = { evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
    const rows = await readChatBlobs(page as never, dumpTargets(guard({ owned: ['sandbox', 'adopted', 'solo-1'], soloChats: [{ chatId: 'solo-1', avatar: 'p.png', name: 'Ponticius' }] })));
    assert.deepEqual(rows.map((row) => [row.chatId, row.source, (row.blob as { chatId: string }).chatId]), [['sandbox', 'page', 'sandbox'], ['adopted', 'disk', 'adopted'], ['solo-1', 'disk', 'adopted']]);
    assert.deepEqual(posted.map((entry) => entry.url), ['/api/chats/group/get', '/api/chats/get']);
    assert.deepEqual(posted[1].body, { ch_name: 'Ponticius', file_name: 'solo-1', avatar_url: 'p.png' });
  } finally {
    g.SillyTavern = before.SillyTavern;
    g.fetch = before.fetch;
  }
});

const idlePage = (answer: (arg: unknown) => unknown) => ({
  evaluate: async (_fn: unknown, arg: { op?: string } | unknown) => {
    const op = (arg as { op?: string } | undefined)?.op;
    if (op === 'so-quiesce-read') return { generating: false, saving: false, chatId: 'sandbox', signals: [] };
    if (op === 'so-quiesce-stop') return false;
    return answer(arg);
  },
});

test('H-k so-journey: cleanup dumps the sandbox chat before deleting it, and the record names the file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-history-'));
  const order: string[] = [];
  const page = idlePage((arg) => {
    if (Array.isArray(arg) && (arg as Array<{ chatId?: string }>)[0]?.chatId === 'sandbox') { order.push('dump'); return [{ chatId: 'sandbox', kind: 'group', source: 'page', blob: blob('sandbox') }]; }
    if (arg && typeof arg === 'object' && 'owned' in (arg as object) && 'preexisting' in (arg as object)) order.push('delete');
    return null;
  });
  const report = await runCleanup(page, { id: 'J3', cleanup: {} }, { importedHashes: ['h1'], libraryBefore: null, configSnapshot: null, guard: guard(), keep: false, allowConfig: false, assetBaseline: null, activatedLorebooks: [], quiesce: { quietMs: 0, pollMs: 1 }, historyDir: dir }) as Record<string, any>;
  assert.deepEqual(report.engineHistory, { file: 'engine-history-J3.json', path: join(dir, 'engine-history-J3.json'), chats: 1, stories: 1 });
  assert.deepEqual(order, ['dump', 'delete']);
  assert.deepEqual(await readdir(dir), ['engine-history-J3.json']);
  assert.deepEqual(engineHistoryOfCleanup(report), { file: 'engine-history-J3.json', chats: 1, stories: 1 });
});

test('H-k so-journey negative control: a run that played a story and left no engine state fails its cleanup gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-history-'));
  const page = idlePage((arg) => (Array.isArray(arg) ? [{ chatId: 'sandbox', kind: 'group', source: 'page', blob: null }] : null));
  const report = await runCleanup(page, { id: 'J3', cleanup: {} }, { importedHashes: ['h1'], libraryBefore: null, configSnapshot: null, guard: guard(), keep: false, allowConfig: false, assetBaseline: null, activatedLorebooks: [], quiesce: { quietMs: 0, pollMs: 1 }, historyDir: dir }) as Record<string, any>;
  const gate = readCleanup(report);
  assert.equal(gate.ok, false);
  assert.ok(gate.failed.some((line) => line.startsWith('engineHistory.error')), gate.failed.join(' | '));
  assert.match(engineHistoryOfCleanup(report)?.error ?? '', /holds engine state/);
  assert.match(engineHistoryOfCleanup({ error: 'page closed' })?.error ?? '', /cleanup threw before the engine history was dumped/);
});

test('H-k archive: the dump travels with the record, and a record naming a missing dump is refused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-history-'));
  const record = { id: 'J3', partial: false, only: null, results: [{ id: 'J3.1', outcome: 'pass' }], runnerError: null, engineHistory: { file: 'engine-history-J3.json', chats: 1, stories: 1 } };
  await writeFile(join(dir, 'run_journey-J3.json'), JSON.stringify(record));
  const refused = await archiveJourneyRecord(join(dir, 'run_journey-J3.json'), join(dir, 'gate-a'));
  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /names engine history engine-history-J3\.json, which is not beside the record/);
  await writeFile(join(dir, 'engine-history-J3.json'), JSON.stringify({ kind: 'engine-history', chats: [] }));
  const kept = await archiveJourneyRecord(join(dir, 'run_journey-J3.json'), join(dir, 'gate-b'));
  assert.equal(kept.ok, true);
  assert.deepEqual((await readdir(join(dir, 'gate-b'))).sort(), ['engine-history-J3.json', 'run_journey-J3.json']);
});
