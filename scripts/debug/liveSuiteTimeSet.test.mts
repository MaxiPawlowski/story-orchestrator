import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_SETS } from './so-live-suite.mts';

test('v2.8 50 T8: the time windows are their own live-suite set, so the pinned extractor denominator (43) stays', () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'test/fixtures'));
  const time = files.filter((file) => FIXTURE_SETS.time.test(file));
  assert.equal(time.length, 4);
  assert.equal(files.filter((file) => FIXTURE_SETS.extractor.test(file)).some((file) => time.includes(file)), false);
  for (const file of time) for (const kind of ['transcript', 'expected']) assert.ok(files.includes(file.replace('.story.json', `.${kind}.json`)), `${file} has its ${kind}`);
});
