import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStableHead, stableSysprompt, JOIN_EXCLUDE_MUTED } from './stable-head.mjs';

const roleplay = { enabled: true, name: 'RP', content: 'Impersonate {{char}} in a roleplay. Balance {{char}} speech and narrative. Respond in third person. Do not write what {{user}} does.', post_history: '' };

test('the speaker-dependent sentences move after the history and the head keeps the shared rules', () => {
    const stable = stableSysprompt(roleplay);
    assert.equal(stable.name, 'RP (stable head)');
    assert.equal(stable.content, 'Respond in third person. Do not write what {{user}} does.');
    assert.equal(stable.post_history, 'Impersonate {{char}} in a roleplay. Balance {{char}} speech and narrative.');
    assert.equal(stable.content.includes('{{char}}'), false);
});

test('a prompt with no speaker macro needs no change, and groups already joined are left alone', () => {
    assert.equal(stableSysprompt({ ...roleplay, content: 'Write the next reply.' }), null);
    const plan = planStableHead({ power_user: { sysprompt: roleplay } }, [{ id: 'a', name: 'A', generation_mode: 0 }, { id: 'b', name: 'B', generation_mode: JOIN_EXCLUDE_MUTED }]);
    assert.deepEqual(plan.joined, [{ id: 'a', name: 'A', from: 0 }]);
    assert.equal(planStableHead({ power_user: { sysprompt: { ...roleplay, enabled: false } } }, []).sysprompt, null);
});
