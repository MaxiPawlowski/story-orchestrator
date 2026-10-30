import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstDivergence, PrefixDivergence } from './prefixDivergence.mjs';
import { MemberCache, memberKey } from './memberCache.mjs';

test('first divergence is the first differing char, or the shorter length when one prompt extends the other', () => {
    assert.equal(firstDivergence('abcdef', 'abcxef'), 3);
    assert.equal(firstDivergence('abc', 'abcdef'), 3);
    assert.equal(firstDivergence('', 'a'), 0);
    assert.equal(firstDivergence('same', 'same'), 4);
});

test('per key: the first prompt only records, later prompts log their first divergence against the previous one with no prompt text', () => {
    const lines = [];
    const tracker = new PrefixDivergence({ log: (line) => lines.push(line), now: () => 0 });
    assert.equal(tracker.note('k1', 'HEAD|history one', 5), null);
    assert.equal(tracker.note('k1', 'HEAD|history one|two', 5).verdict, 'extends');
    assert.equal(tracker.note('k1', 'HEAD|history ONE', 5).verdict, 'below-cut');
    const churn = tracker.note('k1', 'HXAD|history ONE', 5);
    assert.deepEqual({ verdict: churn.verdict, divergence: churn.divergence, lost: churn.lost }, { verdict: 'above-cut', divergence: 1, lost: 4 });
    assert.equal(tracker.note('k2', 'other', 2), null);
    assert.deepEqual(tracker.status().compared, 3);
    assert.deepEqual([tracker.stats.extends, tracker.stats.belowCut, tracker.stats.aboveCut], [1, 1, 1]);
    assert.equal(lines.length, 3);
    assert.match(lines[2], /^first divergence key k1: char 1 of 16 \(previous 16\), cut 5, above-cut, 4 cached chars lost$/);
    for (const line of lines) assert.doesNotMatch(line, /HEAD|history|ONE/);
});

test('the tracker keeps a bounded set of keys and events', () => {
    const tracker = new PrefixDivergence({ keys: 2, events: 2 });
    tracker.note('a', 'x1', 1); tracker.note('b', 'x1', 1); tracker.note('c', 'x1', 1);
    assert.equal(tracker.status().keys, 2);
    assert.equal(tracker.note('a', 'x2', 1), null);
    for (let i = 0; i < 4; i += 1) tracker.note('c', `x${i}`, 1);
    assert.equal(tracker.events.length, 2);
    assert.equal(tracker.status().last.length, 2);
});

test('the member cache notes each planned chat prompt under its member key and reports divergence in its status', async () => {
    const lines = [];
    const head = 'H'.repeat(2500);
    const prompt = (system, turns) => `<|turn>system\n${system}${head}<|turn>system\n${'h'.repeat(9000)}${turns}`;
    const cache = new MemberCache({ store: 'ram', minPromptChars: 100, minCutChars: 100, minTailChars: 10, serverKeys: true, fitRam: false },
        { fetch: async () => Response.json({}), baseUrl: 'http://text', log: (line) => lines.push(line) });
    const first = prompt('rules v1 ', 'tail one '.repeat(200));
    const churned = prompt('rules v1 ', 'tail one '.repeat(200)).replace(head, `${'H'.repeat(2400)}${'Z'.repeat(100)}`);
    assert.equal(memberKey(first, 2000), memberKey(churned, 2000));
    await cache.before({ prompt: first, stream: true }).catch(() => null);
    await cache.before({ prompt: churned, stream: true }).catch(() => null);
    assert.equal(cache.status().divergence.compared, 1);
    assert.equal(cache.status().divergence.aboveCut, 1);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /above-cut/);
});
