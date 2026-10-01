import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationsOf, planLanes, reseedRefusal } from './sessionLanes.mts';
import { loadCards } from '../so-session.mts';

const CONTINUATIONS = ['T0-2', 'T2-3', 'T2-4', 'T2-5', 'T3-2', 'T5-3', 'T5-4'];

test('lane plan: every continuation runs on the lane of the card it continues, unseeded', async () => {
  const doc = await loadCards();
  const plan = planLanes(doc);
  assert.deepEqual(plan.problems, []);
  const laneOf = new Map(plan.assignments.map((row) => [row.card, row]));
  assert.deepEqual(doc.cards.filter((card) => card.setup.chat === 'continue').map((card) => card.id), CONTINUATIONS);
  for (const id of CONTINUATIONS) {
    const card = doc.cards.find((candidate) => candidate.id === id)!;
    const row = laneOf.get(id)!;
    assert.equal(row.lane, laneOf.get(card.setup.continues!)!.lane, `${id} is not on ${card.setup.continues}'s lane`);
    assert.equal(row.seed, false, `${id} must not seed its lane`);
  }
  assert.equal(plan.assignments.length, doc.cards.length);
  assert.ok(plan.assignments.every((row) => [1, 2, 3, 4].includes(row.lane)));
});

test('lane plan: no fresh card seeds a lane between a chat and the card that continues it', async () => {
  const doc = await loadCards();
  const plan = planLanes(doc);
  for (const reservation of plan.reservations) {
    const queue = plan.queues[String(reservation.lane)];
    const from = queue.indexOf(reservation.holder);
    const until = Math.max(...reservation.until.map((id) => queue.indexOf(id)));
    const between = queue.slice(from + 1, until).filter((id) => plan.assignments.find((row) => row.card === id)!.seed);
    assert.deepEqual(between, [], `lane ${reservation.lane} re-seeds while ${reservation.holder} waits for ${reservation.until.join(', ')}`);
  }
  assert.deepEqual(plan.reservations.map((row) => row.holder).sort(), ['T0-1', 'T1-1', 'T2-1', 'T3-1', 'T5-1']);
});

test('lane plan: a fresh card with every lane reserved is a problem, not a silent re-seed', async () => {
  const doc = await loadCards();
  const plan = planLanes(doc, [1], ['T1-1', 'T1-2', 'T2-4']);
  assert.equal(plan.assignments.find((row) => row.card === 'T2-4')?.lane, 1);
  assert.ok(plan.problems.some((problem) => problem.startsWith('T1-2: every lane holds a chat a later card continues')), plan.problems.join('\n'));
});

test('lane plan: a continuation whose predecessor is not planned is named', async () => {
  const doc = await loadCards();
  assert.ok(planLanes(doc, [1, 2], ['T0-2']).problems.some((problem) => problem.includes('T0-2 continues T0-1, which is not in this plan')));
});

test('reseed guard: a lane holding a chat a later card continues is never re-seeded', async () => {
  const doc = await loadCards();
  const refusal = reseedRefusal(doc, 2, [{ charter: 'T2-1', lane: 2 }], 'T2-2');
  assert.match(String(refusal), /lane 2 holds the T2-1 chat that T2-3 and T2-5 continue/);
  assert.equal(reseedRefusal(doc, 2, [{ charter: 'T2-1', lane: 2 }, { charter: 'T2-3', lane: 2 }, { charter: 'T2-5', lane: 2 }], 'T2-2'), null);
  assert.equal(reseedRefusal(doc, 3, [{ charter: 'T2-1', lane: 2 }], 'T2-2'), null);
  assert.deepEqual(continuationsOf(doc, 'T5-1').map((card) => card.id), ['T5-3', 'T5-4']);
});
