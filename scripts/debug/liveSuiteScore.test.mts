// v2.3 plan 01 §F. The live suite's number is quoted in gate records as evidence that the memory
// model works, so each way it could overstate is asserted here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_TIER_FLOORS, parseTierFloors, scoreContains, scoreRejected, suiteVerdict, tierTotals, type FixtureScore } from './lib/liveSuiteScore.mts';

test('a tier the fixture says nothing about is not scored, and never counted as passed', () => {
  const outcome = scoreContains('facts', undefined, []);
  assert.equal(outcome.scored, false);
  assert.equal(outcome.pass, false);
  // And it must not appear in the totals at all — reporting a silent 100% is the whole defect.
  assert.deepEqual(tierTotals([{ name: 'f1', pass: true, tiers: [outcome] }]), {});
});

test('facts are scored on count and content', () => {
  const live = [{ text: 'She pockets the brass key' }];
  assert.equal(scoreContains('facts', { minCount: 1, mustContain: ['brass key'] }, live).pass, true);
  assert.match(scoreContains('facts', { minCount: 2 }, live).detail, /expected at least 2 line\(s\), got 1/);
  assert.match(scoreContains('facts', { mustContain: ['lantern'] }, live).detail, /missing "lantern"/);
  assert.match(scoreContains('facts', { mustNotContain: ['brass'] }, live).detail, /must not contain "brass"/);
});

test('an empty needle is reported as vacuous, not honoured as a pass', () => {
  // Several shipped fixtures carry `mustContain: [""]`, which matches any output at all.
  const outcome = scoreContains('facts', { mustContain: [''], mustNotContain: ['zzz'] }, [{ text: 'anything' }]);
  assert.equal(outcome.pass, true);
  assert.deepEqual(outcome.vacuous, ['mustContain: ""']);
  const totals = tierTotals([{ name: 'f1', pass: true, tiers: [outcome] }]);
  assert.deepEqual(totals.facts.vacuous, ['mustContain: ""'], 'the totals surface it so nobody reads it as coverage');
});

test('rejections are scored by reason', () => {
  const live = [{ line: 'DELTA nope value=1', reason: 'unknown quality' }];
  assert.equal(scoreRejected([{ reason: 'unknown quality' }], live).pass, true);
  assert.match(scoreRejected([{ reason: 'missing evidence' }], live).detail, /missing rejection reason\(s\): missing evidence/);
});

test('an empty rejection expectation means nothing should have been rejected', () => {
  assert.equal(scoreRejected([], []).pass, true);
  const outcome = scoreRejected([], [{ reason: 'unknown quality' }]);
  assert.equal(outcome.pass, false);
  assert.match(outcome.detail, /expected no rejections, got unknown quality/);
});

test('per-tier totals are independent, so a strong tier cannot carry a weak one', () => {
  const scores: FixtureScore[] = [
    { name: 'a', pass: true, tiers: [scoreContains('facts', { mustContain: ['key'] }, [{ text: 'key' }]), scoreRejected([{ reason: 'missing evidence' }], [])] },
    { name: 'b', pass: true, tiers: [scoreContains('facts', { mustContain: ['key'] }, [{ text: 'key' }]), scoreRejected([{ reason: 'missing evidence' }], [])] },
  ];
  const totals = tierTotals(scores, { facts: 0.9, rejected: 0.9 });
  assert.equal(totals.facts.accuracy, 1);
  assert.equal(totals.facts.ok, true);
  assert.equal(totals.rejected.accuracy, 0);
  assert.equal(totals.rejected.ok, false, 'rejected failing its floor must not be hidden by facts passing');
});

test('a tier below its floor fails the run', () => {
  const totals = tierTotals(
    [{ name: 'a', pass: true, tiers: [scoreRejected([{ reason: 'x' }], [])] }],
    { rejected: 0.9 },
  );
  const verdict = suiteVerdict({ plotAccuracy: 1, min: 0.9, totals, ran: 1 });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons[0], /rejected accuracy 0 is below its floor 0\.9/);
});

test('the headline plot accuracy still gates on --min', () => {
  assert.equal(suiteVerdict({ plotAccuracy: 0.8, min: 0.9, totals: {}, ran: 22 }).ok, false);
  assert.equal(suiteVerdict({ plotAccuracy: 0.95, min: 0.9, totals: {}, ran: 22 }).ok, true);
});

test('a shrinking denominator cannot raise accuracy', () => {
  // Three of twenty-two fixtures running and all passing used to report 100%.
  const verdict = suiteVerdict({ plotAccuracy: 1, min: 0.9, totals: {}, ran: 3, expectCount: 22 });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons[0], /ran 3 fixture\(s\), expected 22/);
});

test('a fixture that could not complete is named and fails the run', () => {
  const verdict = suiteVerdict({ plotAccuracy: 1, min: 0.9, totals: {}, ran: 22, expectCount: 22, incomplete: ['extractor7'] });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons[0], /incomplete fixture\(s\): extractor7/);
});

test('--min-tier is parsed, and a bad entry is an error rather than a silent default', () => {
  assert.deepEqual(parseTierFloors('facts=0.85,rejected=0.9', {}).floors, { facts: 0.85, rejected: 0.9 });
  assert.match(parseTierFloors('nonsense=0.5').errors[0], /unknown tier "nonsense"/);
  assert.match(parseTierFloors('facts=high').errors[0], /is not a fraction between 0 and 1/);
  assert.match(parseTierFloors('facts=5').errors[0], /is not a fraction between 0 and 1/);
  assert.deepEqual(parseTierFloors('', {}).floors, {});
});

test('the per-tier floors bind by default, and an override or an explicit off is visible (T5)', () => {
  const none = parseTierFloors('');
  assert.deepEqual(none.floors, DEFAULT_TIER_FLOORS);
  assert.deepEqual(none.given, []);
  const tuned = parseTierFloors('facts=0.7,arcs=0');
  assert.equal(tuned.floors.facts, 0.7);
  assert.equal(tuned.floors.arcs, 0);
  assert.equal(tuned.floors.rejected, 0.9);
  assert.deepEqual(tuned.given, ['facts', 'arcs']);
  // The 2026-09-22 live measurement, scored with no flags at all, fails on its own two weak tiers.
  const totals = tierTotals([
    { name: 'a', pass: true, tiers: [...Array.from({ length: 22 }, (_, i) => ({ tier: 'facts' as const, scored: true, pass: i < 16, detail: '' })), ...Array.from({ length: 21 }, (_, i) => ({ tier: 'rejected' as const, scored: true, pass: i < 14, detail: '' }))] },
  ], none.floors);
  assert.deepEqual([totals.facts.ok, totals.rejected.ok], [false, false]);
});

test('a golden-scoped rejection is not scored live, and a live-scoped one beside it still is (v2.4 plan 04 seed C)', () => {
  const golden = scoreRejected([{ reason: 'missing evidence', scope: 'golden' }], []);
  assert.equal(golden.scored, false);
  assert.match(golden.detail, /golden-scoped/);
  assert.equal(scoreRejected([{ reason: 'missing evidence', scope: 'golden' }], [{ reason: 'unknown quality' }]).scored, false);
  const mixed = scoreRejected([{ reason: 'missing evidence', scope: 'golden' }, { reason: 'unknown quality' }], []);
  assert.equal(mixed.scored, true);
  assert.equal(mixed.pass, false);
  assert.match(mixed.detail, /missing rejection reason\(s\): unknown quality/);
  assert.equal(scoreRejected([], [{ reason: 'unknown quality' }]).pass, false, 'an empty expectation still claims nothing is rejected');
});

test('exactly the six golden-only rejection fixtures carry the golden scope (v2.4 plan 04 seed C)', () => {
  const dir = path.join(process.cwd(), 'test/fixtures');
  const scoped = fs.readdirSync(dir)
    .filter((file) => /^extractor\d*\.expected\.json$/.test(file))
    .filter((file) => (JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).rejected ?? []).some((entry: { scope?: string }) => entry.scope === 'golden'))
    .map((file) => file.replace('.expected.json', ''))
    .sort();
  assert.deepEqual(scoped, ['extractor11', 'extractor12', 'extractor15', 'extractor2', 'extractor3', 'extractor4']);
});

test('replayed on the v2.3 record, the rejected tier reads 14 of 15 and meets its unchanged 0.9 floor (v2.4 plan 04 seed C)', () => {
  const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test/journeys/records/v2.3-plan05-live/so-live-suite-report.json'), 'utf8'));
  const dir = path.join(process.cwd(), 'test/fixtures');
  const scores: FixtureScore[] = report.results.map((result: { name: string; tiers: Array<{ tier: string; pass: boolean }> }) => {
    const stated = JSON.parse(fs.readFileSync(path.join(dir, `${result.name}.expected.json`), 'utf8')).rejected as Array<{ reason?: string; scope?: string }> | undefined;
    const recorded = result.tiers.find((tier) => tier.tier === 'rejected');
    const { scored } = scoreRejected(stated, []);
    return { name: result.name, pass: true, tiers: recorded ? [{ tier: 'rejected' as const, scored, pass: scored && recorded.pass, detail: '' }] : [] };
  });
  const totals = tierTotals(scores, { rejected: 0.9 });
  assert.equal(totals.rejected.scored, 15);
  assert.equal(totals.rejected.passed, 14);
  assert.equal(totals.rejected.ok, true);
});

const liveFixtures = () => fs.readdirSync(path.join(process.cwd(), 'test/fixtures')).filter((file) => /^extractor.*\.story\.json$/.test(file)).map((file) => file.replace('.story.json', '')).sort();
const expectedOf = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test/fixtures', `${name}.expected.json`), 'utf8'));

test('v2.5 plan 05 F2: the live suite runs 29 fixtures, and --expect-count 29 refuses 28', () => {
  const names = liveFixtures();
  assert.equal(names.length, 29);
  assert.equal(suiteVerdict({ plotAccuracy: 1, min: 0.9, totals: {}, ran: 29, expectCount: 29 }).ok, true);
  assert.equal(suiteVerdict({ plotAccuracy: 1, min: 0.9, totals: {}, ran: 28, expectCount: 29 }).ok, false);
});

test('v2.5 plan 05 F2: epistemic x3, ledger x2 and arcs x2 are stated, and no needle this plan wrote or replaced is vacuous', () => {
  const stating = (tier: string) => liveFixtures().filter((name) => expectedOf(name)[tier]);
  assert.deepEqual(stating('epistemic'), ['extractor23', 'extractor24', 'extractor25']);
  assert.deepEqual(stating('ledger'), ['extractor26', 'extractor27']);
  assert.deepEqual(stating('arcs'), ['extractor28', 'extractor29']);
  const touched = ['extractor21', 'extractor22', 'extractor23', 'extractor24', 'extractor25', 'extractor26', 'extractor27', 'extractor28', 'extractor29'];
  const vacuous = touched.flatMap((name) => ['facts', 'memory', 'epistemic', 'ledger', 'arcs'].flatMap((tier) => (scoreContains(tier as 'facts', expectedOf(name)[tier], []).vacuous ?? []).map((entry) => `${name}.${tier}: ${entry}`)));
  assert.deepEqual(vacuous, []);
});

test('v2.5 plan 05 F2: the new expectations are frozen as written before any live answer', () => {
  const frozen: Record<string, string> = { extractor23: '6aa63a7b14747b3b', extractor24: 'e81191ba4104c6db', extractor25: '3ec2276685de4cca', extractor26: 'f734e586d9269995', extractor27: '5d351db158c1b8fc', extractor28: '300d064c81bb6d9c', extractor29: 'b16eece57319e446' };
  const actual = Object.fromEntries(Object.keys(frozen).map((name) => [name, createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), 'test/fixtures', `${name}.expected.json`), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)]));
  assert.deepEqual(actual, frozen);
});

test('v2.6 plan 01: a declared "none" and a golden scope are not scored, and a spec that claims nothing is vacuous', () => {
  const none = scoreContains('facts', { none: 'state the delta carries' }, [{ text: 'anything' }]);
  assert.deepEqual([none.scored, none.vacuous], [false, undefined]);
  assert.match(none.detail, /declares no facts expectation: state the delta carries/);
  assert.equal(scoreContains('facts', { scope: 'golden', mustContain: ['key'] }, []).scored, false);
  const live = scoreContains('facts', { scope: 'live', minCount: 1, mustContain: ['pact'] }, []);
  assert.deepEqual([live.scored, live.pass], [true, false]);
  assert.deepEqual(scoreContains('facts', { minCount: 0 }, []).vacuous, ['no assertion']);
  assert.deepEqual(scoreContains('facts', { mustContain: [], mustNotContain: ['chest'] }, []).vacuous, undefined);
});

test('v2.6 plan 01: no extractor fixture carries a vacuous expectation in any tier, and the facts column is 5 claims + 9 declared none', () => {
  const tiers = ['facts', 'memory', 'epistemic', 'ledger', 'arcs'] as const;
  const vacuous = liveFixtures().flatMap((name) => tiers.flatMap((tier) => (scoreContains(tier, expectedOf(name)[tier], []).vacuous ?? []).map((entry) => `${name}.${tier}: ${entry}`)));
  assert.deepEqual(vacuous, []);
  const declaredNone = liveFixtures().filter((name) => typeof expectedOf(name).facts?.none === 'string');
  assert.deepEqual(declaredNone, ['extractor10', 'extractor11', 'extractor14', 'extractor16', 'extractor20', 'extractor6', 'extractor7', 'extractor8', 'extractor9']);
  const liveScoped = liveFixtures().filter((name) => expectedOf(name).facts?.scope === 'live');
  assert.deepEqual(liveScoped, ['extractor12', 'extractor17', 'extractor18', 'extractor19']);
});
