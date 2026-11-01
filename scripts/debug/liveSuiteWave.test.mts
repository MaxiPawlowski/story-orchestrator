import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_SETS } from './so-live-suite.mts';
import { scoreActs, scoreNeighbours, scoreRelations, scoreWave, waveTotals, type ReadMemoryArm, type WaveLive } from './lib/liveSuiteWave.mts';

const ON: ReadMemoryArm = { neighbours: true, keys: true, relations: true, acts: true };
const OFF: ReadMemoryArm = { neighbours: false, keys: false, relations: false, acts: false };
const expected = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test/fixtures', `${name}.expected.json`), 'utf8'));

test('v3.0 43 H2: memwave is its own set, outside the pinned extractor denominator', () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'test/fixtures'));
  const memwave = files.filter((file) => FIXTURE_SETS.memwave.test(file));
  assert.equal(memwave.length, 6);
  assert.equal(files.filter((file) => FIXTURE_SETS.extractor.test(file)).some((file) => memwave.includes(file)), false);
  for (const file of memwave) for (const kind of ['transcript', 'expected']) assert.ok(files.includes(file.replace('.story.json', `.${kind}.json`)), `${file} has its ${kind}`);
});

test('a wave tier is scored only while its switch was on, so the off arm compares shared tiers alone', () => {
  const live: WaveLive = { readMemory: OFF, wave: {} };
  assert.deepEqual(scoreWave(expected('memwave-m1-two-dogs'), live), []);
  assert.deepEqual(scoreWave(expected('memwave-m4-acts'), { readMemory: null }), []);
  assert.equal(scoreWave(expected('memwave-m4-acts'), { readMemory: ON, wave: { acts: [] } }).length, 1);
});

test('two dogs: a line about the new dog tagged onto a stored dog fails; the stored dog repeated is allowed', () => {
  const spec = expected('memwave-m1-two-dogs').neighbours;
  const good = scoreNeighbours(spec, { readMemory: ON, wave: { tagged: [{ text: "Mira's dog Ash sleeps by the stove.", kind: 'same', id: 'mem-ash' }] } });
  assert.equal(good.pass, true);
  const crossed = scoreNeighbours(spec, { readMemory: ON, wave: { tagged: [{ text: 'Mira has a new dog called Burr.', kind: 'update', id: 'mem-ash' }] } });
  assert.equal(crossed.pass, false);
  assert.deepEqual(crossed.counts, { expected: 0, matched: 0, spurious: 1 });
  const unknown = scoreNeighbours(spec, { readMemory: ON, wave: { tagged: [{ text: 'x', kind: 'same', id: null }] } });
  assert.match(unknown.detail, /unknown alias/);
});

test('supersede: update= on the right row passes, same= on it counts as spurious', () => {
  const spec = expected('memwave-m1-supersede').neighbours;
  assert.equal(scoreNeighbours(spec, { readMemory: ON, wave: { tagged: [{ text: 'Tobin moved the key to the attic', kind: 'update', id: 'mem-key' }] } }).pass, true);
  const wrong = scoreNeighbours(spec, { readMemory: ON, wave: { tagged: [{ text: 'Tobin moved the key to the attic', kind: 'same', id: 'mem-key' }] } });
  assert.equal(wrong.pass, false);
  assert.deepEqual(wrong.counts, { expected: 1, matched: 0, spurious: 1 });
});

test('relations: claims match by pair, end state and any relation word; also-pairs are neither hits nor false', () => {
  const spec = expected('memwave-m3-relations').relations;
  const rows = [
    { subject: 'Mira', relation: 'apprenticed_to', object: 'Tobin', ended: false },
    { subject: 'Mira', relation: 'partner_of', object: 'Esk', ended: false },
    { subject: 'Mira', relation: 'owes', object: 'Tobin', ended: true },
    { subject: 'Tobin', relation: 'mentor_of', object: 'Mira', ended: false },
  ];
  const full = scoreRelations(spec, { readMemory: ON, wave: { relations: rows } });
  assert.equal(full.pass, true, full.detail);
  assert.deepEqual(full.counts, { expected: 3, matched: 3, spurious: 0 });
  const noisy = scoreRelations(spec, { readMemory: ON, wave: { relations: [rows[0], { subject: 'Dov', relation: 'serves', object: 'Mira', ended: false }] } });
  assert.deepEqual(noisy.counts, { expected: 3, matched: 1, spurious: 1 });
});

test('acts: precision and recall over kept acts; the hearsay fixture expects none', () => {
  const spec = expected('memwave-m4-acts').acts;
  const half = scoreActs(spec, { readMemory: ON, wave: { acts: [{ q: 'rel_mira_tobin_trust', act: 'protected' }, { q: 'rel_mira_tobin_trust', act: 'gifted' }] } });
  assert.deepEqual(half.counts, { expected: 2, matched: 1, spurious: 1 });
  assert.equal(scoreActs(expected('memwave-m4-hearsay').acts, { readMemory: ON, wave: { acts: [] } }).pass, true);
});

test('wave totals: per-tier precision/recall, key share, valid-alias share, dropped player acts', () => {
  const lives: WaveLive[] = [
    { readMemory: ON, wave: { keyable: 4, keyed: [{ text: 'a', keys: ['k'] }, { text: 'b', keys: ['k', 'l'] }], tagged: [{ text: 'a', kind: 'same', id: 'm' }, { text: 'b', kind: 'same', id: null }], actsDropped: 1 } },
    { readMemory: ON, wave: { keyable: 0 } },
  ];
  const outcomes = [scoreActs({ expect: [{ q: 'q', act: 'lied' }] }, { readMemory: ON, wave: { acts: [{ q: 'q', act: 'lied' }] } })];
  const totals = waveTotals(lives, outcomes);
  assert.deepEqual(totals.keys, { lines: 4, keyed: 2, share: 0.5, overThree: 0 });
  assert.deepEqual(totals.tagged, { lines: 2, validAlias: 1, share: 0.5 });
  assert.equal(totals.actsDropped, 1);
  assert.deepEqual(totals.tiers.acts, { scored: 1, passed: 1, expected: 1, matched: 1, spurious: 0, precision: 1, recall: 1 });
  assert.deepEqual(totals.arm, ON);
});
