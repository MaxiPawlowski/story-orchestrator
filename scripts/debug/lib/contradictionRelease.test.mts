import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './connection.mts';
import { COSINE_SAME_TOPIC, K0_FIXTURE, K0_FIXTURE_NAME, bracketFileNames, releaseCases, releaseFixturePath, releaseModes } from './contradictionRelease.mts';

const k0 = {
  use: 'memory-contradictions',
  rows: [
    { id: 'K01', lang: 'en', label: 'contradicts', established: 'e1', claim: 'c1', band: { jaccard: 'sameTopic' } },
    { id: 'K02', lang: 'es', label: 'contradicts', established: 'e2', claim: 'c2', band: { jaccard: 'below' } },
    { id: 'K03', lang: 'en', label: 'agrees', established: 'e3', claim: 'c3', band: { jaccard: 'dup' } },
    { id: 'K04', lang: 'en', label: 'agrees', established: 'e4', claim: 'c4', band: { jaccard: 'below' } },
  ],
};

test('the default contradiction-release fixture is K0 itself, a named one is a judge fixture', () => {
  assert.equal(releaseFixturePath(K0_FIXTURE_NAME), K0_FIXTURE);
  assert.equal(releaseFixturePath('contradiction-release-holdout'), 'test/fixtures/judge/contradiction-release-holdout.json');
  assert.equal(JSON.parse(readFileSync(join(PROJECT_ROOT, K0_FIXTURE), 'utf-8')).use, 'memory-contradictions');
});

test('cases carry only what the judge is asked and scored on', () => {
  assert.deepEqual(releaseCases(k0)[1], { id: 'K02', lang: 'es', label: 'contradicts', established: 'e2', claim: 'c2' });
});

test('K0 without a bracket file: the Jaccard mode is the frozen band, the vectors mode is unmeasured', () => {
  assert.deepEqual(releaseModes(k0, []), { jaccard: ['K01', 'K03'], vectors: null });
});

test('each bracket file adds a vectors mode: the Jaccard band united with a cosine at or above the same-topic threshold', () => {
  const modes = releaseModes(k0, [
    { bundle: 'aaaaaaaaaaaa', rows: { K01: 0.1, K02: COSINE_SAME_TOPIC, K03: 0.2, K04: 0.5499 } },
    { bundle: 'bbbbbbbbbbbb', rows: { K01: 0.9, K02: 0.1, K03: 0.9, K04: 0.9 } },
  ]);
  assert.deepEqual(modes, { jaccard: ['K01', 'K03'], 'vectors:aaaaaaaaaaaa': ['K01', 'K02', 'K03'], 'vectors:bbbbbbbbbbbb': ['K01', 'K03', 'K04'] });
});

test('a bracket file missing a row refuses rather than reading the row as below the band', () => {
  assert.throws(() => releaseModes(k0, [{ bundle: 'cccccccccccc', rows: { K01: 0.1 } }]), /K02/);
});

test('a hold-out has no bands: every row is scored, in one mode', () => {
  const holdout = { use: 'contradiction-release', rows: k0.rows.map(({ band: _band, ...row }) => row) };
  assert.deepEqual(releaseModes(holdout, []), { holdout: ['K01', 'K02', 'K03', 'K04'] });
});

test('only recorded bracket files are read', () => {
  assert.deepEqual(bracketFileNames(['contradictions.json', 'contradictions.cosine.0123456789ab.json', 'contradictions.cosine.x.json']), ['contradictions.cosine.0123456789ab.json']);
});

test('the same-topic threshold is the one consolidation reads', () => {
  const source = readFileSync(join(PROJECT_ROOT, 'src/memory/consolidate.ts'), 'utf-8');
  assert.equal(Number(/cosineSameTopic:\s*([0-9.]+)/.exec(source)?.[1]), COSINE_SAME_TOPIC);
});
