import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raterPrompt, readRating, summarize } from './sheetRater.mts';

const panels = ['base neutral', 'expression happy', 'frame blink'];

test('the rater prompt numbers every panel and asks for JSON only', () => {
  const prompt = raterPrompt(panels);
  assert.match(prompt, /1\. base neutral\n2\. expression happy\n3\. frame blink/);
  assert.match(prompt, /JSON only/);
});

test('a rating keeps judged panels and known defect kinds, and refuses an answer that skipped a panel', () => {
  const rating = readRating('s', panels, 'noise {"same":[{"panel":2,"same":true},{"panel":3,"same":false}],"defects":[{"panel":3,"kind":"eye","note":"open"},{"panel":9,"kind":"edge"},{"panel":1,"kind":"style"}]} tail');
  assert.deepEqual(rating.same, [{ panel: 2, same: true }, { panel: 3, same: false }]);
  assert.deepEqual(rating.defects, [{ panel: 3, kind: 'eye', note: 'open' }]);
  assert.throws(() => readRating('s', panels, '{"same":[{"panel":2,"same":true}],"defects":[]}'), /judged 1 of 2/);
  assert.throws(() => readRating('s', panels, 'no json'), /no JSON/);
});

test('the summary is the identity share over judged panels and the sheets with an edge, eye or rectangle defect', () => {
  const clean = readRating('a', panels, '{"same":[{"panel":2,"same":true},{"panel":3,"same":true}],"defects":[{"panel":2,"kind":"other","note":"x"}]}');
  const bad = readRating('b', panels, '{"same":[{"panel":2,"same":true},{"panel":3,"same":false}],"defects":[{"panel":3,"kind":"rectangle","note":"box"}]}');
  assert.deepEqual(summarize([clean, bad]), { sheets: 2, identity: 0.75, same: 3, judged: 4, flaggedSheets: ['b'], flagged: 1 });
});
