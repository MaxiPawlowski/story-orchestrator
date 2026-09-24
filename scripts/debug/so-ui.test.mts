// The reconciliation queue verb (v2.3 plan 05) is driven by a selector string built from an action,
// a conflict key, a side index and a row index. A wrong selector fails the SAME way a right one does
// when the panel is empty — "nothing matched" — so the failure would be attributed to the queue
// rather than to the tool. The builder is pure and asserted here; the DOM half is exercised only in
// a live gate, which had not run when this was written.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeCharacterPanel, memoryQueueSelector } from './so-ui.mts';

test('keep and lock address the side row inside the named pair', () => {
  assert.equal(memoryQueueSelector({ action: 'keep', key: 'fact:abc' }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-keep"] >> nth=0');
  assert.equal(memoryQueueSelector({ action: 'keep', key: 'fact:abc', side: 1 }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-keep"] >> nth=1');
  assert.equal(memoryQueueSelector({ action: 'lock', key: 'fact:abc' }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-lock"] >> nth=0');
});

test('reread and dismiss address the pair, not a side', () => {
  const reread = memoryQueueSelector({ action: 'reread', key: 'scene:x' });
  assert.equal(reread, '[data-so="conflict-pair"][data-key="scene:x"] [data-so="conflict-reread"]');
  assert.ok(!reread.includes('nth='), 'a pair-level action must not be narrowed to one side');
});

test('reconfirm and discard address the quarantined list by row', () => {
  assert.equal(memoryQueueSelector({ action: 'reconfirm', index: 0 }), '[data-so="quarantined"] >> nth=0 >> [data-so="reconfirm"]');
  assert.equal(memoryQueueSelector({ action: 'discard', index: 2 }), '[data-so="quarantined"] >> nth=2 >> [data-so="discard-quarantined"]');
});

test('a pair action without a key, and an unknown action, are refused rather than guessed', () => {
  assert.throws(() => memoryQueueSelector({ action: 'keep' }), /needs a conflict key/);
  assert.throws(() => memoryQueueSelector({ action: 'lock' }), /needs a conflict key/);
  assert.throws(() => memoryQueueSelector({ action: 'nuke' }), /unknown memory-queue action/);
  // reconfirm/discard take no key, so a missing key must NOT be an error for them.
  assert.ok(memoryQueueSelector({ action: 'reconfirm' }).includes('reconfirm'));
});

const classList = (initial: string[]) => {
  const set = new Set(initial);
  return { contains: (name: string) => set.has(name), replace: (from: string, to: string) => { if (!set.has(from)) return false; set.delete(from); set.add(to); return true; }, has: (name: string) => set.has(name) };
};

const fakeDom = (open: boolean, pinned: boolean) => {
  const panel = { classList: classList([open ? 'openDrawer' : 'closedDrawer']) };
  const icon = { classList: classList([open ? 'openIcon' : 'closedIcon']) };
  const pin = { checked: pinned };
  (globalThis as any).document = { getElementById: (id: string) => ({ 'right-nav-panel': panel, rightNavDrawerIcon: icon, rm_button_panel_pin: pin } as Record<string, unknown>)[id] ?? null };
  return { panel, icon };
};

const fakePage = { evaluate: (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg) } as never;

test('an open, unpinned Character Management panel is closed before a drawer tab is clicked', async () => {
  const { panel, icon } = fakeDom(true, false);
  assert.deepEqual(await closeCharacterPanel(fakePage), { closed: true, pinned: false });
  assert.ok(panel.classList.has('closedDrawer') && icon.classList.has('closedIcon'));
});

test("control: a pinned panel is the author's choice and stays open; a closed one is left alone", async () => {
  const pinned = fakeDom(true, true);
  assert.deepEqual(await closeCharacterPanel(fakePage), { closed: false, pinned: true });
  assert.ok(pinned.panel.classList.has('openDrawer'));
  fakeDom(false, false);
  assert.deepEqual(await closeCharacterPanel(fakePage), { closed: false, pinned: false });
  delete (globalThis as any).document;
});
