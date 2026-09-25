// v2.3 plan 11's concurrent-load recipe needs two isolated sessions, and `.debug/` is the second
// half of that isolation (the CDP port is the first): two processes sharing one directory also share
// `session.json`, the journey config snapshot and the asset baseline. The override is asserted here
// because a silent fallback to the shared directory is exactly what the recipe cannot detect from a
// run's output — the run works either way, and only the second one's cleanup reveals the collision.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { browserProfileFor, debugDirFor, settleDialogs } from './connection.mts';

const ROOT = resolve('C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator');

test('the browser profile never sits under ST public/, which ST serves to the network', () => {
  const profile = browserProfileFor({}, resolve(ROOT, '.debug'), ROOT);
  assert.equal(profile, resolve('C:/dev/so-lanes/0/chromium-profile'));
  assert.ok(!profile.split(/[\\/]/).includes('public'));
});

test('a lane debug dir outside the served tree keeps its profile beside it', () => {
  assert.equal(browserProfileFor({}, resolve('C:/dev/so-lanes/2/debug'), ROOT), resolve('C:/dev/so-lanes/2/debug/chromium-profile'));
});

test('ST_DEBUG_PROFILE_DIR and SO_LANES_ROOT override the default', () => {
  assert.equal(browserProfileFor({ ST_DEBUG_PROFILE_DIR: 'D:/profiles/so' }, resolve(ROOT, '.debug'), ROOT), resolve('D:/profiles/so'));
  assert.equal(browserProfileFor({ SO_LANES_ROOT: 'E:/lanes' }, resolve(ROOT, '.debug'), ROOT), resolve('E:/lanes/0/chromium-profile'));
});

test('an unset or blank SO_DEBUG_DIR keeps the historical directory', () => {
  assert.equal(debugDirFor({}, ROOT), resolve(ROOT, '.debug'));
  assert.equal(debugDirFor({ SO_DEBUG_DIR: '' }, ROOT), resolve(ROOT, '.debug'));
  assert.equal(debugDirFor({ SO_DEBUG_DIR: '   ' }, ROOT), resolve(ROOT, '.debug'), 'whitespace is unset, not a directory named "   "');
});

test('a relative SO_DEBUG_DIR resolves under the project root', () => {
  assert.equal(debugDirFor({ SO_DEBUG_DIR: '.debug-load-b' }, ROOT), resolve(ROOT, '.debug-load-b'));
  assert.equal(debugDirFor({ SO_DEBUG_DIR: 'tmp/session-2' }, ROOT), resolve(ROOT, 'tmp/session-2'));
});

test('an absolute SO_DEBUG_DIR is used as given, not joined onto the root', () => {
  const absolute = resolve(ROOT, '..', 'so-debug-b');
  assert.equal(debugDirFor({ SO_DEBUG_DIR: absolute }, ROOT), absolute);
});

const fakeDialogPage = () => {
  const handlers: Array<(dialog: unknown) => void> = [];
  return { handlers, page: { on: (event: string, handler: (dialog: unknown) => void) => { if (event === 'dialog') handlers.push(handler); } } };
};

test('a dialog another client already settled does not crash the process', async () => {
  const { handlers, page } = fakeDialogPage();
  settleDialogs(page as never);
  settleDialogs(page as never);
  assert.equal(handlers.length, 1, 'registered once per page');
  let unhandled = 0;
  const onUnhandled = () => { unhandled += 1; };
  process.on('unhandledRejection', onUnhandled);
  handlers[0]({ type: () => 'beforeunload', accept: () => Promise.reject(new Error('Protocol error (Page.handleJavaScriptDialog): No dialog is showing')), dismiss: () => Promise.resolve() });
  await new Promise((resolve) => setTimeout(resolve, 20));
  process.off('unhandledRejection', onUnhandled);
  assert.equal(unhandled, 0);
});

test("control: Playwright's own defaults are kept (beforeunload accepted, anything else dismissed)", () => {
  const { handlers, page } = fakeDialogPage();
  settleDialogs(page as never);
  const calls: string[] = [];
  const dialog = (type: string) => ({ type: () => type, accept: async () => { calls.push(`accept:${type}`); }, dismiss: async () => { calls.push(`dismiss:${type}`); } });
  handlers[0](dialog('beforeunload'));
  handlers[0](dialog('confirm'));
  assert.deepEqual(calls, ['accept:beforeunload', 'dismiss:confirm']);
});
