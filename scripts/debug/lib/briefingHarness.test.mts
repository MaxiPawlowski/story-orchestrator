import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBriefingSetting, restoreBriefing, restorePlayerSetup, suppressBriefing, suppressPlayerSetup } from './briefingHarness.mts';

const fakePage = (initial: boolean | undefined) => {
  const settings = { display: { briefing: initial } as { briefing?: boolean } };
  const writes: boolean[] = [];
  (globalThis as Record<string, unknown>).storyOrchestratorRuntime = {
    getGlobalSettings: () => settings,
    setUiSettings: (patch: { briefing: boolean }) => { writes.push(patch.briefing); settings.display.briefing = patch.briefing; },
  };
  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => (String(fn).includes('/script.js') ? true : fn(arg)),
    waitForResponse: async () => ({ ok: () => true, status: () => 200 }),
  };
  return { page, writes, settings };
};

test('suppresses the briefing for a run and puts the install value back', async () => {
  const { page, writes } = fakePage(true);
  const suppressed = await suppressBriefing(page);
  assert.equal(suppressed.changed, true);
  assert.equal(suppressed.before, true);
  assert.equal(await readBriefingSetting(page), false);
  const restored = await restoreBriefing(page, suppressed.before);
  assert.equal(restored.restored, true);
  assert.equal((restored as { ok?: boolean }).ok, true);
  assert.deepEqual(writes, [false, true]);
});

test('controls: an install already off is left alone, and a missing capture restores nothing', async () => {
  const { page, writes } = fakePage(false);
  assert.deepEqual(await suppressBriefing(page), { changed: false, before: false });
  assert.deepEqual(await restoreBriefing(page, false), { restored: false, unchanged: true, value: false });
  assert.deepEqual(await restoreBriefing(page, null), { restored: false, reason: 'no pre-run capture' });
  assert.deepEqual(writes, []);
  const unknown = fakePage(undefined);
  assert.equal(await readBriefingSetting(unknown.page), null);
});

test('v2.7 34: the start-setup question is suppressed and restored on its own key, leaving the briefing alone', async () => {
  const settings = { display: { briefing: true, playerSetup: true } as Record<string, boolean> };
  const writes: Array<Record<string, boolean>> = [];
  (globalThis as Record<string, unknown>).storyOrchestratorRuntime = {
    getGlobalSettings: () => settings,
    setUiSettings: (patch: Record<string, boolean>) => { writes.push(patch); Object.assign(settings.display, patch); },
  };
  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => (String(fn).includes('/script.js') ? true : fn(arg)),
    waitForResponse: async () => ({ ok: () => true, status: () => 200 }),
  };
  const suppressed = await suppressPlayerSetup(page);
  assert.equal(suppressed.before, true);
  assert.deepEqual(settings.display, { briefing: true, playerSetup: false });
  assert.equal((await restorePlayerSetup(page, suppressed.before)).restored, true);
  assert.deepEqual(writes, [{ playerSetup: false }, { playerSetup: true }]);
});

test('only a blocks-only "Before you start" pane is closed for a fixture that does not drive the briefing', async () => {
  const { isBlocksOnlyPane, fixtureDrivesBriefing, isBriefingIntercept } = await import('./briefingHarness.mts');
  const pane = { open: true, title: 'Before you start', sections: [], blocks: ['The story will not advance on its own until this is fixed.'], onboarding: false, optOut: false, startLabel: 'Close', pending: true, identity: false };
  assert.equal(isBlocksOnlyPane(pane), true);
  assert.equal(isBlocksOnlyPane({ ...pane, open: false }), false);
  assert.equal(isBlocksOnlyPane({ ...pane, blocks: [] }), false);
  assert.equal(isBlocksOnlyPane({ ...pane, sections: ['Who you are'] }), false, 'a briefing with story sections is never closed for the fixture');
  assert.equal(isBlocksOnlyPane({ ...pane, identity: true }), false, 'the identity step is never answered for the fixture');
  assert.equal(isBlocksOnlyPane({ ...pane, onboarding: true }), false);
  assert.equal(fixtureDrivesBriefing(JSON.stringify({ steps: [{ ui: { action: 'briefing-dismiss' } }] })), true);
  assert.equal(fixtureDrivesBriefing('{"eval":"document.querySelector(\'#so-player-setup\')"}'), true);
  assert.equal(fixtureDrivesBriefing(JSON.stringify({ steps: [{ import_story: 'x.story.json' }, { ui: { action: 'open-drawer' } }] })), false);
  assert.equal(isBriefingIntercept('<dialog open="" id="so-briefing" aria-labelledby="so-briefing-title">…</dialog> from <div id="so-briefing-root"> subtree intercepts pointer events'), true);
  assert.equal(isBriefingIntercept('locator.click: Timeout 15000ms exceeded. | layout {"topmost":"dialog#so-briefing."}'), true);
  assert.equal(isBriefingIntercept('locator.click: Timeout 15000ms exceeded. | layout {"topmost":"div#chat"}'), false);
});

test('the transition note is pinned off for a run unless the fixture drives announceTransitions itself', async () => {
  const { fixtureDrivesTransitionNote, suppressTransitionNote, restoreTransitionNote } = await import('./briefingHarness.mts');
  assert.equal(fixtureDrivesTransitionNote(JSON.stringify({ steps: [{ eval: "rt.setUiSettings({ announceTransitions: true })" }] })), true);
  assert.equal(fixtureDrivesTransitionNote(JSON.stringify({ steps: [{ import_story: 'x.story.json' }] })), false);
  const settings = { display: { announceTransitions: true } as Record<string, boolean> };
  (globalThis as Record<string, unknown>).storyOrchestratorRuntime = { getGlobalSettings: () => settings, setUiSettings: (patch: Record<string, boolean>) => Object.assign(settings.display, patch) };
  const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => (String(fn).includes('/script.js') ? true : fn(arg)), waitForResponse: async () => ({ ok: () => true, status: () => 200 }) };
  const suppressed = await suppressTransitionNote(page);
  assert.equal(suppressed.before, true);
  assert.equal(settings.display.announceTransitions, false);
  assert.equal((await restoreTransitionNote(page, suppressed.before) as { ok?: boolean }).ok, true);
  assert.equal(settings.display.announceTransitions, true);
});

test('B1b H2: journey setup closes a story-start dialog left open on its chat, and leaves a closed page alone', async () => {
  const { closeStartDialog } = await import('./briefingHarness.mts');
  const dialog = { open: true, querySelector: (selector: string) => (selector === '#so-player-setup' ? {} : selector === '#so-briefing-title' ? { textContent: 'Who you are in this story' } : null), querySelectorAll: () => [] };
  (globalThis as Record<string, unknown>).document = { querySelector: (selector: string) => (selector === 'dialog#so-briefing' ? dialog : null) };
  (globalThis as Record<string, unknown>).storyOrchestratorRuntime = { getSnapshot: () => ({ briefing: { pending: true } }) };
  const clicks: string[] = [];
  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
    waitForTimeout: async () => undefined,
    waitForFunction: async (fn: () => boolean) => { if (!fn()) throw new Error('still open'); },
    locator: (selector: string) => ({ click: async () => { clicks.push(selector); dialog.open = false; } }),
  };
  const closed = await closeStartDialog(page, 'after the chat opened', { settleMs: 0 });
  assert.deepEqual(clicks, ['#so-briefing-start']);
  assert.equal(closed.closed, true);
  assert.equal(closed.identity, true);
  const again = await closeStartDialog(page, 'after the chat opened', { settleMs: 0 });
  assert.deepEqual(again, { open: false, when: 'after the chat opened' });
  assert.deepEqual(clicks, ['#so-briefing-start'], 'control: nothing is clicked when no dialog is open');
  delete (globalThis as Record<string, unknown>).document;
});

const setupPage = ({ paneAfterPolls = 0, setup, enabled = true, lock = null as string | null }: { paneAfterPolls?: number; setup: Record<string, unknown> | null; enabled?: boolean; lock?: string | null }) => {
  let polls = 0;
  const radios = ['keep', 'pick', 'create'].map((value) => ({ getAttribute: (name: string) => (name === 'data-value' ? value : null) }));
  const pane = {
    querySelector: (selector: string) => (selector.includes('data-value="create"') ? {} : null),
    querySelectorAll: (selector: string) => (selector === '[data-so="player-setup-mode"] [role="radio"]' ? radios : []),
  };
  const dialog = { open: true, querySelector: (selector: string) => (selector === '#so-player-setup' && polls > paneAfterPolls ? pane : null) };
  const metadata: Record<string, unknown> = lock ? { persona: lock } : {};
  (globalThis as Record<string, unknown>).document = { querySelector: (selector: string) => (selector === 'dialog#so-briefing' ? dialog : null) };
  (globalThis as Record<string, unknown>).SillyTavern = { getContext: () => ({ chatMetadata: metadata }) };
  (globalThis as Record<string, unknown>).storyOrchestratorRuntime = {
    getSnapshot: () => ({ playerSetup: setup }),
    getGlobalSettings: () => ({ display: { playerSetup: enabled } }),
  };
  const clicks: string[] = [];
  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => { polls += 1; return fn(arg); },
    waitForTimeout: async () => undefined,
    waitForFunction: async (fn: () => boolean) => { if (!fn()) throw new Error('still pending'); },
    locator: (selector: string) => ({
      count: async () => 1,
      click: async () => {
        clicks.push(selector);
        if (selector.endsWith('#so-briefing-start') && setup) { setup.pending = false; setup.record = { pending: false, choice: 'keep', locked: true }; metadata.persona = 'me.png'; }
      },
      selectOption: async () => undefined,
      fill: async () => undefined,
    }),
  };
  return { page, clicks };
};

const clearSetupGlobals = () => {
  for (const key of ['document', 'SillyTavern', 'storyOrchestratorRuntime']) delete (globalThis as Record<string, unknown>)[key];
};

test('v3.0 29 P-6: player-setup-choose waits for the lazy identity step inside the open start dialog, picks the mode, then Start', async () => {
  const { choosePlayerSetup } = await import('./briefingHarness.mts');
  const { page, clicks } = setupPage({ paneAfterPolls: 2, setup: { storyId: 'road', pending: true, needsPane: true, record: { pending: true } } });
  const result = await choosePlayerSetup(page, 'keep', '', { openWithinMs: 5000 });
  assert.deepEqual(clicks, [
    'dialog#so-briefing[open] [data-so="player-setup-mode"] [data-value="keep"]',
    'dialog#so-briefing[open] #so-briefing-start',
  ]);
  assert.equal(result.before.open, true);
  assert.deepEqual(result.before.choices, ['player-setup-keep', 'player-setup-pick', 'player-setup-create']);
  assert.equal(result.locked, true);
  const skip = setupPage({ setup: { storyId: 'road', pending: true, needsPane: true, record: { pending: true } } });
  await assert.rejects(choosePlayerSetup(skip.page, 'skip', '', { openWithinMs: 0, timeoutMs: 0 }), /still pending/);
  assert.deepEqual(skip.clicks, ['dialog#so-briefing[open] [data-so="briefing-close"]'], 'skip is the header close, never Start');
  clearSetupGlobals();
});

test('v3.0 29 P-6: a missing identity step names why (lane 45 2026-10-30: display.playerSetup off, chat already locked)', async () => {
  const { choosePlayerSetup, setupPaneMissing } = await import('./briefingHarness.mts');
  const { page, clicks } = setupPage({ paneAfterPolls: Infinity, enabled: false, lock: 'user-default.png', setup: { storyId: 'road', pending: false, needsPane: false, record: { pending: false, choice: 'skip', locked: true } } });
  await assert.rejects(choosePlayerSetup(page, 'keep', '', { openWithinMs: 5000 }), /no start-setup pane is open \(#so-player-setup\): the identity step is already settled \(choice skip, locked\); display\.playerSetup is off/);
  assert.deepEqual(clicks, [], 'control: nothing is clicked without a pane');
  clearSetupGlobals();
  const base = { open: false, dialogOpen: false, role: null, current: null, done: null, canCreate: false, choices: [], pending: true, needsPane: true, enabled: true, storyId: 'road', choice: null, locked: null, chatLock: null };
  assert.equal(setupPaneMissing({ ...base, pending: null, storyId: null }), 'no story has a start setup in this chat');
  assert.match(setupPaneMissing({ ...base, enabled: false }), /^display\.playerSetup is off/);
  assert.equal(setupPaneMissing({ ...base, needsPane: false }), 'this story has no player profile or fixed name, so the start pane asks nothing');
  assert.equal(setupPaneMissing(base), 'the start dialog (dialog#so-briefing) is not open');
  assert.equal(setupPaneMissing({ ...base, dialogOpen: true }), 'the start dialog is open without the identity step');
  assert.equal(setupPaneMissing({ ...base, pending: false, choice: 'keep', locked: false }), 'the identity step is already settled (choice keep, unlocked)');
});
