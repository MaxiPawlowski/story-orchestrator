import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTHOR_SLASH_PATTERN, authorSlashInPage, needsAuthorView } from './authorSlash.mts';

test('the author commands are recognised, alone or after a pipe; others and look-alikes are not', () => {
  for (const command of ['/cp set leg 3', '/cp', '/checkpoint activate road', '/so-mem list', '/echo x | /cp state']) assert.equal(needsAuthorView(command), true, command);
  for (const command of ['/story recap', '/cpx', '/send /cp', '/sendas name="DM" hello', '/so-memory']) assert.equal(needsAuthorView(command), false, command);
});

const fakeHost = (authorView: boolean, fail = false) => {
  const calls: string[] = [];
  const ui = { authorView };
  (globalThis as any).storyOrchestratorRuntime = { getSnapshot: () => ({ ui: { ...ui } }), setUiSettings: (next: { authorView: boolean }) => { ui.authorView = next.authorView; calls.push(`author:${next.authorView}`); } };
  (globalThis as any).SillyTavern = { getContext: () => ({ executeSlashCommandsWithOptions: async (cmd: string) => { calls.push(`run:${cmd}:${ui.authorView}`); if (fail) throw new Error('boom'); return { pipe: 'done' }; } }) };
  return calls;
};

test('a scripted /cp in player mode runs inside Author view and puts player mode back, even when it throws', async () => {
  const calls = fakeHost(false);
  assert.deepEqual(await authorSlashInPage({ cmd: '/cp set leg 3', pattern: AUTHOR_SLASH_PATTERN }), { ok: true, isError: false, pipe: 'done', authorViewGranted: true });
  assert.deepEqual(calls, ['author:true', 'run:/cp set leg 3:true', 'author:false']);
  const failing = fakeHost(false, true);
  assert.equal((await authorSlashInPage({ cmd: '/cp state', pattern: AUTHOR_SLASH_PATTERN })).ok, false);
  assert.deepEqual(failing, ['author:true', 'run:/cp state:true', 'author:false']);
});

test('Author view already on, or a player command, is left alone', async () => {
  const calls = fakeHost(true);
  await authorSlashInPage({ cmd: '/cp list', pattern: AUTHOR_SLASH_PATTERN });
  const player = fakeHost(false);
  await authorSlashInPage({ cmd: '/story recap', pattern: AUTHOR_SLASH_PATTERN });
  assert.deepEqual([calls, player], [['run:/cp list:true'], ['run:/story recap:false']]);
});
