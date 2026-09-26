import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { captureLibrary, restoreLibrary } from './librarySnapshot.mts';

const fakePage = { evaluate: async (fn: any, arg: any) => fn(arg) } as any;
const g = globalThis as any;
let settings: any;
let saves = 0;
const save = async () => { saves += 1; return { status: 200 }; };
const story = (id: string, version: number, hash: string) => ({ id, version, hash, raw: { id, version, title: id } });

beforeEach(() => {
  saves = 0;
  settings = { 'story-orchestrator': { settings: { cadence: 3 }, v2Stories: [story('mine', 1, 'v2-original'), story('other', 4, 'v2-other')] } };
  g.SillyTavern = { getContext: () => ({ extensionSettings: settings }) };
});
afterEach(() => { delete g.SillyTavern; });

test('H1 live shape: an import under an existing id replaced the record; cleanup puts the original back and removes what the run created', async () => {
  const before = await captureLibrary(fakePage);
  const root = settings['story-orchestrator'];
  root.v2Stories = [story('mine', 1, 'v2-de4f955d'), story('other', 4, 'v2-other'), story('run-made', 2, 'v2-edited')];
  const report = await restoreLibrary(fakePage, before, save) as any;
  assert.deepEqual(root.v2Stories, [story('mine', 1, 'v2-original'), story('other', 4, 'v2-other')]);
  assert.deepEqual({ restored: report.restored, removed: report.removed, verified: report.verified, error: report.error }, { restored: ['mine@1 (v2-original)'], removed: ['run-made@2 (v2-edited)'], verified: true, error: undefined });
  assert.equal(saves, 1);
  assert.deepEqual(root.settings, { cadence: 3 }, 'only the library is written');
});

test('the capture is a copy: a run that mutates a record in place cannot rewrite the snapshot', async () => {
  const before = await captureLibrary(fakePage);
  settings['story-orchestrator'].v2Stories[0].version = 9;
  await restoreLibrary(fakePage, before, save);
  assert.equal(settings['story-orchestrator'].v2Stories[0].version, 1);
});

test('control: a run that left the library as it found it writes nothing', async () => {
  const before = await captureLibrary(fakePage);
  assert.deepEqual(await restoreLibrary(fakePage, before, save), { changed: false, removed: [], restored: [] });
  assert.equal(saves, 0);
});

test('an untrusted capture restores nothing (S6)', async () => {
  g.SillyTavern = { getContext: () => ({ extensionSettings: null }) };
  const before = await captureLibrary(fakePage);
  assert.deepEqual(before, { trusted: false, records: [] });
  g.SillyTavern = { getContext: () => ({ extensionSettings: settings }) };
  settings['story-orchestrator'].v2Stories.push(story('run-made', 1, 'h'));
  assert.equal((await restoreLibrary(fakePage, before, save) as any).untrusted, true);
  assert.equal(settings['story-orchestrator'].v2Stories.length, 3);
  assert.equal(saves, 0);
});
