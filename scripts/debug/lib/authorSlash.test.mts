import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHOR_SLASH_PATTERN, JUMP_PROMPT_TEXT, JUMP_SKIP_LABEL, authorSlashArgs, authorSlashInPage, needsAuthorView } from './authorSlash.mts';

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

const jumpHost = (popup: boolean) => {
  const clicks: string[] = [];
  let release: () => void = () => {};
  const buttons = ['Seal it, then jump', JUMP_SKIP_LABEL, 'Cancel'].map((label) => ({ textContent: label, click: () => { clicks.push(label); release(); } }));
  const dialog = { textContent: `Jumping to B leaves the chapter A. A jump is not proof the chapter was played, so it is ${JUMP_PROMPT_TEXT}.`, querySelectorAll: () => buttons };
  (globalThis as any).document = { querySelectorAll: () => (popup && !clicks.length ? [dialog] : []) };
  (globalThis as any).storyOrchestratorRuntime = { getSnapshot: () => ({ ui: { authorView: true } }), setUiSettings: () => {} };
  (globalThis as any).SillyTavern = { getContext: () => ({ executeSlashCommandsWithOptions: (cmd: string) => (popup ? new Promise((resolve) => { release = () => resolve({ pipe: cmd }); }) : Promise.resolve({ pipe: cmd })) }) };
  return clicks;
};

test('a scripted /cp activate that raises the chapter-jump prompt jumps without sealing instead of waiting forever', async () => {
  const clicks = jumpHost(true);
  const result = await authorSlashInPage(authorSlashArgs('/cp activate natalia-named'));
  assert.deepEqual([clicks, result.jumpPromptsSkipped, result.ok], [[JUMP_SKIP_LABEL], 1, true]);
  delete (globalThis as any).document;
});

test('no prompt, or a command that is not a jump, clicks nothing', async () => {
  const quiet = jumpHost(false);
  assert.equal((await authorSlashInPage(authorSlashArgs('/cp activate road'))).jumpPromptsSkipped, 0);
  const other = jumpHost(false);
  assert.equal('jumpPromptsSkipped' in (await authorSlashInPage(authorSlashArgs('/cp set leg 3'))), false);
  assert.deepEqual([quiet, other], [[], []]);
  delete (globalThis as any).document;
});

test('the prompt text and the skip label are the product\'s own (src/runtime/chapterKit.ts)', () => {
  const source = readFileSync(new URL('../../../src/runtime/chapterKit.ts', import.meta.url), 'utf8');
  assert.ok(source.includes(JUMP_PROMPT_TEXT));
  assert.ok(source.includes(`label: "${JUMP_SKIP_LABEL}"`));
});
