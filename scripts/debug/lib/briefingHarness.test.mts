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
