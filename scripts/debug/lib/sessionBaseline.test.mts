import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOverBaseline, baselineProblems, effectiveProblems, effectiveSettings, hostSwipesProblems, loadBaseline, mediaPlan, overrideChain, pathGet,
} from './sessionBaseline.mts';
import { findCard, loadCards } from '../so-session.mts';

test('AS-26: the versioned baseline loads, keeps the judge on and media off', async () => {
  const baseline = await loadBaseline();
  assert.deepEqual(baselineProblems(baseline), []);
  assert.deepEqual(baselineProblems({ ...baseline, settings: { ...baseline.settings, image: { enabled: true } } }).length, 1);
});

test('AS-26: a "defaults" card is the baseline, not whatever the copied install held', async () => {
  const [baseline, doc] = await Promise.all([loadBaseline(), loadCards()]);
  const card = findCard(doc, 'T0-1');
  const effective = effectiveSettings(baseline, overrideChain(doc, card), mediaPlan(card.setup.settings ?? {}, 'off'));
  const install = { spikes: { sp7Chance: true }, stagecraft: { curatorEnabled: false }, judge: { enabled: false, noticesSeen: ['typesafe'] }, extraction: { profileId: 'p-1', cadence: 1, routes: { read: 'x' } } };
  const written = applyOverBaseline(install, effective, baseline.installOwned);
  assert.equal(written.spikes.sp7Chance, false);
  assert.equal(written.stagecraft.curatorEnabled, true);
  assert.equal(written.judge.enabled, true);
  assert.equal(written.extraction.cadence, 3);
  assert.equal(written.extraction.profileId, 'p-1');
  assert.deepEqual(written.extraction.routes, { read: 'x' });
  assert.deepEqual(written.judge.noticesSeen, ['typesafe']);
});

test('AS-26: a continuation carries its root card\'s overrides, then its own', async () => {
  const [baseline, doc] = await Promise.all([loadBaseline(), loadCards()]);
  const chain = overrideChain(doc, findCard(doc, 'T2-3'));
  assert.deepEqual(chain.map((step) => step.card), ['T2-1', 'T2-3']);
  const effective = effectiveSettings(baseline, chain, mediaPlan({}, 'off'));
  assert.equal(pathGet(effective, 'memory.chapters.seal'), true);
});

test('AS-26: the effective settings read back after the reload are asserted, install-owned paths excepted', async () => {
  const baseline = await loadBaseline();
  const effective = effectiveSettings(baseline, [{ settings: { innerHarvest: true, judge: { director: false } } }], mediaPlan({}, 'off'));
  const actual = JSON.parse(JSON.stringify(effective));
  actual.extraction.profileId = 'whatever';
  assert.deepEqual(effectiveProblems(effective, actual, baseline.installOwned), []);
  actual.memory.harvestReasoning = undefined;
  actual.judge.uses.director = true;
  const problems = effectiveProblems(effective, actual, baseline.installOwned);
  assert.ok(problems.some((line) => line.startsWith('setting memory.harvestReasoning')), problems.join('\n'));
  assert.ok(problems.some((line) => line.startsWith('setting judge.uses.director')), problems.join('\n'));
  const off = effectiveSettings(baseline, [{ settings: { innerHarvest: false } }], mediaPlan({}, 'off'));
  const sanitized = JSON.parse(JSON.stringify(off));
  delete sanitized.memory.harvestReasoning;
  assert.deepEqual(effectiveProblems(off, sanitized, baseline.installOwned), [], 'the runtime drops a false inner-voice flag; absent means off');
});

test('AS-27: the no-media variant switches images off, keeps pre-rendered sprites, and names what went unexercised', () => {
  assert.deepEqual(mediaPlan({ images: true, sprites: true }, 'off'), { variant: 'no-media', images: false, sprites: false, unexercised: ['images', 'sprites'], prerenderedSprites: 0 });
  assert.deepEqual(mediaPlan({ images: true, sprites: true }, 'off', 12), { variant: 'no-media', images: false, sprites: true, unexercised: ['images'], prerenderedSprites: 12 });
  assert.deepEqual(mediaPlan({ images: true, sprites: true }, 'on'), { variant: 'full', images: true, sprites: true, unexercised: [], prerenderedSprites: 0 });
  assert.deepEqual(mediaPlan({}, 'off').variant, 'full');
});

test('T0-3: start refuses a lane whose SillyTavern swipes did not read back on', () => {
  assert.deepEqual(hostSwipesProblems({ swipes: true }), []);
  assert.match(hostSwipesProblems({ swipes: false })[0], /swipes read back false on the lane, expected true/);
  assert.match(hostSwipesProblems({ swipes: null })[0], /read back null/, 'an unreadable checkbox is not a pass');
  assert.equal(hostSwipesProblems(undefined).length, 1);
});
