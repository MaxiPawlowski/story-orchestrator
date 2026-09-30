import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateSeconds, fixCommitsByPath, guardOf, isCitedRecord, isGenericCitation, isVacuousNeedleSpec, jestShape, jestTier, stepsShape, testTitles } from './suiteInventory.mjs';

test('a jest file is pure only when it lives in a pure dir and does not reach the host seam', () => {
  assert.equal(jestTier('src/engine/x.test.ts', 'import { a } from "./a";'), 'pure unit');
  assert.equal(jestTier('src/engine/x.test.ts', 'import { a } from "@services/STAPI";'), 'unit (host faked)');
  assert.equal(jestTier('src/runtime/x.test.ts', ''), 'unit (host faked)');
});

test('guards rank invariant > defect > contract > nothing named', () => {
  assert.equal(guardOf('src/runtime/architecture.test.ts', ''), 'invariant');
  assert.equal(guardOf('src/runtime/a.review.test.ts', ''), 'defect');
  assert.equal(guardOf('src/a.test.ts', 'describe("V4: what one turn is"'), 'defect');
  assert.equal(guardOf('src/a.test.ts', 'it("renders per plan 07")'), 'contract');
  assert.equal(guardOf('src/a.test.ts', 'it("adds two numbers")'), 'nothing named');
});

test('a jest file with tests and no assertion is vacuous; titles are read', () => {
  assert.equal(jestShape('it("a", () => { run(); });').vacuous, true);
  assert.equal(jestShape('it("a", () => { expect(run()).toBe(1); });').vacuous, false);
  assert.equal(jestShape('it.skip("a", () => { expect(1).toBe(1); });').skipped, 1);
  assert.deepEqual(testTitles('it("one", f);\ntest(\'two\', g);'), ['one', 'two']);
});

test('a step list needs a model when it generates, or calls a pass without a mocked response', () => {
  assert.equal(stepsShape([{ send_generate: 'hi' }, { expect: { x: 1 } }]).needsLlm, true);
  assert.equal(stepsShape([{ extract: { debugResponse: 'SCENE_NONE' } }, { expect: { x: 1 } }]).needsLlm, false);
  assert.equal(stepsShape([{ extract: {} }]).needsLlm, true);
  assert.equal(stepsShape([{ send: 'hi' }, { slash: '/x' }]).vacuous, true);
  assert.equal(stepsShape([{ eval: 'if (!ok) throw new Error("x")' }]).vacuous, false);
  assert.equal(stepsShape([{ ui: { action: 'open-drawer' } }, { ui: { action: 'assert-player-clean' } }]).vacuous, false);
  assert.equal(stepsShape([{ ui: { action: 'pointer-click', selector: '#a', expectVisible: '#b' } }]).vacuous, false);
  assert.equal(stepsShape([{ ui: { action: 'open-drawer' } }]).vacuous, true);
  assert.equal(estimateSeconds(stepsShape([{ send_generate: 'a' }])), 5 + 2 + 45);
});

test('an empty needle is vacuous, a real one is not', () => {
  assert.deepEqual(isVacuousNeedleSpec({ mustContain: [''], mustNotContain: ['zzz'] }), ['mustContain: ""']);
  assert.deepEqual(isVacuousNeedleSpec({ mustContain: ['gate'] }), []);
  assert.deepEqual(isVacuousNeedleSpec(undefined), []);
  assert.deepEqual(isVacuousNeedleSpec({ none: 'the delta carries it' }), []);
  assert.deepEqual(isVacuousNeedleSpec({ minCount: 0 }), ['no assertion']);
});

test('fix commits are counted per path from a name-only log', () => {
  const log = '@@a1\tfix: rollback\nsrc/a.ts\nsrc/b.ts\n\n@@b2\tfeat: thing\nsrc/a.ts\n\n@@c3\tv2.4 T1: regression in x\nsrc/a.ts\n';
  const counts = fixCommitsByPath(log);
  assert.equal(counts.get('src/a.ts'), 2);
  assert.equal(counts.get('src/b.ts'), 1);
});

test('a specific citation keeps what it names; a gate-dir citation keeps only its markdown', () => {
  const root = 'test/journeys/records/';
  assert.equal(isGenericCitation(`${root}v2.4-plan01/`), true);
  assert.equal(isGenericCitation(`${root}v2.4-plan01/J7/`), false);
  const cited = [`${root}v2.4-plan01/`, `${root}v2.4-plan07/part1/`, `${root}v2.3-plan03/run1`];
  assert.equal(isCitedRecord(`${root}v2.4-plan01/README.md`, cited), true);
  assert.equal(isCitedRecord(`${root}v2.4-plan01/run1.json`, cited), false);
  assert.equal(isCitedRecord(`${root}v2.4-plan07/part1/x/record.json`, cited), true);
  assert.equal(isCitedRecord(`${root}v2.3-plan03/run1.json`, cited), true);
  assert.equal(isCitedRecord(`${root}v2.3-plan03/run10.json`, cited), false);
  assert.equal(isCitedRecord(`${root}v2.4-plan07/part10/record.json`, cited), false);
});
