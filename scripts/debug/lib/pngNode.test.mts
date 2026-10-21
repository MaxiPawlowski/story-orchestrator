import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePng, encodePng } from './pngNode.mts';

test('an RGBA image survives an encode and decode unchanged, including fully transparent pixels', () => {
  const width = 7, height = 5, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 2) * 11) % 256;
  for (let i = 3; i < data.length; i += 16) data[i] = 0;
  const back = decodePng(encodePng({ width, height, data }));
  assert.equal(back.width, width); assert.equal(back.height, height);
  assert.deepEqual(Array.from(back.data), Array.from(data));
});

test('a file that is not a PNG is refused', () => {
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /not a PNG/);
});
