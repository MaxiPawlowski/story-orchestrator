import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeMedia, decodePng, encodePng, figure, harnessCompleteFake, sha256, sseStream } from './pocFakes.mts';

test('PNG encode/decode round-trips a figure with enough colours', () => {
  const image = figure(40, 60, 3);
  const back = decodePng(encodePng(image));
  assert.equal(back.width, 40);
  assert.equal(back.height, 60);
  assert.deepEqual(Buffer.from(back.data), Buffer.from(image.data));
  const colours = new Set<number>();
  for (let at = 0; at < image.data.length; at += 4) colours.add((image.data[at] << 16) | (image.data[at + 1] << 8) | image.data[at + 2]);
  assert.ok(colours.size >= 8);
});

test('FakeMedia: a job renders, sprites save, list, refuse an unowned character and delete only at the confirmed hash', () => {
  const media = new FakeMedia((name) => name.startsWith('SO-T '));
  assert.equal(media.handle('POST', '/jobs', { id: 'j1', graph: { 1: { class_type: 'EmptyLatentImage', inputs: { width: 64, height: 96 } } } }).status, 200);
  const result = media.handle('GET', '/jobs/j1/result', null).json as { data: string };
  const png = decodePng(Buffer.from(result.data, 'base64'));
  assert.deepEqual([png.width, png.height], [64, 96]);
  assert.equal(media.handle('GET', '/jobs/nope', null).status, 404);
  const data = encodePng(figure(16, 16)).toString('base64');
  const saved = media.handle('POST', '/sprites/save', { character: 'SO-T Ann', set: 'default', label: 'neutral', data, key: 'k' });
  assert.equal(saved.status, 200);
  const hash = (saved.json as { sha256: string }).sha256;
  assert.match((saved.json as { path: string }).path, /\?t=/);
  assert.equal(media.handle('POST', '/sprites/save', { character: 'Owner Card', set: 'default', label: 'neutral', data, key: 'k' }).status, 400);
  const listed = media.handle('POST', '/sprites/list', { character: 'SO-T Ann' }).json as Array<{ set: string; labels: Record<string, { sha256: string }> }>;
  assert.equal(listed[0].labels.neutral.sha256, hash);
  assert.equal(media.file('/characters/SO-T%20Ann/default/neutral.png?t=1')?.status, 200);
  assert.equal(media.handle('POST', '/sprites/delete', { character: 'SO-T Ann', set: 'default', label: 'neutral', expectedHash: 'wrong' }).status, 400);
  assert.equal(media.handle('POST', '/sprites/delete', { character: 'SO-T Ann', set: 'default', label: 'neutral', expectedHash: hash }).status, 200);
  assert.equal(media.ownedFiles(), 0);
  assert.equal(media.handle('GET', '/unknown', null).status, 404);
});

test('replacing a sprite needs the reviewed hash', () => {
  const media = new FakeMedia(() => true);
  const first = media.handle('POST', '/sprites/save', { character: 'A', set: 's', label: 'l', data: encodePng(figure(8, 8, 1)).toString('base64'), key: 'k' });
  const other = encodePng(figure(8, 8, 2)).toString('base64');
  assert.equal(media.handle('POST', '/sprites/save', { character: 'A', set: 's', label: 'l', data: other, key: 'k' }).status, 400);
  assert.equal(media.handle('POST', '/sprites/save', { character: 'A', set: 's', label: 'l', data: other, key: 'k', expectedHash: (first.json as { sha256: string }).sha256 }).status, 200);
});

test('stream and harness fakes', () => {
  const sse = sseStream('hello there friend', 3);
  assert.ok(sse.endsWith('data: [DONE]\n\n'));
  const text = sse.split('\n\n').filter((line) => line.startsWith('data: {')).map((line) => JSON.parse(line.slice(6)).choices[0].text).join('');
  assert.equal(text, 'hello there friend');
  const reply = harnessCompleteFake({ prompt: 'image is 320 x 448 pixels' });
  assert.ok(JSON.parse(reply.text).landmarks);
  assert.equal(sha256('a').length, 64);
});
