import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGenerationState, waitForIdle } from './st-actions.mts';

const g = globalThis as any;

function idlePage() {
  const send = { disabled: false, classList: { contains: () => false }, offsetParent: {} };
  const stop = { offsetParent: null };
  g.document = { getElementById: (id: string) => (id === 'send_but' ? send : id === 'mes_stop' ? stop : null) };
  g.SillyTavern = { getContext: () => ({ streamingProcessor: null }) };
  return { evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg), waitForTimeout: async () => undefined };
}

test('a talk chain still deciding its next voice reads as generating, so a send waits for the whole group turn', async () => {
  const page = idlePage();
  let pending = true;
  g.storyOrchestratorTalk = { chainPending: () => pending };
  try {
    const busy = await getGenerationState(page);
    assert.equal(busy.isGenerating, true);
    assert.equal(busy.chainPending, true);
    pending = false;
    const idle = await getGenerationState(page);
    assert.equal(idle.isGenerating, false);
    assert.equal(idle.chainPending, false);
    delete g.storyOrchestratorTalk;
    assert.equal((await getGenerationState(page)).isGenerating, false, 'no talk handle (no story, solo chat) reads idle');
  } finally {
    delete g.storyOrchestratorTalk;
  }
});

test('waitForIdle does not return while the chain is pending between two voices', async () => {
  const page = idlePage();
  let polls = 0;
  g.storyOrchestratorTalk = { chainPending: () => { polls += 1; return polls < 4; } };
  try {
    const state = await waitForIdle(page, 60000, { settleMs: 0 });
    assert.equal(state.isGenerating, false);
    assert.ok(polls >= 4, `returned after ${polls} polls`);
  } finally {
    delete g.storyOrchestratorTalk;
  }
});
