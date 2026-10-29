import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, bootstrapDelta, chatRows, flipFor, material, pairId, split, summarize, unblind, validVerdict } from './rateSeeds.mjs';

const side = (score, flags = {}) => ({ coherence: score, voice: score, guidance: score, continuity: score, voiceBleed: false, guidanceIgnored: false, leak: false, closed: true, ...flags });
const row = (seed, index, control, candidate, prefer = 'tie') => ({ id: pairId(seed, index), seed, index, control, candidate, prefer });

test('material splits the turn prompt into cards, injected guidance and the last chat turns; split finds the closed thought', () => {
    const prompt = '<|turn>system\nCARD<turn|>\n<|turn>user\nhello<turn|>\n<|turn>system\nGUIDE<turn|>\n<|turn>model\nArin: hi<turn|>\n<|turn>model\nArin:';
    assert.deepEqual(material(prompt), { speaker: 'Arin', head: 'CARD', guidance: 'GUIDE', chat: 'hello\n\nArin: hi' });
    assert.deepEqual(split('plan<channel|>  "Hi." '), { closed: true, reply: '"Hi."' });
    assert.deepEqual(split(' still thinking '), { closed: false, reply: 'still thinking' });
});

test('the blind order is deterministic per label, seed and prompt, and unblinding maps X/Y back', () => {
    assert.equal(flipFor('R2', 7, 3), flipFor('R2', 7, 3));
    const flips = Array.from({ length: 100 }, (_, index) => flipFor('R2-multiseed', 7, index)).filter(Boolean).length;
    assert.ok(flips > 30 && flips < 70, `flips ${flips}`);
    const verdict = { X: side(4), Y: side(2), prefer: 'X' };
    assert.deepEqual(unblind(verdict, false), { control: side(4), candidate: side(2), prefer: 'control' });
    assert.deepEqual(unblind(verdict, true), { control: side(2), candidate: side(4), prefer: 'candidate' });
    assert.equal(unblind({ ...verdict, prefer: 'tie' }, true).prefer, 'tie');
    assert.equal(validVerdict(verdict), true);
    assert.equal(validVerdict({ X: side(4), Y: { ...side(2), voice: 6 }, prefer: 'X' }), false);
    assert.equal(validVerdict({ X: side(4), Y: side(2), prefer: 'maybe' }), false);
});

test('chatRows keeps chat rows of one arm by corpus index', () => {
    const lines = [{ arm: 'A', kind: 'chat', index: 0, text: 'a0' }, { arm: 'A2', kind: 'chat', index: 0, text: 'b0' }, { arm: 'A', kind: 'side', index: 1 }, { arm: 'A', kind: 'long', index: 'long' }].map((r) => JSON.stringify(r)).join('\n');
    assert.deepEqual([...chatRows(lines, 'A').entries()].map(([index, r]) => [index, r.text]), [[0, 'a0']]);
    assert.equal(chatRows(lines, 'A2').get(0).text, 'b0');
});

test('floors over the multi-seed set: category drop 0.2, flags scaled to 2 per 25 rated pairs, thinking closed, 80 % rated', () => {
    const rows = [];
    for (const seed of [1, 2, 3, 4]) for (let index = 0; index < 25; index += 1) rows.push(row(seed, index, side(4), side(index < 4 ? 3 : 4)));
    const pass = aggregate(rows, { seeds: [1, 2, 3, 4] });
    assert.equal(pass.rated, 100);
    assert.equal(pass.means.coherence.delta, -0.16);
    assert.equal(pass.flagAllowance, 8);
    assert.equal(pass.pass, true);
    assert.equal(pass.seedsPassing, 4);
    const flagged = rows.map((r, at) => at < 9 ? { ...r, candidate: { ...r.candidate, guidanceIgnored: true } } : r);
    const flagMiss = aggregate(flagged, { seeds: [1, 2, 3, 4] });
    assert.equal(flagMiss.flags.guidanceIgnored.candidate, 9);
    assert.equal(flagMiss.floors.flags, false);
    assert.equal(flagMiss.seeds.find((s) => s.seed === 1).pass, false);
    const drop = aggregate(rows.map((r) => ({ ...r, candidate: { ...r.candidate, voice: 3 } })), { seeds: [1, 2, 3, 4] });
    assert.equal(drop.floors.categories, false);
    const open = aggregate(rows.map((r, at) => at === 0 ? { ...r, candidate: { ...r.candidate, closed: false } } : r), { seeds: [1, 2, 3, 4] });
    assert.equal(open.floors.thinkingClosed, false);
    const thin = aggregate(rows.slice(0, 70).concat(rows.slice(70).map((r) => ({ id: r.id, seed: r.seed, index: r.index, error: 'no verdict' }))), { seeds: [1, 2, 3, 4] });
    assert.equal(thin.rated, 70);
    assert.equal(thin.floors.rated, false);
});

test('the paired bootstrap interval is reproducible and brackets the mean delta', () => {
    const rows = Array.from({ length: 40 }, (_, index) => row(1, index, side(4), side(index % 4 === 0 ? 3 : 4)));
    const first = bootstrapDelta(rows, 'voice');
    assert.deepEqual(first, bootstrapDelta(rows, 'voice'));
    assert.ok(first.low <= -0.25 && first.high >= -0.25 && first.high <= 0);
    assert.equal(bootstrapDelta([], 'voice'), null);
    assert.equal(summarize([], { expected: 25 }).pass, false);
});
