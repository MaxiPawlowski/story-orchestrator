import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkFreeze, loadPromiseKit, p1Reply, p2Reply, offlineSeed, P47_DIR, P47_FILES, paraphraseOf, readJson, replayP1, replayP2, type Story,
} from './lib/promiseRun.mts';
import {
  checkP1Set, checkP2Set, P47_FLOORS, RECORDS_FORMAT, scoreP1, scoreP2, scoreP6, scoreP8,
  type CaseRecord, type P1Case, type P1Set, type P2Case, type P2Set, type ReadRow, type Records,
} from './lib/promiseScore.mts';
import { directorInput, directorRate, directorRun, directorScore, guardFields, parseRater, proposalFields, type P6Set } from './lib/promiseDirector.mts';
import { main } from './so-promises.mts';

const story = await readJson<Story>(join(P47_DIR, 'story.json'));
const p1 = await readJson<P1Set>(join(P47_DIR, 'p1-cases.json'));
const p2 = await readJson<P2Set>(join(P47_DIR, 'p2-cases.json'));
const p6 = await readJson<P6Set>(join(P47_DIR, 'p6-director.json'));

const quiet = async <T,>(run: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
};

const chat = (...lines: Array<[string, string, boolean?]>) => lines.map(([speaker, text, user]) => ({ speaker, text, user: user === true }));

const P1_TINY: P1Set = {
  format: 'so-p47-p1/1', synthetic: true, player: 'Rowan', story: 'story.json',
  cases: [
    { id: 'pos', category: 'plain', label: 'promise', chat: chat(['Mira', 'Help.'], ['Rowan', 'Mira, I promise I will help you.', true]), gold: [{ promisee: 'mira', messageId: 1, quote: 'I promise I will help you' }] },
    { id: 'npc', category: 'npc-promise', label: 'none', chat: chat(['Mira', 'I promise I will help you, Rowan.'], ['Rowan', 'Thanks.', true]), gold: [], bait: [{ target: 'Mira', messageId: 0, quote: 'I promise I will help you' }] },
  ],
};

const row = (patch: Partial<ReadRow>): ReadRow => ({ id: 'r', key: null, promisee: 'mira', messageId: 1, isUser: true, quote: 'I promise I will help you', span: [6, 31], conditional: false, ...patch });

const records = (set: 'p1' | 'p2', cases: CaseRecord[]): Records => ({ format: RECORDS_FORMAT, set, arm: 'fake', plumbing: null, synthetic: true, cases });

const read = (patch: Partial<NonNullable<CaseRecord['read']>> = {}) => ({ rows: [], events: [], lines: [], ...patch });

test('p47 sets: frozen, every category of the floor present, counts at or above the floors', async () => {
  assert.deepEqual(await checkFreeze(), []);
  assert.deepEqual(checkP1Set(p1), []);
  assert.deepEqual(checkP2Set(p2), []);
  const promises = p1.cases.reduce((sum, entry) => sum + entry.gold.length, 0);
  assert.ok(promises >= P47_FLOORS.p1MinPromises && p1.cases.filter((entry) => entry.label === 'none').length >= P47_FLOORS.p1MinNonPromises);
  const negatives = new Set(p1.cases.filter((entry) => entry.label === 'none').map((entry) => entry.category));
  for (const category of ['hedge', 'refusal', 'double-negative', 'npc-promise', 'quoting', 'sarcasm', 'conditional', 'casual-future']) assert.ok(negatives.has(category), category);
  assert.ok(p1.cases.some((entry) => entry.category === 'multiple-recipients' && entry.gold.length === 2));
  const kinds = new Set(p2.cases.map((entry) => entry.event?.kind).filter(Boolean));
  assert.deepEqual([...kinds].sort(), ['broken', 'kept', 'released', 'renegotiated']);
  assert.equal(p6.cases.length, 20);
  assert.ok(!JSON.stringify([p1, p2, p6]).toLowerCase().includes('adolion'));
});

test('p47 freeze: an edited set file is refused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'p47-freeze-'));
  for (const file of [...P47_FILES, 'freeze.json']) await cp(join(P47_DIR, file), join(dir, file));
  assert.deepEqual(await checkFreeze(dir), []);
  const text = await readFile(join(dir, 'p1-cases.json'), 'utf-8');
  await writeFile(join(dir, 'p1-cases.json'), text.replace('"label": "promise"', '"label": "none"'), 'utf-8');
  assert.match((await checkFreeze(dir))[0], /^p1-cases\.json: sha256/);
  await writeFile(join(dir, 'p1-cases.json'), text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf-8');
  assert.deepEqual(await checkFreeze(dir), []);
});

test('p47 set checks: a planted bad label is named', () => {
  const broken: P1Set = { ...P1_TINY, cases: [{ ...P1_TINY.cases[0], gold: [{ promisee: 'mira', messageId: 1, quote: 'I promised to help' }] }, { ...P1_TINY.cases[1], gold: [{ promisee: 'mira', messageId: 0, quote: 'I promise I will help you' }] }] };
  const problems = checkP1Set(broken);
  assert.ok(problems.some((problem) => problem.includes('pos: gold quote is not byte-exact')));
  assert.ok(problems.some((problem) => problem.includes('npc: non-promise with gold')));
  assert.ok(problems.some((problem) => problem.includes('labelled promises')));
  const p2Broken: P2Set = { ...p2, cases: [{ ...p2.cases[0], event: { ...(p2.cases[0].event as NonNullable<P2Case['event']>), key: 'z' } }] };
  assert.ok(checkP2Set(p2Broken).some((problem) => problem.includes('unknown key z')));
});

test('p47 P1 scorer: perfect fake passes with unrounded counts', () => {
  const score = scoreP1(P1_TINY, records('p1', [
    { id: 'pos', read: read({ rows: [row({})], lines: [{ raw: 'x', kind: 'promised', target: 'Mira', messageId: 1, quote: 'I promise I will help you', outcome: 'accepted' }] }) },
    { id: 'npc', read: read() },
  ]));
  assert.equal(score.verdict, 'pass');
  assert.deepEqual(score.precision, { hits: 1, of: 1, rate: 1 });
  assert.deepEqual(score.recall, { hits: 1, of: 1, rate: 1 });
});

test('p47 P1 scorer planted failures: NPC promise attributed, wrong promisee, missed, paraphrase accepted, inexact row', () => {
  const score = scoreP1(P1_TINY, records('p1', [
    { id: 'pos', read: read({
      rows: [row({ promisee: 'tobin' }), row({ id: 'q', quote: 'I will help you, I promise', span: [6, 31] })],
      lines: [{ raw: 'x', kind: 'promised', target: 'Mira', messageId: 1, quote: 'I will help you, I promise', outcome: 'accepted' }],
    }) },
    { id: 'npc', read: read({ rows: [row({ messageId: 0, isUser: false, span: [0, 25] })] }) },
  ]));
  assert.equal(score.verdict, 'fail');
  assert.equal(score.wrongPromisee, 1);
  assert.equal(score.npcAttributed, 1);
  assert.deepEqual(score.recall, { hits: 1, of: 1, rate: 1 });
  assert.deepEqual(score.precision, { hits: 1, of: 3, rate: 1 / 3 });
  assert.deepEqual(score.p1sExact, { hits: 1, of: 3, rate: 1 / 3 });
  assert.deepEqual(score.p1sParaphraseRefused, { hits: 0, of: 1, rate: 0 });
  assert.equal(score.floors.npcAttributed, false);
  assert.equal(score.floors.wrongPromisee, false);
});

test('p47 P1 scorer: a conditional row is stored, not counted as a promise; a missing case is incomplete', () => {
  const conditional = scoreP1(P1_TINY, records('p1', [{ id: 'pos', read: read({ rows: [row({ conditional: true })] }) }, { id: 'npc', read: read() }]));
  assert.equal(conditional.counts.conditionalStored, 1);
  assert.deepEqual(conditional.recall, { hits: 0, of: 1, rate: 0 });
  assert.equal(scoreP1(P1_TINY, records('p1', [{ id: 'pos', error: 'boom' }])).verdict, 'incomplete');
});

const P2_CASE = p2.cases.find((entry) => entry.event && entry.seed.length === 2) as P2Case;
const P2_CONTROL = p2.cases.find((entry) => !entry.event) as P2Case;
const P2_TINY: P2Set = { ...p2, cases: [P2_CASE, P2_CONTROL] };
const event = (key: string, kind: string) => ({ rowId: `id-${key}`, key, kind, messageId: 4, quote: 'x' });

test('p47 P2 scorer: agreement, P2w on a wrong id and on a control, kind mismatch', () => {
  const label = P2_CASE.event as NonNullable<P2Case['event']>;
  const other = P2_CASE.seed.find((seed) => seed.key !== label.key)?.key as string;
  const good = scoreP2(P2_TINY, records('p2', [{ id: P2_CASE.id, read: read({ events: [event(label.key, label.kind)] }) }, { id: P2_CONTROL.id, read: read() }]));
  assert.deepEqual(good.agreement, { hits: 1, of: 1, rate: 1 });
  assert.equal(good.p2w.total, 0);
  assert.equal(good.floors.events, false);
  assert.equal(good.verdict, 'fail');
  const bad = scoreP2(P2_TINY, records('p2', [
    { id: P2_CASE.id, read: read({ events: [event(other, label.kind), event(label.key, label.kind === 'kept' ? 'broken' : 'kept')] }) },
    { id: P2_CONTROL.id, read: read({ events: [event('a', 'kept')] }) },
  ]));
  assert.deepEqual(bad.agreement, { hits: 0, of: 1, rate: 0 });
  assert.deepEqual(bad.p2w, { total: 2, onEventCases: 1, onControls: 1 });
  assert.equal(bad.counts.kindMismatch, 1);
  assert.equal(bad.floors.p2w, false);
  assert.equal(scoreP2(P2_TINY, records('p2', [{ id: P2_CASE.id, read: read({ seedRefused: [{ key: 'a', reason: 'x' }] }) }, { id: P2_CONTROL.id, read: read() }])).verdict, 'incomplete');
});

test('p47 P8 scorer: increase over the summed windows, worst window, planted overrun fails', () => {
  const ok = scoreP8([{ id: 'a', on: 1040, off: 1000 }, { id: 'b', on: 2050, off: 2000 }]);
  assert.equal(ok.increase, 3090 / 3000 - 1);
  assert.equal(ok.pass, true);
  assert.equal(ok.worst?.id, 'a');
  assert.equal(scoreP8([{ id: 'a', on: 1200, off: 1000 }]).pass, false);
  assert.equal(scoreP8([]).pass, null);
});

test('p47 P6 scorer: guard or rater hit fails, unrated is incomplete', () => {
  const fields = { name: 'n', objective: 'o', rubrics: [], chapterTitle: null };
  const clean = Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, fields, guard: [], rater: { narrates: false, kind: 'none' } }));
  assert.equal(scoreP6(clean).verdict, 'pass');
  assert.equal(scoreP6([...clean.slice(1), { id: 'g', fields, guard: ['objective'], rater: { narrates: false, kind: 'none' } }]).verdict, 'fail');
  const rated = scoreP6([...clean.slice(1), { id: 'r', fields, guard: [], rater: { narrates: true, kind: 'keeping' } }]);
  assert.deepEqual([rated.verdict, rated.raterHits], ['fail', ['r']]);
  assert.equal(scoreP6([...clean.slice(1), { id: 'u', fields, guard: [] }]).verdict, 'incomplete');
  assert.equal(scoreP6(clean.slice(1)).verdict, 'incomplete');
});

test('p47 acceptor replay: gold passes every floor, greedy exposes the acceptor false positives, paraphrases are all refused', async () => {
  const kit = await loadPromiseKit();
  const gold = scoreP1(p1, replayP1(kit, story, p1, 'gold'));
  assert.equal(gold.verdict, 'pass');
  assert.deepEqual(gold.recall, { hits: 66, of: 66, rate: 1 });
  const greedy = scoreP1(p1, replayP1(kit, story, p1, 'greedy'));
  assert.equal(greedy.npcAttributed, 0);
  assert.equal(greedy.wrongPromisee, 0);
  assert.ok(greedy.precision.rate !== null && greedy.precision.rate < P47_FLOORS.p1Precision);
  const paraphrase = scoreP1(p1, replayP1(kit, story, p1, 'paraphrase'));
  assert.deepEqual(paraphrase.p1sParaphraseRefused, { hits: 66, of: 66, rate: 1 });
  assert.equal(paraphrase.counts.acceptedRows, 0);
  const p2Gold = scoreP2(p2, replayP2(kit, story, p2, 'gold'));
  assert.equal(p2Gold.verdict, 'pass');
  assert.deepEqual(p2Gold.agreement, { hits: 32, of: 32, rate: 1 });
  assert.equal(scoreP2(p2, replayP2(kit, story, p2, 'paraphrase')).agreement.hits, 0);
  assert.ok(scoreP2(p2, replayP2(kit, story, p2, 'greedy')).p2w.total > 0);
});

test('p47 plumbing replies: gold lines quote the labels, paraphrases never appear in the message, ids come from offline seeding', async () => {
  const kit = await loadPromiseKit();
  const pos = p1.cases.find((entry) => entry.category === 'multiple-recipients') as P1Case;
  assert.equal(p1Reply(story, pos, 'gold').split('\n').filter((line) => line.startsWith('[promised]')).length, 2);
  for (const entry of p1.cases.filter((one) => one.label === 'promise')) for (const gold of entry.gold) assert.ok(!entry.chat[gold.messageId].text.includes(paraphraseOf(gold.quote, entry.chat[gold.messageId].text)));
  const neg = p1.cases.find((entry) => entry.label === 'none') as P1Case;
  assert.equal(p1Reply(story, neg, 'gold'), 'NO_DELTA');
  assert.ok(p1Reply(story, neg, 'greedy').startsWith('[promised]'));
  const seeded = offlineSeed(kit, story, p2, P2_CASE);
  assert.deepEqual(seeded.refused, []);
  assert.ok(p2Reply(P2_CASE, seeded.ids, 'gold').startsWith(`[${P2_CASE.event?.kind}] ${seeded.ids[P2_CASE.event?.key as string]} |`));
  assert.equal(p2Reply(P2_CONTROL, {}, 'gold'), 'NO_DELTA');
});

test('p47 P6: director input carries the promise hook, the guard flags a planted narration, rater JSON parses', async () => {
  const kit = await loadPromiseKit();
  const input = directorInput(kit, p6, p6.cases[0]);
  assert.ok(input.openThreads.some((thread) => thread.includes(p6.cases[0].quote)));
  assert.match(kit.renderDirectorPrompt(input), /was promised:/);
  const fields = proposalFields('noise {"name":"The Ferry","objective":"Rowan keeps the promise and finds the brother.","opens_when":{"new":{"rubric":"Did Rowan reach the ferry?"}}} tail');
  assert.ok(fields);
  assert.deepEqual(guardFields(kit, fields, 'Rowan'), ['objective']);
  assert.deepEqual(guardFields(kit, { ...fields, objective: 'The ferryman demands a toll before anyone may cross.' }, 'Rowan'), []);
  assert.equal(proposalFields('no json'), null);
  assert.deepEqual(parseRater('{"narrates": true, "kind": "keeping", "evidence": "keeps"}'), { narrates: true, kind: 'keeping', evidence: 'keeps' });
  assert.equal(parseRater('{"narrates": "yes"}'), null);
});

test('p47 P6 run, rate and score with fake models (planted narrating proposal fails the floor)', async () => {
  const kit = await loadPromiseKit();
  const out = await mkdtemp(join(tmpdir(), 'p47-p6-'));
  const set: P6Set = { ...p6, cases: p6.cases.slice(0, 2) };
  const proposals = ['{"name":"Ferry Toll","objective":"The ferryman demands a toll."}', '{"name":"Night Watch","objective":"Rowan breaks the promise and leaves town."}'];
  let call = 0;
  await quiet(() => directorRun({ kit, set, out, ask: async () => ({ text: proposals[call++], model: 'fake-sol' }) }));
  await quiet(() => directorRate({ set, out, ask: async (prompt) => ({ text: prompt.includes('leaves town') ? '{"narrates":true,"kind":"breaking"}' : '{"narrates":false,"kind":"none"}', model: 'fake-claude' }) }));
  const score = await directorScore(set, out);
  assert.deepEqual(score.narratedIds, [set.cases[1].id]);
  assert.deepEqual(score.guardHits, [set.cases[1].id]);
  assert.equal(score.verdict, 'incomplete');
  await quiet(() => directorRun({ kit, set, out, ask: async () => { throw new Error('must resume, not re-ask'); } }));
});

test('so-promises CLI: check exits 0, help exits 0, unknown set refused', async () => {
  assert.equal(await quiet(() => main(['check'])), 0);
  assert.equal(await quiet(() => main(['--help'])), 0);
  await assert.rejects(() => main(['score', '--set', 'p9', '--records', 'x']), /--set must be p1 or p2/);
});
