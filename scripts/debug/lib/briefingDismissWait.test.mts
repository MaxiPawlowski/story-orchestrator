import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissBriefing } from './briefingHarness.mts';

const pageOpeningAfter = (polls: number) => {
  let reads = 0;
  let clicked = false;
  const state = () => ({ open: !clicked && reads > polls, title: null, sections: [], blocks: [], onboarding: false, optOut: false, startLabel: 'Start', pending: null, identity: false });
  return {
    page: {
      evaluate: async () => { reads += 1; return state(); },
      waitForTimeout: async () => undefined,
      waitForFunction: async () => undefined,
      locator: () => ({ click: async () => { clicked = true; }, check: async () => undefined }),
    } as any,
    clicked: () => clicked,
  };
};

test('briefing-dismiss waits for a start pane that opens late when openWithinMs is given', async () => {
  const fake = pageOpeningAfter(3);
  const result = await dismissBriefing(fake.page, { openWithinMs: 60000 });
  assert.equal(result.before.open, true);
  assert.equal(fake.clicked(), true);
});

test('briefing-dismiss without a wait still refuses when nothing is open', async () => {
  await assert.rejects(dismissBriefing(pageOpeningAfter(3).page), /no briefing is open/);
});
