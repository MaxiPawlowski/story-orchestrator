import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criticRecordsIn, quotePresent, quotesIn, tallyCriticQuotes } from './lib/criticQuotes.mts';

const beats = [{ title: 'The bridge', outcomes: [{ label: 'Mara crosses the "old bridge" at dusk' }] }];

test('v2.8 69 K16: quotes are read from a finding in straight and curly quotes', () => {
  assert.deepEqual(quotesIn('Beat 2 says "old bridge" but the cast says ‘Mara’.'), ['old bridge', 'Mara']);
  assert.deepEqual(quotesIn('No quote here.'), []);
});

test('v2.8 69 K16: a quote is present after folding case, quotes and spaces', () => {
  assert.equal(quotePresent(JSON.stringify(beats), 'Old  Bridge'), true);
  assert.equal(quotePresent(JSON.stringify(beats), 'stone tower'), false);
});

test('v2.8 69 K16: the tally counts findings whose quote is absent from the candidate, and skips judge verdicts', () => {
  const tally = tallyCriticQuotes([
    { beats, verdicts: [{ raw: '{}', issues: ['Beat 1 repeats "old bridge".', 'Beat 1 invents "stone tower".', 'Too short.'] }] },
    { beats, verdicts: [{ raw: 'JUDGE', issues: ['A beat brings in a named character "Zed".'] }] },
  ]);
  assert.deepEqual(tally, { verdicts: 2, judgeVerdicts: 1, modelVerdicts: 1, findings: 3, quotedFindings: 2, quotes: 2, absentQuotes: 1, findingsWithAbsentQuote: 1 });
});

test('v2.8 69 K16: expansion entries are found anywhere in a chat blob', () => {
  const blob = { chat_metadata: { story_orchestrator: { stories: { s: { extras: { expansion: { entries: { a: { beats, verdicts: [] }, b: { verdicts: [] } } } } } } } } };
  assert.equal(criticRecordsIn(blob).length, 1);
});
