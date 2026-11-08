import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKDROPS, CLIPS, STORY, backgroundFile, clipSidecar, laneGuard } from './so-demo-record.mts';

test('refuses to run outside a numbered lane', () => {
  assert.throws(() => laneGuard({}), /only on a lane/);
  assert.throws(() => laneGuard({ SO_LANE: '0' }), /only on a lane/);
  assert.equal(laneGuard({ SO_LANE: '41' }), 41);
});

test('uploads exactly the backgrounds the demo story switches to', () => {
  const story = JSON.parse(readFileSync(STORY, 'utf8'));
  const used = story.checkpoints.map((checkpoint: { effects: { background: string } }) => checkpoint.effects.background).sort();
  assert.deepEqual(used, BACKDROPS.map(backgroundFile).sort());
});

test('every clip sidecar carries the fields the site checks', () => {
  for (const clip of CLIPS) {
    const meta = clipSidecar(clip, 'abc1234', { seconds: 3 });
    assert.match(meta.build, /^[0-9a-f]{7,40}$/);
    assert.ok(meta.licence.trim() && meta.source.includes(clip));
  }
});
