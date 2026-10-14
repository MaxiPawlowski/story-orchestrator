import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireUncachedRepeat, renderLatency } from './poseS0Measurements.mts';

test('a repeated render is refused on cached or unverifiable servers, and accepted only with native cache-none', () => {
    for (const stats of [{}, { system: { argv: ['main.py', '--cache-ram', '8'] } }]) assert.throws(() => requireUncachedRepeat('r2', stats), /dedicated ComfyUI/);
    requireUncachedRepeat('r2', { system: { argv: ['main.py', '--cache-none'] } });
    requireUncachedRepeat('r1', {});
});

test('copied bases cannot lower render medians or inflate newly rendered sample counts', () => {
    const measured = renderLatency([{ kind: 'task', task: 'card_base', seconds: 0, shared: true },
        { kind: 'task', task: 'card_base', seconds: 100, shared: true },
        { kind: 'task', task: 'card_base', seconds: 20 }, { kind: 'task', task: 'card_base', seconds: 40 },
        { kind: 'head-skipped' }, { kind: 'task', task: 'card_base', seconds: 0 }]);
    assert.equal(measured.shared, 2);
    assert.equal(measured.untimed, 2);
    assert.equal(measured.timed, 2);
    assert.deepEqual(measured.latency['task:card_base'], { n: 2, median: 30, p90: 40 });
    assert.deepEqual(renderLatency([{ shared: true, seconds: 0 }]).latency, {});
});
