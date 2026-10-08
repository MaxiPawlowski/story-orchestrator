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

test('B1b H5: a trailing empty reply that started under 180 s ago, or ST own body.dataset.generating, reads as generating; an old empty reply does not', async () => {
  const page = idlePage();
  const chat: any[] = [{ is_user: true, mes: 'hello' }];
  g.SillyTavern = { getContext: () => ({ streamingProcessor: null, chat }) };
  const body = { dataset: {} as Record<string, string> };
  const doc = g.document;
  g.document = { ...doc, body };
  try {
    assert.equal((await getGenerationState(page)).isGenerating, false, 'control: the player line alone is idle');
    chat.push({ is_user: false, name: 'Dalan', mes: '', gen_started: new Date(Date.now() - 5000).toISOString() });
    const placeholder = await getGenerationState(page);
    assert.equal(placeholder.isGenerating, true);
    assert.equal(placeholder.emptyReplyPending, true);
    chat[1].gen_started = new Date(Date.now() - 600000).toISOString();
    assert.equal((await getGenerationState(page)).isGenerating, false, 'an empty reply older than the grace is not waited on forever');
    body.dataset.generating = 'true';
    assert.equal((await getGenerationState(page)).hostGenerating, true);
    chat[1].mes = 'Dalan answers.';
    delete body.dataset.generating;
    assert.equal((await getGenerationState(page)).isGenerating, false);
  } finally {
    g.document = doc;
  }
});

test('B1b H5b/H7: a FINISHED empty reply (gen_finished set) is not waited on; the empty-reply swipe is opt-in', async () => {
  const { swipeEmptyReplies } = await import('./st-actions.mts');
  const page = idlePage();
  const chat: any[] = [{ is_user: true, mes: 'hello' }, { is_user: false, name: 'Zariah', mes: '', gen_started: new Date(Date.now() - 5000).toISOString(), gen_finished: new Date().toISOString() }];
  g.SillyTavern = { getContext: () => ({ streamingProcessor: null, chat }) };
  assert.equal((await getGenerationState(page)).emptyReplyPending, false);
  delete chat[1].gen_finished;
  assert.equal((await getGenerationState(page)).emptyReplyPending, true, 'control: the same reply still streaming is waited on');
  assert.equal(swipeEmptyReplies({}), false);
  assert.equal(swipeEmptyReplies({ SO_SWIPE_EMPTY_REPLY: '1' }), true);
});

test('B1b H8: SO_SEND_TIMEOUT_FLOOR_MS raises a send timeout to the floor, never lowers it', async () => {
  const { sendTimeoutMs } = await import('./st-actions.mts');
  assert.equal(sendTimeoutMs(300000, {}), 300000);
  assert.equal(sendTimeoutMs(undefined, {}), 300000);
  assert.equal(sendTimeoutMs(300000, { SO_SEND_TIMEOUT_FLOOR_MS: '600000' }), 600000);
  assert.equal(sendTimeoutMs(900000, { SO_SEND_TIMEOUT_FLOOR_MS: '600000' }), 900000);
  assert.equal(sendTimeoutMs(300000, { SO_SEND_TIMEOUT_FLOOR_MS: 'x' }), 300000);
});

test('B1b H7b: SO_SWIPE_EMPTY_MAX sets the empty-reply swipe limit, default 4', async () => {
  const { swipeEmptyMax } = await import('./st-actions.mts');
  assert.equal(swipeEmptyMax({}), 4);
  assert.equal(swipeEmptyMax({ SO_SWIPE_EMPTY_MAX: '4' }), 4);
  assert.equal(swipeEmptyMax({ SO_SWIPE_EMPTY_MAX: '0' }), 4);
});

test('B1b H9: a reply counts only when the chat grew by the player line and an answer; a send that never posted is not a reply', async () => {
  const { repliedAfter } = await import('./st-actions.mts');
  assert.equal(repliedAfter({ length: 45, lastIsUser: false, lastText: 'the previous reply' }, 45), false, 'the 13:21Z case: nothing posted, the last message is the previous reply');
  assert.equal(repliedAfter({ length: 46, lastIsUser: true, lastText: 'my line' }, 45), false);
  assert.equal(repliedAfter({ length: 47, lastIsUser: false, lastText: 'an answer' }, 45), true);
  assert.equal(repliedAfter({ length: 47, lastIsUser: false, lastText: '' }, 45), false);
});
