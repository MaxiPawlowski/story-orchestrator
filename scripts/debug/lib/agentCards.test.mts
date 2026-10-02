import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_ACCEPT_SELECTOR, AGENT_APPLY_SELECTOR, parseCardCount, runAgentCards, type AgentCardState } from './agentCards.mts';

const fakeDriver = (states: AgentCardState[]) => {
  const clicks: string[] = [];
  let at = 0;
  return {
    clicks,
    driver: {
      state: async () => states[Math.min(at, states.length - 1)],
      click: async (selector: string) => { clicks.push(selector); },
      settle: async () => { at += 1; },
    },
  };
};

const edit = (text: string): AgentCardState => ({ status: 'awaiting-author', busy: false, pending: { kind: 'edit', text } });
const provision = (text: string, applyEnabled = true): AgentCardState => ({ status: 'awaiting-author', busy: false, pending: { kind: 'provision', text, applyEnabled } });
const done: AgentCardState = { status: 'done', busy: false, pending: null };

test('T6-3: agent-accept accepts edit cards until none waits, and stops at a provisioning card', async () => {
  const all = fakeDriver([edit('a'), edit('b'), provision('card')]);
  const run = await runAgentCards(all.driver, 'edit', parseCardCount('all'));
  assert.deepEqual(all.clicks, [AGENT_ACCEPT_SELECTOR, AGENT_ACCEPT_SELECTOR]);
  assert.equal(run.handled.length, 2);
  assert.match(run.stop, /provisioning card waits: confirm it with agent-apply/);
  const one = fakeDriver([edit('a'), edit('b')]);
  assert.equal((await runAgentCards(one.driver, 'edit', parseCardCount('1'))).handled.length, 1);
  const none = fakeDriver([done]);
  assert.match((await runAgentCards(none.driver, 'edit', 5)).stop, /no card waits \(agent status done\)/);
});

test('T6-3: agent-apply confirms one provisioning card, never an edit card, never a refused one', async () => {
  const one = fakeDriver([provision('Create Envoy Marrow'), provision('Create the group')]);
  const run = await runAgentCards(one.driver, 'provision', 1);
  assert.deepEqual(one.clicks, [AGENT_APPLY_SELECTOR]);
  assert.equal(run.handled[0].text, 'Create Envoy Marrow');
  const wrong = fakeDriver([edit('a')]);
  assert.match((await runAgentCards(wrong.driver, 'provision', 1)).stop, /an edit card waits/);
  assert.deepEqual(wrong.clicks, []);
  const refused = fakeDriver([provision('x', false)]);
  assert.match((await runAgentCards(refused.driver, 'provision', 1)).stop, /refuses this step/);
});

test('T6-3: a busy agent is waited out before a card is read', async () => {
  const busy = fakeDriver([{ status: 'running', busy: true, pending: null }, edit('a'), done]);
  const run = await runAgentCards(busy.driver, 'edit', 5);
  assert.equal(run.handled.length, 1);
  assert.throws(() => parseCardCount('0'), /expected a card count/);
});
