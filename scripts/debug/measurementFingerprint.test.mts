import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareFingerprints, configFingerprint, fingerprintsOf, promptFingerprint } from './lib/measurementFingerprint.mts';

test('v2.8 35 G8: fingerprints change with the prompt template, the model and the config, not with prompt order', () => {
  assert.equal(promptFingerprint(['b', 'a']), promptFingerprint(['a', 'b']));
  assert.notEqual(promptFingerprint(['a', 'b']), promptFingerprint(['a', 'c']));
  assert.equal(promptFingerprint([]), null);
  const header = { host: { mainApi: 'textgenerationwebui' }, profiles: { selected: 'A' }, extraction: { cadence: 2 }, chat: { chatId: 'x' } };
  assert.equal(configFingerprint(header), configFingerprint({ ...header, chat: { chatId: 'y' }, capturedAt: 'later' }));
  assert.notEqual(configFingerprint(header), configFingerprint({ ...header, extraction: { cadence: 3 } }));
  const made = fingerprintsOf({ prompts: ['a'], model: 'm', header });
  assert.deepEqual(Object.keys(made), ['prompt', 'scorer', 'model', 'config']);
  assert.equal(compareFingerprints(made, { ...made }).comparable, true);
  assert.deepEqual(compareFingerprints(made, { ...made, model: 'n' }).differs, ['model']);
  assert.equal(compareFingerprints(made, { ...made, model: 'n' }, ['model']).comparable, true);
  assert.equal(compareFingerprints(made, null).missing, true);
});

test('v2.8 35 G8: every measurement record writer stores the fingerprints', () => {
  for (const script of ['so-live-suite.mts', 'so-role-calibration.mts']) {
    const source = readFileSync(new URL(`./${script}`, import.meta.url), 'utf8');
    assert.match(source, /fingerprints = fingerprintsOf\(/, script);
    assert.match(source, /\n\s+fingerprints,\r?\n/, script);
  }
});
