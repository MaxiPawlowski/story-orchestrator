import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import {
  comfyRefusal, coverageProblems, JUDGE_USES, nextSessionNumber, renderCardsDocument, rubricProblems, rubricSummary, rubricTemplate, settingsPatch, UNEXERCISED, validateCardDoc, type CardDoc,
} from './sessionCharters.mts';
import { CARDS_DOC_PATH, findCard, loadCards, loadIndex, pinProblems, planStart, repinCharters, startProblems } from '../so-session.mts';

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

test('T1-5 charters: setup.members names only the story roster, and only on a card that starts past the story start', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const t15 = findCard(doc, 'T1-5');
  assert.deepEqual(t15?.setup.members, { enabled: ['Kayla', 'Erevan'] });
  const broken = clone(doc);
  const card = broken.cards.find((entry) => entry.id === 'T1-5')!;
  card.setup.members = { enabled: ['Kayla', 'Nobody'] };
  const fresh = broken.cards.find((entry) => entry.id === 'T1-4')!;
  fresh.setup.members = { enabled: ['Belle'] };
  delete fresh.setup.startAt;
  const problems = validateCardDoc(broken, index);
  assert.ok(problems.some((problem) => problem.includes('setup.members "Nobody" is not on its story\'s roster')), problems.join('; '));
  assert.ok(problems.some((problem) => problem.includes('T1-4') && problem.includes('setup.members is for a card that starts past')), problems.join('; '));
  const planned = planStart(doc, index, t15!, { lane: 5, allowComfy: false, seed: true }, null) as any;
  assert.deepEqual(planned.plan?.open?.members ?? planned.open?.members, { enabled: ['Kayla', 'Erevan'] });
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

test('plan 14 start: the full media variant needs --allow-comfy, before any lane is touched', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const card = clone(doc).cards.find((candidate) => candidate.id === 'T0-1')!;
  card.setup.settings = { ...card.setup.settings, images: true, sprites: true };
  const refused = planStart(doc, index, card, { lane: 4, allowComfy: false, seed: true, media: 'on' }, null);
  assert.ok(refused.refused && /127\.0\.0\.1:8188/.test(refused.refused) && /--allow-comfy/.test(refused.refused));
  const allowed = planStart(doc, index, card, { lane: 4, allowComfy: true, seed: true, media: 'on' }, null);
  assert.equal(allowed.refused, null);
  assert.equal((allowed as any).patch.image.enabled, true);
  assert.equal(comfyRefusal(findCard(doc, 'T0-1'), false), null);
});

test('AS-27 start: without --media the card runs as the recorded no-media variant, which needs no ComfyUI', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const card = clone(doc).cards.find((candidate) => candidate.id === 'T0-1')!;
  card.setup.settings = { ...card.setup.settings, images: true, sprites: true };
  const plan = planStart(doc, index, card, { lane: 4, allowComfy: false, seed: true }, null) as any;
  assert.equal(plan.refused, null);
  assert.equal(plan.media, 'off');
  const t31 = findCard(doc, 'T3-1');
  assert.deepEqual(t31.rubric.filter((row) => row.media).map((row) => row.media), ['images', 'sprites']);
  const rubric = rubricTemplate(t31, {}, ['images', 'sprites']);
  const media = rubric.rows.filter((row: any) => row.media);
  assert.ok(media.every((row: any) => row.status === UNEXERCISED));
  assert.equal(rubricProblems(rubric).filter((line) => /scene images|sprites/.test(line)).length, 0, 'an unexercised row is not an open row');
  media[0].score = 'works';
  assert.ok(rubricProblems(rubric).some((line) => line.includes('may carry no score')));
  rubric.rows.forEach((row: any) => { if (row.status !== UNEXERCISED) { row.score = row.reviewer ? null : 'works'; row.note = 'seen'; row.evidence = ['x']; row.scoredBy = 'claude'; } });
  media[0].score = null;
  const summary = rubricSummary(rubric);
  assert.equal(summary.unexercised, 2);
  assert.equal(summary.green, rubric.rows.filter((row: any) => !row.reviewer && !row.media).length, 'unexercised rows never count green');
});

test('AS-22 start: lane, settings, pin, page, recap, header and tail discrepancies are all blocking', () => {
  const clean = { laneCommit: 'abc', indexCommit: 'abc', effective: [], pin: { ok: true, problems: [] }, page: [], age: null, ageAsked: false, header: { code: 0, output: '' }, tails: [] };
  assert.deepEqual(startProblems(clean), []);
  assert.equal(startProblems({ ...clean, laneCommit: 'old' }).length, 1);
  assert.equal(startProblems({ ...clean, pin: { ok: false, problems: ['main profile is "none"'] } }).length, 1);
  assert.equal(startProblems({ ...clean, page: ['story adolion-saga did not load'] }).length, 1);
  assert.equal(startProblems({ ...clean, ageAsked: true, age: { fired: false } }).length, 1);
  assert.equal(startProblems({ ...clean, header: { code: 1, output: 'boom' } }).length, 1);
  assert.equal(startProblems({ ...clean, tails: ['the journal tail never acknowledged'] }).length, 1);
  assert.equal(startProblems({ ...clean, effective: ['setting judge.enabled is false after the reload, expected true'] }).length, 1);
});

test('AS-11 start: a card is refused when its pinned story lacks the data it exercises, and validate names every such card', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const card = findCard(doc, 'T2-1');
  const refused = planStart(doc, index, card, { lane: 1, allowComfy: false, seed: true }, null);
  if (index.stories['adolion-saga'].features?.chapters) assert.equal(refused.refused, null);
  else assert.match(String(refused.refused), /lacks the data the card exercises[\s\S]*has no chapters/);
});

test('AS-25/27/28 cards: media rows need the card to ask for the medium, blind gates are the user\'s, requires is closed', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const broken = clone(doc);
  const t11 = broken.cards.find((candidate) => candidate.id === 'T1-1')!;
  t11.rubric.push({ feature: 'images', media: 'images' }, { feature: 'pack', gate: 'C3' }, { feature: 'pack2', reviewer: 'user', gate: 'X9' as never });
  t11.requires = { features: ['wings' as never], artifacts: { turns: 0, nonsense: 2 } as never };
  const problems = validateCardDoc(broken, index);
  for (const needle of ['a images row needs the card to ask for images', 'blind gate C3 is the user\'s verdict', 'gate must be C3|R4|Q-M|W6', 'unknown feature "wings"', 'requires.artifacts.turns must be a positive integer', 'unknown artifact "nonsense"']) {
    assert.ok(problems.some((problem) => problem.includes(needle)), `missing "${needle}" in:\n${problems.join('\n')}`);
  }
  const gated = doc.cards.flatMap((card) => card.rubric.filter((row) => row.gate).map((row) => `${card.id}:${row.gate}`));
  assert.deepEqual(gated, ['T2-1:Q-M', 'T3-1:C3', 'T5-1:W6', 'T6-1:R4']);
  assert.equal(findCard(doc, 'T4-1').story.id, 'adolion-saga', 'chapter rollback runs on a genuinely chaptered story');
  assert.equal(findCard(doc, 'T2-3').setup.settings?.chapters?.fold, true, 'a fold arm exists');
});

test('AS-11 index: charters.json is repinned by rewriting its pin field only', () => {
  const text = '{\n  "version": 1,\n  "pin": "aaa111",\n  "cards": []\n}\n';
  assert.equal(repinCharters(text, 'bbb222'), '{\n  "version": 1,\n  "pin": "bbb222",\n  "cards": []\n}\n');
  assert.equal(repinCharters(text, 'aaa111'), text);
  assert.throws(() => repinCharters('{}', 'x'), /no "pin" field/);
});

test('AS-11 validate: the index, the charters and the adolion-fresh pin must agree', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  assert.deepEqual(pinProblems(index.commit, index, doc), []);
  assert.equal(pinProblems('feedface', index, doc).length, 2);
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
  const patch = settingsPatch({ judge: 'off', inlineLevel: 2, innerHarvest: true, innerBeat: true, chapters: { seal: true }, curator: { enabled: true, acceptMode: 'review' } });
  assert.equal(patch.judge.enabled, false);
  assert.ok(Object.values(patch.judge.uses).every((on) => on === false));
  assert.equal(Object.keys(patch.judge.uses).length, JUDGE_USES.length);
  assert.deepEqual(patch.display, { inline: { level: 2 } });
  assert.deepEqual(patch.memory, { harvestReasoning: true, innerBeat: true, chapters: { seal: true } });
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
  assert.equal(rubricProblems(rubric).length, card.rubric.length * 3, 'a score without a note, evidence and a scorer is not a score');
  rubric.rows.forEach((row) => { row.note = 'seen'; row.evidence = ['turns.jsonl:1']; row.scoredBy = 'claude'; });
  assert.deepEqual(rubricProblems(rubric), []);
});

test('plan 14 sessions: numbering continues after the highest existing run', () => {
  assert.equal(nextSessionNumber([], 'T1-2'), 1);
  assert.equal(nextSessionNumber(['T1-2-1', 'T1-2-3', 'T1-20-9', 'T1-2-x'], 'T1-2'), 4);
});
