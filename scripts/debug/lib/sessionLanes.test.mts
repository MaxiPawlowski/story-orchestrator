import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveLane, continuationsOf, dependencyRefusal, dependentsOf, executionOrder, lanePinVerdict, leaseFor, leaseRefusal, outstandingDependents, planDrift, planLanes, readLease, readSeedRecords, reseedRefusal, restoreLane, seedRecordOf, writeLease, judgeRatePlan, laneJudgeRate, loadedJudgeRate, runningLanes, JUDGE_ACCOUNT_RATE_PER_MIN } from './sessionLanes.mts';
import { findCard, LANE_PLAN_PATH, loadCards } from '../so-session.mts';

test('AS-29 schedule: cards run tier by tier, and a cross-tier continuation keeps its lane reserved until its tier', async () => {
  const doc = await loadCards();
  const plan = planLanes(doc);
  const order = executionOrder(doc, doc.cards).map((card) => card.tier);
  assert.deepEqual(order, [...order].sort());
  const t11 = plan.reservations.find((row) => row.holder === 'T1-1')!;
  assert.deepEqual({ until: t11.until, fromTier: t11.fromTier, untilTier: t11.untilTier }, { until: ['T2-4'], fromTier: 'T1', untilTier: 'T2' });
  assert.ok(plan.dependencies!.some((row) => row.card === 'T2-4' && row.continues === 'T1-1' && row.root === 'T1-1'));
  const lane = String(plan.assignments.find((row) => row.card === 'T1-1')!.lane);
  const t1Wave = plan.waves!.find((wave) => wave.tier === 'T1')!;
  assert.deepEqual(t1Wave.lanes[lane], ['T1-1'], 'no other T1 card takes the reserved lane');
});

test('AS-29 schedule: a continuation of a card in a LATER tier is a problem', async () => {
  const doc = JSON.parse(JSON.stringify(await loadCards()));
  const card = doc.cards.find((candidate: any) => candidate.id === 'T0-2');
  card.setup.continues = 'T7';
  card.story = doc.cards.find((candidate: any) => candidate.id === 'T7').story;
  assert.ok(planLanes(doc).problems.some((line) => line.startsWith('T0-2 (T0) continues T7 (T7), which runs in a later tier')));
});

test('AS-29 schedule: the written lane plan is the one the cards produce', async () => {
  const doc = await loadCards();
  const written = JSON.parse(await readFile(LANE_PLAN_PATH, 'utf-8'));
  assert.deepEqual(planDrift(written, planLanes(doc)), [], 'run: node scripts/debug/so-session.mts plan --write');
  assert.equal(planDrift({ ...written, assignments: written.assignments.slice(1) }, planLanes(doc)).length, 1);
});

test('AS-29 lease: a lane holding a chat with outstanding dependents refuses a reseed until they are played', async () => {
  const doc = await loadCards();
  assert.deepEqual(dependentsOf(doc, 'T2-1').map((card) => card.id), ['T2-3', 'T2-5']);
  const lease = leaseFor(doc, findCard(doc, 'T1-1'), 3, 'test/sessions/T1/T1-1-1', ['chat-a'], [], '2026-10-01T00:00:00.000Z')!;
  assert.deepEqual(lease.dependents, ['T2-4']);
  assert.match(String(leaseRefusal(lease, [], 'T3-1')), /lane 3 is leased: it holds the T1-1 chat \(chat-a\) that T2-4 still continues/);
  assert.equal(leaseRefusal(lease, [], 'T2-4'), null, 'the dependent itself may use its own lane');
  assert.match(String(leaseRefusal(lease, [{ charter: 'T2-4', lane: 3, stoppedAt: null }], 'T3-1')), /T2-4/, 'a dependent still running has not released the lease');
  assert.deepEqual(outstandingDependents(lease, [{ charter: 'T2-4', lane: 3, stoppedAt: 'x' }]), []);
  assert.equal(leaseFor(doc, findCard(doc, 'T1-1'), 3, 's', [], [{ charter: 'T2-4', lane: 3, stoppedAt: 'x' }]), null);
});

test('AS-29 lease: a continuation waits for the session it continues to be stopped', async () => {
  const doc = await loadCards();
  const card = findCard(doc, 'T2-4');
  assert.match(String(dependencyRefusal(doc, card, [{ charter: 'T1-1', lane: 3, stoppedAt: null }])), /has not been stopped/);
  assert.equal(dependencyRefusal(doc, card, [{ charter: 'T1-1', lane: 3, stoppedAt: 'x' }]), null);
});

test('AS-29 archive: a lane is archived and restored completely, lease included', async () => {
  const root = await mkdtemp(join(tmpdir(), 'so-lane-'));
  const lane = join(root, '3');
  await mkdir(join(lane, 'data', 'default-user', 'chats', 'g'), { recursive: true });
  await writeFile(join(lane, 'data', 'default-user', 'chats', 'g', 'chat-a.jsonl'), 'one\ntwo\n');
  await mkdir(join(lane, 'adolion-fresh'), { recursive: true });
  await writeFile(join(lane, 'adolion-fresh', 'inventory-latest.json'), '{"commit":"abc"}');
  const doc = await loadCards();
  const lease = leaseFor(doc, findCard(doc, 'T1-1'), 3, 's', ['chat-a'], [])!;
  await writeLease(lane, lease);
  const archive = join(root, 'archive', '3-T1-1');
  const record = await archiveLane(lane, archive, { lane: 3, lease });
  assert.equal(record.files, 3);
  await writeFile(join(lane, 'data', 'default-user', 'chats', 'g', 'chat-a.jsonl'), 'clobbered by a reseed');
  await writeFile(join(lane, 'data', 'stray.txt'), 'x');
  await writeLease(lane, null);
  const restored = await restoreLane(archive, lane);
  assert.equal(restored.files, 3);
  assert.equal(await readFile(join(lane, 'data', 'default-user', 'chats', 'g', 'chat-a.jsonl'), 'utf-8'), 'one\ntwo\n');
  assert.equal(existsSync(join(lane, 'data', 'stray.txt')), false);
  assert.deepEqual(await readLease(lane), lease);
  await assert.rejects(archiveLane(lane, archive, {}), /already exists/);
});

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

test('pin bump: a continuation of the leased chat runs at the lane\'s own pin, recorded, with its inventory checked against its seed record', async () => {
  const doc = await loadCards();
  const card = findCard(doc, 'T2-4');
  const fresh = findCard(doc, 'T1-2');
  const inventory = { commit: 'old', books: [{ name: 'Adolion' }], library: [{ id: 'adolion-saga', version: 1 }] };
  const seeds = [
    { name: 'report-2026-10-01T10-00-00-000Z.json', report: { commit: 'older', file: 'inv-a.json', problems: [] } },
    { name: 'report-2026-10-01T11-00-00-000Z.json', report: { commit: 'old', file: 'inv-b.json', problems: [] } },
    { name: 'report-2026-10-01T12-00-00-000Z.json', report: { commit: 'old', file: 'inv-c.json', problems: ['a book is missing'] } },
    { name: 'check-2026-10-01T13-00-00-000Z.json', report: { commit: 'old', file: 'inv-d.json', problems: [] } },
  ];
  const seed = seedRecordOf(seeds, 'old');
  assert.equal(seed?.name, 'report-2026-10-01T11-00-00-000Z.json', 'the newest clean seed report of the lane\'s commit; a failed seed and a check are not seed records');
  assert.equal(seedRecordOf(seeds, 'new'), null);
  const lease = { lane: 1, holder: 'T1-1', session: 'test/sessions/T1/T1-1-1', chats: ['chat-1'], dependents: ['T2-4'], writtenAt: 'x' };
  const base = { card, lane: 1, continueChat: 'chat-1', lease, laneCommit: 'old', indexCommit: 'new', seed, seedInventory: inventory, laneInventory: structuredClone(inventory) };

  const accepted = lanePinVerdict(base);
  assert.deepEqual(accepted.problems, []);
  assert.deepEqual(accepted.continuedAtPin, { lanePin: 'old', indexPin: 'new', holder: 'T1-1', session: 'test/sessions/T1/T1-1-1', chat: 'chat-1', seedRecord: 'report-2026-10-01T11-00-00-000Z.json' });
  assert.deepEqual(lanePinVerdict({ ...base, laneCommit: 'new' }), { problems: [], continuedAtPin: null }, 'same pin: nothing to record');

  const drifted = lanePinVerdict({ ...base, laneInventory: { ...inventory, books: [] } });
  assert.equal(drifted.continuedAtPin, null);
  assert.match(drifted.problems[0], /lane was seeded from old, the story index is new; the lane inventory drifted from its seed record report-2026-10-01T11-00-00-000Z\.json: \$\.books/);
  assert.match(lanePinVerdict({ ...base, seed: null, seedInventory: null }).problems[0], /no clean seed record of old/);
  assert.match(lanePinVerdict({ ...base, laneCommit: null }).problems[0], /^lane was seeded from an unknown build, the story index is new$/);

  const refusedFresh = lanePinVerdict({ ...base, card: fresh, continueChat: null });
  assert.deepEqual(refusedFresh, { problems: ['lane was seeded from old, the story index is new'], continuedAtPin: null }, 'a fresh card keeps failing closed');

  const refused = (over: Partial<typeof base>) => lanePinVerdict({ ...base, ...over }).problems[0] ?? '';
  assert.match(refused({ lease: null }), /T2-4 continues a chat, but lane 1 holds no lease/);
  assert.match(refused({ lease: { ...lease, dependents: ['T2-5'] } }), /does not list T2-4 as a dependent/);
  assert.match(refused({ lease: { ...lease, chats: ['someone-else'] } }), /does not hold the chat T2-4 continues \(chat-1\)/);
  assert.match(refused({ lease: { ...lease, lane: 2 } }), /the lease on lane 1 names lane 2/);
  assert.match(refused({ continueChat: null }), /does not hold the chat T2-4 continues \(none recorded\)/);
});

test('pin bump: seed records are read from the lane\'s adolion-fresh dir, a broken report reads as no record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-lane-seeds-'));
  await writeFile(join(dir, 'report-2026-10-01T11-00-00-000Z.json'), JSON.stringify({ commit: 'old', file: 'x.json', problems: [] }), 'utf-8');
  await writeFile(join(dir, 'report-2026-10-01T12-00-00-000Z.json'), '{broken', 'utf-8');
  await writeFile(join(dir, 'inventory-latest.json'), '{}', 'utf-8');
  const records = await readSeedRecords(dir);
  assert.equal(records.length, 2);
  assert.equal(seedRecordOf(records, 'old')?.name, 'report-2026-10-01T11-00-00-000Z.json');
  assert.deepEqual(await readSeedRecords(join(dir, 'missing')), []);
});

test('T1 judge rate: the account rate is split over the running lanes plus this one, bounded 10..60, and an explicit rate wins', async () => {
  assert.equal(JUDGE_ACCOUNT_RATE_PER_MIN, 90);
  assert.deepEqual([1, 2, 3, 4, 5, 20].map((lanes) => laneJudgeRate(lanes)), [60, 60, 60, 45, 36, 10]);
  assert.deepEqual(judgeRatePlan(3, [1, 4]), { perMinute: 60, lanes: 3, running: [1, 3, 4], account: 90, source: 'derived' });
  assert.equal(judgeRatePlan(3, [3]).perMinute, 60, 'the lane itself is counted once');
  assert.equal(judgeRatePlan(3, [1, 4], { env: { SO_JUDGE_ACCOUNT_RATE_PER_MIN: '60' } }).perMinute, 40);
  assert.deepEqual(judgeRatePlan(3, [1, 4], { requested: 15 }), { perMinute: 15, lanes: 3, running: [1, 3, 4], account: 90, source: 'arg' });
  assert.equal(judgeRatePlan(3, [1, 4], { requested: 'many' }).source, 'derived');
  const log = '[story-orchestrator-judge] loaded; key from dotenv\n[story-orchestrator-judge] loaded; key from dotenv; per user 15/min, 2 in flight (SO_JUDGE_RATE_PER_MIN, SO_JUDGE_MAX_IN_FLIGHT)\nnoise\n[story-orchestrator-judge] loaded; key from dotenv; per user 30/min, 2 in flight (SO_JUDGE_RATE_PER_MIN, SO_JUDGE_MAX_IN_FLIGHT)\n';
  assert.equal(loadedJudgeRate(log), 30, 'the last load wins');
  assert.equal(loadedJudgeRate('[story-orchestrator-judge] loaded; key from dotenv\n'), null, 'a plugin that does not log its limit is unknown, not 60');
  const root = await mkdtemp(join(tmpdir(), 'so-lanes-rate-'));
  for (const [lane, pid] of [['0', '11'], ['1', '12'], ['3', '13'], ['4', 'gone'], ['archive', '14']]) {
    await mkdir(join(root, lane), { recursive: true });
    await writeFile(join(root, lane, 'server.pid'), pid, 'utf-8');
  }
  assert.deepEqual(await runningLanes(root, (pid) => pid !== 13), [1], 'lane 0 is the user\'s, a dead pid or a non-number is not running');
});
