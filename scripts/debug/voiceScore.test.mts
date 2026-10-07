import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { badNote, floorsProblems, scoreVoice, type VoiceReportRow } from './lib/voiceScore.mts';

const floors = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/judge/spike-voice.json'), 'utf-8')).floors;
const NOTE = 'Voice: the last reply did not sound like Arin. Let the next one come back to their own way of speaking and wanting.';

const rows = ({ caught = 10, falseNotes = 0, fallbacks = 0, note = NOTE } = {}): VoiceReportRow[] => [
  ...Array.from({ length: 10 }, (_, index): VoiceReportRow => ({ id: `v${index}.ooc`, right: index < caught, picked: index < fallbacks ? null : 'score', detail: index < caught && index >= fallbacks ? note : null, ...(index < fallbacks ? { fallback: 'timeout' } : {}) })),
  ...Array.from({ length: 10 }, (_, index): VoiceReportRow => ({ id: `w${index}.in`, right: index >= falseNotes, picked: 'score', detail: index < falseNotes ? note : null })),
];

test('37 L6-C: the frozen floors are read from spike-voice.json and a clean replay passes', () => {
  assert.deepEqual(floorsProblems(floors), []);
  const result = scoreVoice(rows(), floors, { verdict: 'matched' });
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.incomplete));
  assert.equal(result.checks.oocRecall.value, 1);
});

test('37 L6-C planted failures: recall 0.7, two false notes, a rewrite note, two fallbacks', () => {
  assert.equal(scoreVoice(rows({ caught: 8 }), floors).verdict, 'PASS', '8 of 10 is the floor');
  assert.equal(scoreVoice(rows({ caught: 7 }), floors).verdict, 'FAIL');
  assert.equal(scoreVoice(rows({ falseNotes: 1 }), floors).verdict, 'PASS');
  assert.equal(scoreVoice(rows({ falseNotes: 2 }), floors).verdict, 'FAIL');
  assert.equal(scoreVoice(rows({ note: 'Rewrite the reply so Arin sounds calmer.' }), floors).verdict, 'FAIL');
  assert.equal(badNote('You decide to leave the market.'), true);
  assert.equal(badNote(NOTE), false);
  const two = scoreVoice(rows({ fallbacks: 2 }), floors);
  assert.equal(two.checks.fallbacks.value, 2);
  assert.equal(two.verdict, 'FAIL');
});

test('37 L6-C is INCOMPLETE on the uncollected fixture, a broken 10/10 split, or another model', () => {
  assert.match(scoreVoice([], floors).incomplete.join(), /0 row\(s\), the floors are over 20/);
  assert.match(scoreVoice(rows().slice(1), floors).incomplete.join(), /9 out-of-character and 10 in-character/);
  assert.equal(scoreVoice(rows(), floors, { verdict: 'mismatch' }).verdict, 'INCOMPLETE');
  assert.match(floorsProblems({ oocRecallMin: 0.8 }).join(), /no floor falseNoteRateMax/);
});
