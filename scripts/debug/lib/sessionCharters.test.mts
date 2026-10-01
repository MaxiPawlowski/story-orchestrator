import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import {
  comfyRefusal, coverageProblems, JUDGE_USES, nextSessionNumber, renderCardsDocument, rubricProblems, rubricTemplate, settingsPatch, validateCardDoc, type CardDoc,
} from './sessionCharters.mts';
import { CARDS_DOC_PATH, findCard, loadCards, loadIndex, planStart } from '../so-session.mts';

const PLAN_TIER_COUNTS = { T0: 3, T1: 7, T2: 6, T3: 6, T4: 4, T5: 5, T6: 4, T7: 1 };
const clone = (doc: CardDoc): CardDoc => JSON.parse(JSON.stringify(doc));

test('plan 14 charters: every card validates against the pinned story index', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  assert.deepEqual(validateCardDoc(doc, index), []);
  assert.equal(doc.cards.length, 36);
});

test('plan 14 charters: the index is the adolion-fresh pin, and every story and tier is covered as plan 14 counts them', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const pin = JSON.parse(readFileSync(resolve(REPO_ROOT, 'scripts', 'debug', 'adolion-fresh.pin.json'), 'utf-8'));
  assert.equal(index.commit, pin.commit);
  assert.equal(Object.keys(index.stories).length, 9);
  assert.deepEqual(coverageProblems(doc, index, PLAN_TIER_COUNTS), []);
});

test('plan 14 charters: an unknown story id is refused', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const broken = clone(doc);
  broken.cards[0].story.id = 'adolion-nowhere';
  assert.ok(validateCardDoc(broken, index).some((problem) => problem.includes('"adolion-nowhere" is not in the pinned Adolion build')));
});

test('plan 14 charters: a drive beat aiming at a checkpoint its story lacks is refused', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const broken = clone(doc);
  const card = broken.cards.find((candidate) => candidate.id === 'T1-2')!;
  card.drive[1].aim = ['guild-hal'];
  const problems = validateCardDoc(broken, index);
  assert.ok(problems.some((problem) => problem.startsWith('T1-2 drive[1]: checkpoint "guild-hal"')), problems.join('\n'));
});

test('plan 14 charters: a card without a mustNotHappen item is refused, and so are other structural gaps', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const broken = clone(doc);
  broken.cards[1].mustNotHappen = [];
  broken.cards[2].lookFor[0].where = 'somewhere';
  broken.cards[3].setup.startAt = 'nowhere';
  broken.cards[4].setup.settings = { judge: { notAUse: true } } as never;
  broken.cards[5].drive[0].lines = [];
  broken.cards[6].setup.settings = { inlineLevel: 4 };
  const problems = validateCardDoc(broken, index);
  for (const needle of ['T0-2: mustNotHappen needs at least one item', 'T0-3 lookFor[0]: where must be one of', 'T1-1: setup.startAt "nowhere"', 'T1-2: unknown judge use "notAUse"', 'T1-3 drive[0]: 1-2 sample lines', 'T1-4: inlineLevel 4 needs author mode']) {
    assert.ok(problems.some((problem) => problem.startsWith(needle)), `missing "${needle}" in:\n${problems.join('\n')}`);
  }
});

test('plan 14 charters: a continuation must name an earlier card of the same story', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const broken = clone(doc);
  const card = broken.cards.find((candidate) => candidate.id === 'T2-4')!;
  card.setup.continues = 'T2-2';
  assert.ok(validateCardDoc(broken, index).some((problem) => problem.includes('continues T2-2, which plays another story')));
  card.setup.continues = 'T7';
  assert.ok(validateCardDoc(broken, index).some((problem) => problem.includes('must name an earlier card')));
});

test('plan 14 cards: docs/plans/v2.6/14-cards.md is in sync with charters.json', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const onDisk = readFileSync(CARDS_DOC_PATH, 'utf-8').replace(/\r\n/g, '\n');
  assert.equal(onDisk, renderCardsDocument(doc, index), 'run: node scripts/debug/so-session.mts cards --write');
});

test('plan 14 start: a card that needs images or sprites is refused without --allow-comfy, before any lane is touched', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const card = findCard(doc, 'T3-1');
  const refused = planStart(doc, index, card, { lane: 4, allowComfy: false, seed: true }, null);
  assert.ok(refused.refused && /127\.0\.0\.1:8188/.test(refused.refused) && /--allow-comfy/.test(refused.refused));
  const allowed = planStart(doc, index, card, { lane: 4, allowComfy: true, seed: true }, null);
  assert.equal(allowed.refused, null);
  assert.equal((allowed as any).patch.image.enabled, true);
  assert.equal(comfyRefusal(findCard(doc, 'T0-1'), false), null);
});

test('plan 14 start: every card that does not ask for media switches images and sprites off explicitly', async () => {
  const doc = await loadCards();
  for (const card of doc.cards.filter((candidate) => !candidate.setup.settings?.images && !candidate.setup.settings?.sprites)) {
    const patch = settingsPatch(card.setup.settings);
    assert.equal(patch.image.enabled, false, card.id);
    assert.deepEqual(patch.sprites, { enabled: false, explicit: true }, card.id);
  }
});

test('plan 14 start: settings map onto the global settings the runtime reads', () => {
  const patch = settingsPatch({ judge: 'off', inlineLevel: 2, innerVoice: true, chapters: { seal: true }, curator: { enabled: true, acceptMode: 'review' } });
  assert.equal(patch.judge.enabled, false);
  assert.ok(Object.values(patch.judge.uses).every((on) => on === false));
  assert.equal(Object.keys(patch.judge.uses).length, JUDGE_USES.length);
  assert.deepEqual(patch.display, { inline: { level: 2 } });
  assert.deepEqual(patch.memory, { innerBeat: true, chapters: { seal: true } });
  assert.deepEqual(patch.stagecraft, { curatorEnabled: true, acceptMode: 'review' });
});

test('plan 14 start: the judge use list matches src/judge/settings.ts', () => {
  const source = readFileSync(resolve(REPO_ROOT, 'src', 'judge', 'settings.ts'), 'utf-8');
  const block = /JUDGE_USE_KEYS = \[([\s\S]*?)\] as const/.exec(source)![1];
  assert.deepEqual([...block.matchAll(/"([a-zA-Z]+)"/g)].map((match) => match[1]), [...JUDGE_USES]);
});

test('plan 14 start: a continuation reuses the previous lane and chat, and refuses without a previous session', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const card = findCard(doc, 'T0-2');
  assert.match(String(planStart(doc, index, card, { lane: null, allowComfy: false, seed: true }, null).refused), /no T0-1 session exists/);
  const previous = { session: { lane: 5, chats: [{ chatId: 'chat-a', primary: true }] } };
  const plan = planStart(doc, index, card, { lane: null, allowComfy: false, seed: true }, previous) as any;
  assert.equal(plan.lane, 5);
  assert.equal(plan.seed, false);
  assert.equal(plan.open.continueChat, 'chat-a');
  assert.match(String(planStart(doc, index, card, { lane: 6, allowComfy: false, seed: true }, previous).refused), /lane 5/);
  assert.match(String(planStart(doc, index, findCard(doc, 'T0-1'), { lane: 0, allowComfy: false, seed: true }, null).refused), /lane 0 is the user's/);
});

test('plan 14 stop: the rubric template has one unscored row per card rubric row', async () => {
  const card = findCard(await loadCards(), 'T1-2');
  const rubric = rubricTemplate(card);
  assert.deepEqual(rubric.rows.map((row) => row.feature), card.rubric.map((row) => row.feature));
  assert.deepEqual(rubric.scores, ['works', 'annoying', 'broken', 'not-noticed']);
  assert.equal(rubricProblems(rubric).length, card.rubric.length);
  rubric.rows.forEach((row) => { row.score = 'works'; });
  assert.deepEqual(rubricProblems(rubric), []);
});

test('plan 14 sessions: numbering continues after the highest existing run', () => {
  assert.equal(nextSessionNumber([], 'T1-2'), 1);
  assert.equal(nextSessionNumber(['T1-2-1', 'T1-2-3', 'T1-20-9', 'T1-2-x'], 'T1-2'), 4);
});
