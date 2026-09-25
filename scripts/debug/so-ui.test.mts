// The reconciliation queue verb (v2.3 plan 05) is driven by a selector string built from an action,
// a conflict key, a side index and a row index. A wrong selector fails the SAME way a right one does
// when the panel is empty — "nothing matched" — so the failure would be attributed to the queue
// rather than to the tool. The builder is pure and asserted here; the DOM half is exercised only in
// a live gate, which had not run when this was written.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignedRoleProfiles, branchContinue, closeCharacterPanel, jumpToCitation, memoryQueueSelector, PLAYER_FORBIDDEN_SELECTORS, PLAYER_RECOVERY_CONTROLS, recoveryControlFindings } from './so-ui.mts';

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

// v2.4 plan 02 §10: the branch-continue verb, against a DOM that has the notice, one that covers it, and
// one without it (every build before plan 02 §5, where it must fail as `missing`, not pass).
const branchDom = ({ present, covered = false, clearsOnClick = true }: { present: boolean; covered?: boolean; clearsOnClick?: boolean }) => {
  const state = { notice: present, clicks: [] as Array<[number, number]> };
  const target = { id: 'so-branch-continue', tagName: 'BUTTON', className: 'menu_button', disabled: false, getAttribute: () => null, getBoundingClientRect: () => ({ left: 100, top: 40, width: 80, height: 20 }), contains: (node: unknown) => node === target };
  const overlay = { id: 'shadow', tagName: 'DIV', className: '', contains: () => false };
  (globalThis as any).window = { innerWidth: 1280, innerHeight: 800 };
  (globalThis as any).getComputedStyle = () => ({ pointerEvents: 'auto' });
  (globalThis as any).document = {
    querySelector: (selector: string) => (state.notice && (selector === '#so-branch-continue' || selector === '#so-branch-notice') ? target : null),
    elementFromPoint: () => (covered ? overlay : target),
  };
  const page = {
    evaluate: (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg),
    mouse: { click: async (x: number, y: number) => { state.clicks.push([x, y]); if (clearsOnClick) state.notice = false; } },
  } as never;
  return { state, page };
};
const noPrepare = async () => undefined;
const cleanDom = () => { for (const key of ['window', 'getComputedStyle', 'document']) delete (globalThis as any)[key]; };

test('branch-continue lands a pointer on the control centre and waits for the notice to go', async () => {
  const { state, page } = branchDom({ present: true });
  const result = await branchContinue(page, { prepare: noPrepare, timeoutMs: 100, pollMs: 5 });
  assert.deepEqual(state.clicks, [[140, 50]]);
  assert.equal(result.noticeGone, true);
  cleanDom();
});

test('branch-continue fails clearly as missing when no notice exists (today: plan 02 §5 is not built)', async () => {
  const { state, page } = branchDom({ present: false });
  await assert.rejects(branchContinue(page, { prepare: async () => { throw new Error('Drawer tab "Overview" not found.'); }, timeoutMs: 50, pollMs: 5 }), /#so-branch-continue is not clickable by a pointer \(missing\).*no branch notice is showing.*Overview" not found/);
  assert.deepEqual(state.clicks, []);
  cleanDom();
});

test('control: a covered control is refused without a click, and a click that leaves the notice up fails', async () => {
  const covered = branchDom({ present: true, covered: true });
  await assert.rejects(branchContinue(covered.page, { prepare: noPrepare, timeoutMs: 50, pollMs: 5 }), /\(overlay\)/);
  assert.deepEqual(covered.state.clicks, []);
  const stuck = branchDom({ present: true, clearsOnClick: false });
  await assert.rejects(branchContinue(stuck.page, { prepare: noPrepare, timeoutMs: 30, pollMs: 5 }), /was still showing after 30 ms/);
  assert.equal(stuck.state.clicks.length, 1);
  cleanDom();
});

test('the player-clean sweep covers both recovery controls, and passes their player copy', () => {
  assert.deepEqual(PLAYER_RECOVERY_CONTROLS, ['#so-pipeline-retry', '#so-memorize-stop']);
  assert.deepEqual(recoveryControlFindings([{ selector: '#so-pipeline-retry', text: 'Try again' }, { selector: '#so-memorize-stop', text: 'Stop' }]), []);
});

test('a recovery control whose label leaks internals is a finding', () => {
  const findings = recoveryControlFindings([{ selector: '#so-pipeline-retry', text: 'Retry profile artemis (API error)' }]);
  assert.ok(findings.some((finding) => finding.needle.includes('"profile"')));
  assert.ok(findings.some((finding) => finding.needle.includes('"API"')));
  assert.ok(findings.every((finding) => finding.needle.startsWith('#so-pipeline-retry')));
});

// v2.4 plan 08: the author-grade surfaces this plan added stay out of player mode, and the role pinning
// names a routed profile the panel no longer offers.
test('the player-clean sweep forbids the plan 08 author surfaces', () => {
  for (const selector of ['[data-so="next-turn-cost"]', '[data-so="next-turn-tokens"]', '[data-so="next-turn-trim"]', '[data-so="next-turn-foreign"]', '[data-so="next-turn-foreign-row"]', '[data-so="memory-fate"]', '[data-so="jump-to-message"]']) {
    assert.ok(PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  }
});

test('assigned role profiles resolve to the offered label, and a dangling id reads as null', async () => {
  (globalThis as any).SillyTavern = { getContext: () => ({ extensionSettings: { 'story-orchestrator': { settings: { extraction: { profiles: { director: 'fast', curator: 'gone' } } } } } }) };
  (globalThis as any).document = { querySelectorAll: () => [{ value: 'memory', textContent: ' Memory RunPod ' }, { value: 'fast', textContent: 'Fast local' }] };
  assert.deepEqual(await assignedRoleProfiles(fakePage), { director: { id: 'fast', label: 'Fast local' }, curator: { id: 'gone', label: null } });
  (globalThis as any).SillyTavern = { getContext: () => ({ extensionSettings: {} }) };
  assert.deepEqual(await assignedRoleProfiles(fakePage), {});
  delete (globalThis as any).SillyTavern;
  delete (globalThis as any).document;
});

test('jump refuses when no citation matches instead of clicking nothing', async () => {
  const page = { locator: () => ({ nth: () => ({ count: async () => 0 }) }) } as never;
  await assert.rejects(jumpToCitation(page, {}), /no citation matched \[data-so="jump-to-message"\] \(index 0\)/);
});
