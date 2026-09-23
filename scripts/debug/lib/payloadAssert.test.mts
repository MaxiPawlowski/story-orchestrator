// The payload assertions plan 05's live gate rests on. The case that matters most is the third one:
// a needle that sits in the shared TRANSCRIPT must satisfy `within`-scoped checks FALSE — that exact
// false positive cost J5.8 a day (2026-09-22), and a whole-body search is what produced it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payloadFailures, regionOf, memberMatches, type PayloadEntryLike } from './payloadAssert.mts';

const entry = (body: string, member: string | null = 'Belle'): PayloadEntryLike => ({ body, member, capturedAt: '2026-09-22T00:00:00.000Z' });
const blocks = (values: Record<string, string>, member: string | null = null): PayloadEntryLike => ({
  member,
  capturedAt: '2026-09-22T00:00:00.000Z',
  blocks: Object.entries(values).map(([key, value]) => ({ key, value })),
});

const withBlock = (blockText: string, transcript = '') => `prompt\n\nYour private knowledge\n${blockText}\n\nMara: ${transcript}\n`;

test('contains and absent read the drafted member\'s own capture', () => {
  const entries = [entry(withBlock('- You know: the north road washed out'))];
  assert.deepEqual(payloadFailures(entries, { payloadContains: [{ member: 'Belle', text: 'north road washed out' }] }), []);
  assert.equal(payloadFailures(entries, { payloadAbsent: [{ member: 'Belle', text: 'north road washed out' }] }).length, 1);
});

test('a needle in the shared transcript does NOT satisfy a region-scoped contains', () => {
  const entries = [entry(withBlock('', 'the north road washed out, he said'))];
  assert.equal(payloadFailures(entries, { payloadContains: [{ member: 'Belle', within: 'Your private knowledge', text: 'north road washed out' }] }).length, 1, 'the transcript is not the private block');
  // …and the same text read without a region is found, which is the loose form the gate must not use.
  assert.deepEqual(payloadFailures(entries, { payloadContains: [{ text: 'north road washed out' }] }), []);
});

test('a missing region marker is a failure, never a silent whole-body search', () => {
  const failures = payloadFailures([entry('prompt with no marker at all')], { payloadContains: [{ within: 'Your private knowledge', text: 'anything' }] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /region marker .* is not in this capture/);
});

test('the member filter names who the capture was for, and says so when there is none', () => {
  const entries = [entry('x', 'Ponticius'), entry('y', 'Arin')];
  const failures = payloadFailures(entries, { payloadContains: [{ member: 'Belle', text: 'anything' }] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no captured payload for member "Belle"/);
  assert.match(failures[0], /Ponticius, Arin/, 'the failure lists who the captures WERE drafted for');
  assert.deepEqual(payloadFailures(entries, { payloadContains: [{ text: 'y' }] }), []);
});

test('an unarmed run cannot answer a question about a request', () => {
  const failures = payloadFailures([], { payloadAbsent: [{ text: 'gone' }] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no generation payload was captured/);
  assert.deepEqual(payloadFailures([], {}), [], 'no expectation, no complaint');
});

test('an empty needle is refused rather than passed', () => {
  const failures = payloadFailures([entry('anything')], { payloadContains: [{ text: '' }] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /empty text asserts nothing/);
});

test('regionOf takes the LAST marker and stops at the next blank line', () => {
  const body = 'first\nMarker\nin the first\n\nsecond\nMarker\nin the second\n\nlater';
  const region = regionOf(body, 'Marker');
  assert.ok('region' in region);
  assert.match(region.region, /in the second/);
  assert.ok(!region.region.includes('in the first'));
  assert.ok('error' in regionOf('no markers here', 'Marker'));
});

test('a member name matches exactly, not by substring', () => {
  assert.equal(memberMatches({ member: 'Belle' }, 'belle'), true);
  assert.equal(memberMatches({ member: 'Belle' }, 'Bell'), false, 'a prefix is a different member');
  assert.equal(memberMatches({ member: null }, 'Belle'), false);
  assert.equal(memberMatches({ member: null }, null), true, 'no member named means any capture');
});

// The runtime's own ring (always on, per-block) is what a scenario uses, because the HTTP ring needs
// arming and a scenario cannot arm itself. Block scoping is the precise form: it asks what the
// extension INSTALLS, not what happens to be somewhere in the request.
test('a named block scopes the search to that block, and a missing block is a failure', () => {
  const entries = [blocks({ story_orchestrator_memory_facts: '- Mara trusts the player', story_orchestrator_epistemic: '- You know: nothing' })];
  assert.deepEqual(payloadFailures(entries, { payloadContains: [{ key: 'story_orchestrator_memory_facts', text: 'trusts the player' }] }), []);
  const wrong = payloadFailures(entries, { payloadContains: [{ key: 'story_orchestrator_epistemic', text: 'trusts the player' }] });
  assert.equal(wrong.length, 1, 'the fact is NOT in the epistemic block');
  const missing = payloadFailures(entries, { payloadAbsent: [{ key: 'story_orchestrator_short_term', text: 'anything' }] });
  assert.equal(missing.length, 1);
  assert.match(missing[0], /no injected block named .*\(blocks: story_orchestrator_memory_facts, story_orchestrator_epistemic\)/);
});

