import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardCommands, CARD_STEPS, renderRunbook } from './sessionRunbook.mts';
import { planLanes } from './sessionLanes.mts';
import { findCard, LANE_PLAN_PATH, loadCards, RUNBOOK_PATH } from '../so-session.mts';

test('lane plan file: test/sessions/lane-plan.json is the plan the cards produce today', async () => {
  const doc = await loadCards();
  const { writtenAt: _writtenAt, ...committed } = JSON.parse(readFileSync(LANE_PLAN_PATH, 'utf-8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(planLanes(doc))), 'run: node scripts/debug/so-session.mts plan --write');
});

test('runbook: docs/plans/v2.6/14-autonomous-runbook.md is in sync with the cards and the lane plan', async () => {
  const doc = await loadCards();
  const plan = JSON.parse(readFileSync(LANE_PLAN_PATH, 'utf-8'));
  assert.equal(readFileSync(RUNBOOK_PATH, 'utf-8').replace(/\r\n/g, '\n'), renderRunbook(doc, plan), 'run: node scripts/debug/so-session.mts runbook --write');
});

test('runbook: every card starts on its planned lane, stops, digests and scores every rubric row', async () => {
  const doc = await loadCards();
  const plan = planLanes(doc);
  for (const card of doc.cards) {
    const lane = plan.assignments.find((row) => row.card === card.id)!.lane;
    const lines = cardCommands(card, lane);
    assert.ok(lines.some((line) => line.includes(`so-session.mts start ${card.id} --lane ${lane}`)), card.id);
    assert.ok(lines.some((line) => line.includes('so-session.mts stop ')), card.id);
    assert.ok(lines.some((line) => line.includes('so-session.mts digest ')), card.id);
    assert.equal(lines.filter((line) => line.includes('so-session.mts score ')).length, card.rubric.filter((row) => !row.media).length, card.id);
    assert.equal(lines.filter((line) => /unexercised in the no-media variant/.test(line)).length, card.rubric.filter((row) => row.media).length, card.id);
  }
  for (const id of Object.keys(CARD_STEPS)) findCard(doc, id);
});

test('runbook: the cards that need them carry the mutation verbs, the age and the adopt', async () => {
  const doc = await loadCards();
  const text = (id: string) => cardCommands(findCard(doc, id), 1).join('\n');
  assert.match(text('T0-2'), /start T0-2 --lane 1 --age 24/);
  assert.match(text('T2-4'), /--age 24/);
  for (const verb of ['swipe-new', 'edit', 'regen', 'delete last']) assert.ok(text('T0-3').includes(` ${verb.split(' ')[0]} `), `T0-3 lacks ${verb}`);
  assert.match(text('T4-2'), /switch-chat-mid-gen .* --to /);
  assert.match(text('T4-2'), /reload-mid-gen /);
  assert.doesNotMatch(text('T4-2'), /turn test\/sessions\/T4\/T4-2-1 "We take Wendhope as the Loose Ends\."/, 'the switch replaces the plain turn');
  assert.match(text('T5-1'), /adopt test\/sessions\/T5\/T5-1-1/);
  assert.match(text('T6-1'), /# WAITS: plan 05 R3[\s\S]*--force-waiting/);
  assert.match(text('T2-1'), /score test\/sessions\/T2\/T2-1-1 5 --record/);
  assert.match(text('T5-1'), /start T5-1 --lane 1 --arm agent/);
  assert.match(text('T3-1'), /# blind gate C3: tag each paired reply with --arm/);
  assert.doesNotMatch(text('T3-1'), /score \S+ 5 </, 'the no-media variant takes no score for scene images');
});
