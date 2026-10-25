import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PromptReuse, PARK_PROMPT, commonPrefix, promptReuseOptions } from './promptReuse.mjs';

const lines = (prefix, count) => Array.from({ length: count }, (_, at) => `${prefix} line ${at}`).join('\n');
const stable = lines('history', 1000);

test('commonPrefix counts equal leading characters', () => {
    assert.equal(commonPrefix('abcdef', 'abcxyz'), 3);
    assert.equal(commonPrefix('', 'abc'), 0);
});

test('prompt reuse is off unless the config enables it', () => {
    assert.equal(promptReuseOptions({}), null);
    assert.equal(promptReuseOptions({ promptReuse: { enabled: false } }), null);
    assert.equal(promptReuseOptions({ promptReuse: { enabled: true, minChars: 10 } }).minChars, 10);
});

test('the first long prompt is only remembered; the next one prefills up to the shared line boundary', () => {
    const reuse = new PromptReuse();
    const first = `${stable}\nreply one\n${lines('tail a', 120)}`;
    const second = `${stable}\nreply one\nreply two\n${lines('tail b', 120)}`;
    assert.equal(reuse.prefill({ prompt: first }), null);
    const prefill = reuse.prefill({ prompt: second });
    assert.equal(prefill.prompt, `${stable}\nreply one\n`);
    assert.equal(prefill.n_predict, 0);
    assert.equal(prefill.cache_prompt, true);
    assert.ok(second.startsWith(prefill.prompt));
    assert.deepEqual(reuse.status(), { requests: 2, prefills: 1, prefillChars: prefill.prompt.length, parks: 0, remembered: 2 });
});

test('short side prompts and prompts sharing too little are sent unchanged', () => {
    const reuse = new PromptReuse();
    assert.equal(reuse.prefill({ prompt: 'short read' }), null);
    reuse.prefill({ prompt: `${stable}\nA` });
    assert.equal(reuse.prefill({ prompt: `${lines('other', 1300)}` }), null);
    assert.equal(reuse.prefill({ prompt: `${stable}\nB` }), null, 'the tail after the boundary is too short to be worth a separate pass');
    assert.equal(reuse.prefill({ messages: [] }), null);
});

test('park answers only when the server is idle', () => {
    const reuse = new PromptReuse();
    assert.equal(reuse.park(false), null);
    assert.deepEqual(reuse.park(true), { prompt: PARK_PROMPT, n_predict: 0, cache_prompt: true, stream: false });
    assert.equal(new PromptReuse({ parkWhenIdle: false }).park(true), null);
});
