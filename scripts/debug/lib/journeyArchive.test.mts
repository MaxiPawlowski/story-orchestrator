// V20c: T4 (a partial record cannot be archived as a gate) and F3 (--only refuses a story-bound step
// with no story loaded), driven through the real archive function and the real step engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveJourneyRecord, archiveRefusal } from './journeyArchive.mts';
import { runSteps } from '../so-scenario.mts';

const full = { id: 'J3', partial: false, only: null, results: [{ id: 'J3.1', outcome: 'pass' }], runnerError: null };

test('a full record may be archived; a partial, runner-errored or foreign one may not (T4)', () => {
  assert.equal(archiveRefusal(full), null);
  assert.match(archiveRefusal({ ...full, partial: true, only: ['J3.2'] }) ?? '', /--only \(J3\.2\): a partial record cannot stand for a gate/);
  assert.match(archiveRefusal({ ...full, runnerError: 'page closed' }) ?? '', /runner error/);
  assert.match(archiveRefusal({ steps: [] } as never) ?? '', /not a journey record/);
  assert.match(archiveRefusal(null) ?? '', /not a journey record/);
});

test('archiving copies the record and its matrix, and a refused record writes nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-archive-'));
  await writeFile(join(dir, 'journey-J3.json'), JSON.stringify(full));
  await writeFile(join(dir, 'journey-J3.md'), '| J3.1 | PASS |');
  const gate = join(dir, 'gate');
  const kept = await archiveJourneyRecord(join(dir, 'journey-J3.json'), gate);
  assert.equal(kept.ok, true);
  assert.deepEqual((await readdir(gate)).sort(), ['journey-J3.json', 'journey-J3.md']);

  await writeFile(join(dir, 'journey-J4.json'), JSON.stringify({ ...full, id: 'J4', partial: true, only: ['J4.1'] }));
  const refusedGate = join(dir, 'refused');
  const refused = await archiveJourneyRecord(join(dir, 'journey-J4.json'), refusedGate);
  assert.equal(refused.ok, false);
  assert.equal(await readdir(refusedGate).then(() => true, () => false), false, 'a refused archive created the gate directory');
});

const page = { evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
const quiet = async <T,>(work: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => undefined;
  try { return await work(); } finally { console.log = log; }
};
const withStory = (storyId: string | null) => {
  (globalThis as { storyOrchestratorRuntime?: unknown }).storyOrchestratorRuntime = { getSnapshot: () => ({ storyId }) };
};

test('under --only a story-bound step with no story loaded fails and names F3', async () => {
  withStory(null);
  const result = await quiet(() => runSteps(page as never, [{ eval: 'return 1;' }, { send_generate: { text: 'hi' } }] as never, { requireStory: true } as never));
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /^F3: --only reached "send_generate" with no story loaded/);
  assert.equal((result.steps as Array<{ ok: boolean }>)[0].ok, true, 'the non-generation step before it still ran');
});

test('control: the guard is off without --only, and a loaded story passes it', async () => {
  withStory(null);
  const off = await quiet(() => runSteps(page as never, [{ extract: {} }] as never, {} as never));
  assert.doesNotMatch(off.error ?? '', /F3/);
  withStory('j11-judge');
  const loaded = await quiet(() => runSteps(page as never, [{ extract: {} }] as never, { requireStory: true } as never));
  assert.doesNotMatch(loaded.error ?? '', /F3/);
});
