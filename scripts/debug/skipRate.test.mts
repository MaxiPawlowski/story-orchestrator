import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_FLOORS, flipFor, packLeaks, parseVerdict, ratePrompt, summarize, unseal, type CapturedState, type Side } from './lib/skipRate.mts';

const side = (patch: Partial<Side> = {}): Side => ({
  coherence: 4, voice: 4, guidance: 4, continuity: 4, voiceBleed: false, guidanceIgnored: false, leak: false,
  landsAtThreshold: true, decidesForPlayer: false, undisclosedReveal: false, ...patch,
});

const state = (id: string): CapturedState => ({
  id, speaker: 'DM Narrator', chat: ['Rook: We go.'], visible: 'The road',
  skip: { text: 'SKIP-REPLY', reasoning: '', closed: true }, control: { text: 'CONTROL-REPLY', reasoning: '', closed: true },
});

describe('v3.0 32 rating arm', () => {
  it('orders the pair by hash, never by arm, and unseals it back', () => {
    const flips = Array.from({ length: 40 }, (_, index) => flipFor(`s${index}`, 'salt'));
    assert.ok(flips.some(Boolean) && flips.some((flip) => !flip));
    const prompt = ratePrompt(state('s01'), 'salt');
    const skipFirst = prompt.indexOf('SKIP-REPLY') < prompt.indexOf('CONTROL-REPLY');
    assert.equal(skipFirst, !flipFor('s01', 'salt'));
    const verdict = { X: side({ coherence: 5 }), Y: side({ coherence: 2 }), prefer: 'X' as const, why: '' };
    const row = unseal(state('s01'), verdict, 'salt');
    assert.equal(row.skip.coherence, skipFirst ? 5 : 2);
    assert.equal(row.prefer, skipFirst ? 'skip' : 'control');
  });

  it('refuses malformed verdicts and packs that name the arm', () => {
    assert.equal(parseVerdict({ X: side(), Y: { ...side(), coherence: 9 }, prefer: 'X' }), null);
    assert.equal(parseVerdict({ X: side(), Y: side(), prefer: 'maybe' }), null);
    assert.ok(parseVerdict({ X: side(), Y: side(), prefer: 'tie', why: 'same' }));
    assert.deepEqual(packLeaks([ratePrompt(state('s01'), 'salt')]), []);
    assert.equal(packLeaks(['press /story skip']).length, 1);
  });

  it('applies the predeclared floors', () => {
    const rows = Array.from({ length: SKIP_FLOORS.rated }, (_, index) => unseal(state(`s${index}`), { X: side(), Y: side(), prefer: 'tie', why: '' }, 'salt'));
    assert.equal(summarize(rows).pass, true);
    assert.equal(summarize(rows.slice(1)).floors.rated, false);
    const deciding = rows.map((row, index) => (index < 2 ? { ...row, skip: { ...row.skip, decidesForPlayer: true } } : row));
    assert.equal(summarize(deciding).floors.decidesForPlayer, false);
    const missing = rows.map((row, index) => (index < 6 ? { ...row, skip: { ...row.skip, landsAtThreshold: false } } : row));
    assert.equal(summarize(missing).floors.landsAtThreshold, false);
    const worse = rows.map((row) => ({ ...row, skip: { ...row.skip, voice: 3 } }));
    assert.equal(summarize(worse).floors.categories, false);
  });
});
