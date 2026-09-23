// The review row this probe answers is "24 views, no overflow" — a NUMBER, so the probe's own list is
// part of the claim. A list that quietly shrank to 6 views would still print CLEAN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSIVE_VIEWPORTS } from './so-responsive.mts';

test('the responsive probe covers the 24 views the review row names, without duplicates', () => {
  assert.equal(RESPONSIVE_VIEWPORTS.length, 24, 'the review asked for 24 views');
  const keys = RESPONSIVE_VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`);
  assert.equal(new Set(keys).size, keys.length, `a viewport is listed twice: ${keys.join(', ')}`);
  // The phone widths the plan calls out by name are in the set, and the desktop baseline is too.
  for (const wanted of ['320x568', '390x844', '1024x1366', '1920x1080']) {
    assert.ok(keys.includes(wanted), `${wanted} is missing from the viewport list`);
  }
  // Ascending width: the report prints in list order, and a probe whose rows jump around is one a
  // reader cannot compare across runs.
  const widths = RESPONSIVE_VIEWPORTS.map((viewport) => viewport.width);
  assert.deepEqual([...widths].sort((a, b) => a - b), widths, 'the viewport list is not in ascending width order');
});
