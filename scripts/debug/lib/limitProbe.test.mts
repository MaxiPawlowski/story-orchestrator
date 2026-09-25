import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyProbe, limitProbeCases, PLUGIN_MAX_REQUEST_CHARS, requestChars } from './limitProbe.mts';

test('every case fits the plugin cap, so it travels the real page -> plugin -> API path', () => {
  const cases = limitProbeCases();
  assert.deepEqual(cases.map((probe) => probe.id), ['en-20k', 'en-30k', 'es-30k', 'dense-10k', 'dense-40k', 'dense-50k']);
  for (const probe of cases) assert.ok(requestChars(probe) < PLUGIN_MAX_REQUEST_CHARS, `${probe.id} is ${requestChars(probe)} chars`);
  assert.equal(limitProbeCases()[4].text, cases[4].text);
});

const row = (id: string, lang: string, chars: number, inputTokens: number | null, answered = inputTokens !== null) => ({ id, lang, chars, http: answered ? 200 : 422, inputTokens, answered });

test('an API that refuses past the limit reads refuses, with the ratio measured under it', () => {
  const verdict = classifyProbe([row('en-20k', 'en', 80_000, 18_000), row('es-30k', 'es', 105_000, 29_000), row('dense-10k', 'dense', 25_000, 10_000), row('dense-40k', 'dense', 100_000, null)]);
  assert.equal(verdict.behaviour, 'refuses');
  assert.deepEqual(verdict.pastLimit, ['dense-40k']);
  assert.equal(verdict.charsPerToken.en, 4.444);
  assert.equal(verdict.conclusive, true);
});

test('an answer counted far below its projection is silent truncation', () => {
  const verdict = classifyProbe([row('en-20k', 'en', 80_000, 18_000), row('es-30k', 'es', 105_000, 29_000), row('dense-10k', 'dense', 25_000, 10_000), row('dense-40k', 'dense', 100_000, 30_000)]);
  assert.equal(verdict.behaviour, 'truncates');
});

test('an answer that counts past the limit is answers; nothing past it is inconclusive', () => {
  assert.equal(classifyProbe([row('en-20k', 'en', 80_000, 18_000), row('dense-10k', 'dense', 25_000, 10_000), row('dense-40k', 'dense', 100_000, 40_100)]).behaviour, 'answers');
  const none = classifyProbe([row('en-20k', 'en', 80_000, 18_000)]);
  assert.equal(none.behaviour, 'not-reached');
  assert.equal(none.conclusive, false);
});
