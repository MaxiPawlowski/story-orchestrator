import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_KINDS, frameKinds } from './so-sprite-builder.mts';

test('frames takes the drawn frame vocabulary, deduplicated, and refuses unknown kinds', () => {
  assert.deepEqual(frameKinds(FRAME_KINDS.join(',')), ['blink', 'talk', 'talk2', 'mouth_o', 'mouth_wide']);
  assert.deepEqual(frameKinds('mouth_o, mouth_o,talk'), ['mouth_o', 'talk']);
  assert.throws(() => frameKinds('mouth_x'), /unknown: mouth_x/);
  assert.throws(() => frameKinds(''), /comma list/);
});
