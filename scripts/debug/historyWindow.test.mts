import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coveredToOf, cutFor, prefixMass, stepTurns } from './lib/historyWindow.mts';
import { belowCut, h6Verdict, installWindow, removeWindow, validateRecallSet, type RecallRating, type RecallSet } from './lib/historyRecall.mts';
import { overheadFrom, rowsOf, scoreTrim, speakerFor, trimmedTurns, type TrimTurn } from './lib/trimArms.mts';
import { positionals, readTurns } from './so-trim-arms.mts';
import { planFrom } from './so-history-recall.mts';

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

test('63 window: under the high-water mark nothing is cut', () => {
  const result = cutFor({ tokens: [100, 200, 300], budget: 1000, coveredTo: 2 });
  assert.equal(result.over, false);
  assert.equal(result.cut, 0);
});

test('63 window: the cut lands on the first row past k x S with the smallest k that fits under high x budget', () => {
  const tokens = Array.from({ length: 20 }, () => 100);
  const result = cutFor({ tokens, budget: 1000, coveredTo: 19 });
  assert.equal(result.step, 250);
  assert.equal(result.limit, 900);
  assert.equal(result.k, 5);
  assert.equal(result.cut, 13);
  assert.ok(result.kept <= result.limit);
  assert.equal(prefixMass(tokens)[result.cut], 1300);
});

test('63 window (H3 shape): over 600 generated chats the cut never passes durable coverage and is a pure function of its input', () => {
  const random = rng(63);
  for (let run = 0; run < 600; run += 1) {
    const length = 1 + Math.floor(random() * 120);
    const tokens = Array.from({ length }, () => Math.floor(random() * 400));
    const user = tokens.map(() => random() < 0.4);
    const budget = 500 + Math.floor(random() * 6000);
    const coveredTo = Math.floor(random() * (length + 1)) - 1;
    const result = cutFor({ tokens, user, budget, coveredTo });
    assert.ok(result.cut <= coveredTo + 1, `run ${run}: cut ${result.cut} passes coverage ${coveredTo}`);
    assert.ok(result.cut >= 0 && result.cut <= length);
    assert.deepEqual(cutFor({ tokens: [...tokens], user: [...user], budget, coveredTo }), result);
    if (!result.clamped && result.over && result.cut < length && result.cut > 0 && result.snapped) assert.equal(user[result.cut], true);
  }
});

test('63 window: a cut inside a same-speaker run snaps forward to the next player message, then clamps to coverage', () => {
  const tokens = Array.from({ length: 20 }, () => 100);
  const user = tokens.map((_, index) => index % 4 === 0);
  const snapped = cutFor({ tokens, user, budget: 1000, coveredTo: 19 });
  assert.equal(snapped.cut, 16);
  assert.equal(snapped.snapped, true);
  const clamped = cutFor({ tokens, user, budget: 1000, coveredTo: 9 });
  assert.equal(clamped.cut, 10);
  assert.equal(clamped.clamped, true);
});

test('63 window: step turns are where the quantised step index grows; coverage reads summary and sealed chapters only', () => {
  assert.deepEqual(stepTurns([800, 900, 1000, 1100, 1200, 1300], 1000), [2, 4]);
  assert.deepEqual(coveredToOf({ shortTermSummaryEnd: 40, chapters: [{ status: 'sealed', range: { from: 0, to: 55 } }, { status: 'degraded', range: { from: 56, to: 90 } }] }), { coveredTo: 55, summaryEnd: 40, chapterEnd: 55 });
  assert.deepEqual(coveredToOf(null), { coveredTo: -1, summaryEnd: -1, chapterEnd: -1 });
});

const turn = (arm: 'front-trim' | 'fits', pattern: 'same' | 'alternating', index: number, sent: number, cache: number, history: number, cold = false): TrimTurn => ({
  arm, pattern, run: `${arm}-${pattern}`, turn: index, speaker: 'A', cold, ms: 1000, chatLength: 100 + index * 2, historyTokens: history, maxContext: arm === 'fits' ? 32768 : 24576, amountGen: 300,
  replyChars: 400,
  requests: [{ tag: `turn-${index}`, startedAt: 0, firstByteAt: 900, firstTextAt: 1000 + (sent - cache), doneAt: 5000, status: 200, stream: true, timings: { prompt_n: sent - cache, cache_n: cache, prompt_ms: (sent - cache) / 2, predicted_per_second: 30 }, truncated: false }, { tag: null, startedAt: 0, firstByteAt: null, firstTextAt: null, doneAt: null, status: 503, stream: false, timings: null, truncated: null }],
});

test('63 H1 score: reuse, prefill and first-token medians per arm and pattern, warm and cold, plus the would-be step turns', () => {
  const turns: TrimTurn[] = [
    ...Array.from({ length: 6 }, (_, index) => turn('fits', 'same', index, 12000 + index * 400, index === 0 ? 0 : 11800 + index * 400, 9000 + index * 400, index === 0)),
    ...Array.from({ length: 40 }, (_, index) => turn('front-trim', 'same', index, 21000, 2000, 30000 + index * 400, index === 0)),
  ];
  assert.equal(overheadFrom(turns), 3000);
  const rows = rowsOf(turns, 3000);
  assert.equal(rows[1].reuse, 12200 / 12400);
  assert.equal(rows[0].firstTokenMs, 13000);
  const score = scoreTrim(turns) as any;
  assert.equal(score.overhead, 3000);
  assert.equal(score.cells['fits/same'].cold.n, 1);
  assert.equal(score.cells['fits/same'].warm.n, 5);
  assert.equal(score.cells['front-trim/same'].warm.reuseP50, 0.095);
  const steps = score.cells['front-trim/same'].steps[0];
  assert.equal(steps.budget, 24576 - 300 - 3000);
  assert.ok(steps.stepTurns.length >= 2, JSON.stringify(steps.stepTurns));
  assert.equal(score.trimmedInFits, 0);
  assert.equal(trimmedTurns(rowsOf([turn('fits', 'same', 0, 9000, 0, 9000), turn('fits', 'same', 1, 8000, 0, 9100)], 0)), 1);
  assert.equal(speakerFor('same', ['A', 'B', 'C'], 4), 'A');
  assert.equal(speakerFor('alternating', ['A', 'B', 'C'], 4), 'B');
  assert.deepEqual(positionals(['score', 'a', '--out', 'x.json', 'b', '--overhead', '9'], ['--out', '--overhead']), ['a', 'b']);
  const dir = mkdtempSync(join(tmpdir(), 'trim-'));
  writeFileSync(join(dir, 'r.jsonl'), `${JSON.stringify(turns[0])}\n${JSON.stringify(turns[1])}\n`);
  assert.equal(readTurns([join(dir, 'r.jsonl')]).length, 2);
});

const recallSet = (critical: number, detail: number): RecallSet => ({
  chat: 'c1', group: 'g1', responder: 'Narrator',
  probes: [
    ...Array.from({ length: critical }, (_, index) => ({ id: `c${index}`, stratum: 'critical' as const, question: `Who held key ${index}?`, answer: `Holder ${index}`, source: 10 + index })),
    ...Array.from({ length: detail }, (_, index) => ({ id: `d${index}`, stratum: 'detail' as const, question: `What colour was cloak ${index}?`, answer: `Colour ${index}`, source: 40 + index })),
  ],
});

test('63 H6: probe files are shape-checked, sources must sit below the cut, and the verdict follows the predeclared floors', () => {
  const set = recallSet(10, 10);
  assert.deepEqual(validateRecallSet(set, 'H6'), []);
  assert.match(validateRecallSet(recallSet(10, 9), 'H6').join(), /10 critical and 10 detail/);
  assert.deepEqual(validateRecallSet(recallSet(10, 0), 'H6r'), []);
  assert.match(validateRecallSet({ ...set, probes: [{ ...set.probes[0], question: 'Was it Holder 0 who held it?' }, ...set.probes.slice(1)] }, 'H6').join(), /gives its own answer away/);
  assert.deepEqual(belowCut(set, 45), ['d5: source message 45 is not below the cut (45)', 'd6: source message 46 is not below the cut (45)', 'd7: source message 47 is not below the cut (45)', 'd8: source message 48 is not below the cut (45)', 'd9: source message 49 is not below the cut (45)']);
  const rate = (arm: 'on' | 'off', correct: (id: string) => boolean): RecallRating[] => set.probes.map((probe) => ({ id: probe.id, arm, correct: correct(probe.id), contradicts: false }));
  const pass = h6Verdict(set, [...rate('on', (id) => id !== 'c0' && id !== 'd0'), ...rate('off', () => true)], 'H6') as any;
  assert.equal(pass.verdict, 'pass');
  const criticalMiss = h6Verdict(set, [...rate('on', (id) => !['c0', 'c1'].includes(id)), ...rate('off', () => true)], 'H6') as any;
  assert.equal(criticalMiss.verdict, 'fail');
  assert.equal(criticalMiss.checks.critical, false);
  const vsOff = h6Verdict(set, [...rate('on', (id) => !['d0', 'd1'].includes(id)), ...rate('off', () => true)], 'H6') as any;
  assert.equal(vsOff.checks.detailVsOff, false);
  assert.equal((h6Verdict(set, rate('on', () => true), 'H6') as any).verdict, 'incomplete');
  assert.equal((h6Verdict(recallSet(10, 0), [...recallSet(10, 0).probes.map((p) => ({ id: p.id, arm: 'on' as const, correct: false, contradicts: false })), ...recallSet(10, 0).probes.map((p) => ({ id: p.id, arm: 'off' as const, correct: true, contradicts: false }))], 'H6r') as any).verdict, 'recorded');
});

test('63 H6 simulated window: rows below the cut are ignored on copies only; the live chat and its objects are untouched; quiet passes through', async () => {
  const live = Array.from({ length: 6 }, (_, index) => ({ mes: `m${index}`, is_user: index % 2 === 0, extra: { n: index } }));
  const snapshot = JSON.stringify(live);
  const root = globalThis as any;
  const calls: string[] = [];
  root.SillyTavern = { getContext: () => ({ chat: live }) };
  root.talkControlInterceptor = async (_chat: unknown[], _size: number, _abort: unknown, type: string) => { calls.push(type); };
  try {
    installWindow(4);
    const copies = live.map((message) => ({ ...message }));
    await root.talkControlInterceptor(copies, 1000, () => undefined, 'normal');
    const ignore = Symbol.for('ignore');
    assert.deepEqual(copies.map((row) => Boolean(row.extra?.[ignore])), [true, true, true, true, false, false]);
    assert.equal(JSON.stringify(live), snapshot);
    assert.ok(live.every((message) => !(message.extra as any)[ignore]));
    const quiet = live.map((message) => ({ ...message }));
    await root.talkControlInterceptor(quiet, 1000, () => undefined, 'quiet');
    assert.ok(quiet.every((row) => !(row.extra as any)[ignore]));
    assert.deepEqual(calls, ['normal', 'quiet']);
    assert.deepEqual(root.__h63Window.applied.map((entry: { marked: number }) => entry.marked), [4]);
    const original = root.__h63Window.original;
    installWindow(2);
    assert.equal(root.__h63Window.original, original);
    removeWindow();
    assert.equal(root.talkControlInterceptor, original);
  } finally {
    delete root.SillyTavern;
    delete root.talkControlInterceptor;
    delete root.__h63Window;
  }
});

test('63 H6 plan: budget = max_context - response - overhead, coverage from the chat blob', () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({ index, name: index % 2 ? 'N' : 'P', user: index % 2 === 0, system: false, tokens: 500, text: '' }));
  const plan = planFrom({ rows, maxContext: 16000, amountGen: 400, memory: { shortTermSummaryEnd: 25, chapters: [] }, chat: 'c', group: 'g' }, 3000);
  assert.equal(plan.budget, 12600);
  assert.equal(plan.coverage.coveredTo, 25);
  assert.ok(plan.over);
  assert.ok(plan.cut > 0 && plan.cut <= 26);
  assert.equal(rows[plan.cut].user, true);
});

test('63 seed-saga: the chat lands in the group, the cast ledger sets disabled members, the story is bound and side calls are off', async () => {
  const { seedSaga } = await import('./so-trim-arms.mts');
  const user = mkdtempSync(join(tmpdir(), 'saga-'));
  const { mkdirSync, readFileSync } = await import('node:fs');
  mkdirSync(join(user, 'groups'));
  writeFileSync(join(user, 'groups', '1.json'), JSON.stringify({ id: 'g1', name: 'Lab Group', members: ['a.png', 'b.png', 'c.png'], disabled_members: ['c.png'], chats: ['old'], chat_id: 'old' }));
  writeFileSync(join(user, 'settings.json'), JSON.stringify({ amount_gen: 800, extension_settings: { connectionManager: { selectedProfile: 'x', profiles: [{ id: 'p1', name: 'Local' }] }, 'story-orchestrator': { settings: { extraction: { enabled: true, cadence: 3 } } } } }));
  const head = { chat_metadata: { story_orchestrator: { stories: { lab: { extras: { effects: { ledger: [{ effect: 'cast', status: 'applied', target: { member: 'b.png' }, after: { disabled: true } }, { effect: 'cast', status: 'applied', target: { member: 'c.png' }, after: { disabled: false } }] } } } } } } };
  const chat = join(user, '2026-10-08@07h22m28s192ms.jsonl');
  writeFileSync(chat, `${JSON.stringify(head)}\n${JSON.stringify({ mes: 'one' })}\n${JSON.stringify({ mes: 'two' })}\n`);
  const result = seedSaga({ userDir: user, chatFile: chat, group: 'Lab Group', story: 'lab', profile: 'Local', amountGen: 300 });
  assert.deepEqual(result, { chatId: '2026-10-08@07h22m28s192ms', rows: 2, group: 'g1', members: 3, enabled: 2, profileId: 'p1', amountGen: 300 });
  const group = JSON.parse(readFileSync(join(user, 'groups', '1.json'), 'utf-8'));
  assert.deepEqual(group.disabled_members, ['b.png']);
  assert.equal(group.chat_id, result.chatId);
  const settings = JSON.parse(readFileSync(join(user, 'settings.json'), 'utf-8'));
  const so = settings.extension_settings['story-orchestrator'];
  assert.equal(so.groupStories.g1, 'lab');
  assert.equal(so.settings.extraction.enabled, false);
  assert.equal(so.settings.extraction.cadence, 3);
  assert.equal(so.settings.stagecraft.livingEnabled, false);
  assert.equal(so.settings.image.enabled, false);
  assert.equal(settings.amount_gen, 300);
  assert.throws(() => seedSaga({ userDir: user, chatFile: chat, group: 'Nope', story: 'lab' }), /no group named Nope/);
});
