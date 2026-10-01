import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TIER_FLOORS, INTENTS_FLOORS, parseTierFloors, scoreIntents, suiteVerdict, tierTotals, type FixtureScore, type IntentsSpec, type LiveEpistemicRow, type TierOutcome } from './lib/liveSuiteScore.mts';

const DIR = path.join(process.cwd(), 'test/fixtures');
const GOLDENS = path.join(process.cwd(), 'test/goldens');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
const intentFixtures = () => fs.readdirSync(DIR).filter((file) => /^extractor.*\.expected\.json$/.test(file)).map((file) => file.replace('.expected.json', '')).filter((name) => read(`${name}.expected.json`).intents).sort();
const players = (name: string) => (read(`${name}.transcript.json`) as Array<{ speaker: string; is_user?: boolean }>).filter((entry) => entry.is_user === true).map((entry) => entry.speaker);
const goldenIntents = (name: string): LiveEpistemicRow[] => fs.readFileSync(path.join(GOLDENS, `${name}.response.txt`), 'utf8').split(/\r?\n/)
  .map((line) => line.trim().match(/^\[(intends)\]\s+(.+?)\s*\|\s*(.+)$/i))
  .filter((match): match is RegExpMatchArray => Boolean(match))
  .map((match) => ({ tag: match[1].toLowerCase(), subject: match[2], content: match[3] }));

const KAEL: IntentsSpec = { expect: [{ subject: 'Kael', anyOf: ['burn', 'grain'] }], players: ['Max'] };
const row = (subject: string, content: string, tag = 'intends'): LiveEpistemicRow => ({ tag, subject, content });
const fixture = (name: string, outcome: TierOutcome): FixtureScore => ({ name, pass: true, tiers: [outcome] });

test('a correct intent passes, and rows with other tags are not intents', () => {
  const outcome = scoreIntents(KAEL, [row('Kael', 'burn the grain store'), row('Lyria', 'the plan', 'knows')]);
  assert.deepEqual([outcome.scored, outcome.pass], [true, true]);
  assert.deepEqual(outcome.counts, { expected: 1, matched: 1, spurious: 0, playerAttributed: 0 });
});

test('negative control: a player-attributed intent fails the fixture and the tier, whatever else is right', () => {
  const outcome = scoreIntents(KAEL, [row('Kael', 'burn the grain store'), row('Max', 'rob the bank')]);
  assert.equal(outcome.pass, false);
  assert.equal(outcome.counts?.playerAttributed, 1);
  assert.match(outcome.detail, /player-attributed intent: Max/);
  const transcriptPlayer = scoreIntents({ expect: [] }, [row('max', 'rob the bank')], ['Max']);
  assert.equal(transcriptPlayer.counts?.playerAttributed, 1, 'a transcript is_user speaker counts as a player without being listed');
  const totals = tierTotals(Array.from({ length: 10 }, (_, i) => fixture(`f${i}`, scoreIntents(KAEL, i === 0 ? [row('Kael', 'burn it'), row('Max', 'x')] : [row('Kael', 'burn it')]))), DEFAULT_TIER_FLOORS);
  assert.equal(totals.intents.intents?.precision, 0.9091);
  assert.equal(totals.intents.ok, false, 'precision clears 0.8 and recall is 1.0, and one player row still fails the tier');
  assert.match(suiteVerdict({ plotAccuracy: 1, min: 0.9, totals, ran: 10 }).reasons.join(' '), /intents playerAttributed 1 is above its floor 0/);
});

test('negative control: an intent for the wrong subject is spurious and the claim stays missing', () => {
  const outcome = scoreIntents(KAEL, [row('Lyria', 'burn the grain store')]);
  assert.equal(outcome.pass, false);
  assert.deepEqual(outcome.counts, { expected: 1, matched: 0, spurious: 1, playerAttributed: 0 });
  assert.match(outcome.detail, /unclaimed intent: Lyria/);
  assert.match(outcome.detail, /missing intent for Kael/);
});

test('negative control: an empty live answer against a positive claim fails, and the tier fails recall', () => {
  const outcome = scoreIntents(KAEL, []);
  assert.deepEqual([outcome.scored, outcome.pass], [true, false]);
  const totals = tierTotals([fixture('a', outcome), fixture('b', scoreIntents(KAEL, []))]);
  assert.equal(totals.intents.intents?.precision, null);
  assert.equal(totals.intents.intents?.recall, 0);
  assert.equal(totals.intents.ok, false);
  assert.match(totals.intents.failures?.join(' ') ?? '', /intents recall 0 is below its floor 0\.5/);
});

test('an expectation of none is a real claim: any intent is spurious, nothing is not', () => {
  assert.equal(scoreIntents({ expect: [] }, []).pass, true);
  assert.equal(scoreIntents({ expect: [] }, []).vacuous, undefined);
  const outcome = scoreIntents({ expect: [] }, [row('Hobb', 'poison the soup')]);
  assert.deepEqual([outcome.pass, outcome.counts?.spurious], [false, 1]);
});

test('a vacuous claim is flagged vacuous and never passes', () => {
  const noExpect = scoreIntents({ players: ['Max'] }, []);
  assert.deepEqual([noExpect.scored, noExpect.pass, noExpect.vacuous], [true, false, ['no assertion']]);
  const blankNeedle = scoreIntents({ expect: [{ subject: 'Kael', anyOf: [''] }] }, [row('Kael', 'anything')]);
  assert.equal(blankNeedle.pass, false);
  assert.deepEqual(blankNeedle.vacuous, ['anyOf: "" (Kael)']);
  const blankSubject = scoreIntents({ expect: [{ subject: ' ', anyOf: ['x'] }] }, []);
  assert.deepEqual(blankSubject.vacuous, ['subject: ""']);
  const totals = tierTotals([fixture('a', blankNeedle), fixture('b', scoreIntents(KAEL, [row('Kael', 'burn')]))]);
  assert.equal(totals.intents.ok, false);
  assert.match(totals.intents.failures?.join(' ') ?? '', /vacuous claim/);
});

test('none and golden scope are not scored, and no claim at all leaves the tier out of the totals', () => {
  assert.equal(scoreIntents({ none: 'not an intent fixture' }, [row('Kael', 'x')]).scored, false);
  assert.equal(scoreIntents({ scope: 'golden', expect: [] }, [row('Kael', 'x')]).scored, false);
  assert.equal(scoreIntents(undefined, [row('Kael', 'x')]).scored, false);
  assert.deepEqual(tierTotals([fixture('a', scoreIntents(undefined, []))]), {});
});

test('one live row satisfies one claim: a duplicate does not double-count recall', () => {
  const outcome = scoreIntents(KAEL, [row('Kael', 'burn the grain'), row('Kael', 'burn the grain store tonight')]);
  assert.deepEqual(outcome.counts, { expected: 1, matched: 1, spurious: 1, playerAttributed: 0 });
});

test('floors: precision floor is --min-tier intents, recall and playerAttributed are fixed, 0 switches the tier off', () => {
  assert.deepEqual(INTENTS_FLOORS, { precision: 0.8, recall: 0.5, playerAttributed: 0 });
  assert.equal(DEFAULT_TIER_FLOORS.intents, 0.8);
  assert.equal(parseTierFloors('intents=0.9').floors.intents, 0.9);
  const sevenOfTen = Array.from({ length: 10 }, (_, i) => fixture(`f${i}`, scoreIntents(KAEL, i < 7 ? [row('Kael', 'burn')] : [row('Kael', 'sing')])));
  assert.equal(tierTotals(sevenOfTen, { intents: 0.8 }).intents.ok, false);
  assert.equal(tierTotals(sevenOfTen, { intents: 0.7 }).intents.ok, true);
  assert.equal(tierTotals(sevenOfTen, { intents: 0 }).intents.ok, true);
  const lowRecall = [...Array.from({ length: 4 }, (_, i) => fixture(`h${i}`, scoreIntents(KAEL, [row('Kael', 'burn')]))), ...Array.from({ length: 5 }, (_, i) => fixture(`m${i}`, scoreIntents(KAEL, [])))];
  const totals = tierTotals(lowRecall, { intents: 0.8 });
  assert.deepEqual([totals.intents.intents?.precision, totals.intents.intents?.recall, totals.intents.ok], [1, 0.4444, false]);
});

test('the corpus: at least 12 fixtures claim intents, 3 claim none, the shapes b-intents.json asks for are present', () => {
  const names = intentFixtures();
  assert.ok(names.length >= 12, `${names.length} intents fixtures`);
  const claims = names.map((name) => read(`${name}.expected.json`).intents as IntentsSpec);
  assert.ok(claims.filter((spec) => (spec.expect ?? []).length > 0).length >= 8);
  assert.ok(claims.filter((spec) => (spec.expect ?? []).length === 0).length >= 2);
  const narrationOnly = names.filter((name) => (read(`${name}.expected.json`).intents.expect ?? []).length === 0 && players(name).length > 0);
  assert.ok(narrationOnly.length >= 2, 'player narration that implies an aim must yield none');
  const meta = names.filter((name) => (read(`${name}.transcript.json`) as Array<{ text: string }>).some((entry) => /\(OOC:|\[Note: as an AI/.test(entry.text)));
  assert.ok(meta.length >= 2, 'meta-commentary in a reply');
  names.forEach((name) => assert.equal(read(`${name}.expected.json`).spec?.epistemicLedgerCapable, true, `${name} asks for the epistemic contract`));
});

test('every intents fixture is satisfiable: its golden scores a clean pass, with no vacuous claim', () => {
  for (const name of intentFixtures()) {
    const outcome = scoreIntents(read(`${name}.expected.json`).intents, goldenIntents(name), players(name));
    assert.deepEqual([name, outcome.scored, outcome.pass, outcome.vacuous], [name, true, true, undefined]);
  }
});

test('control: the goldens with a player line planted as an intent fail their fixture', () => {
  const name = intentFixtures().find((entry) => players(entry).length > 0)!;
  const planted = [...goldenIntents(name), row(players(name)[0], 'what the player wants')];
  assert.equal(scoreIntents(read(`${name}.expected.json`).intents, planted, players(name)).pass, false);
});
