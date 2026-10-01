import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { backdateSession, blackboardDiff, flagMoment, groupNeedle, newJournalEvents, runGuardedTurn, runMutation, runTurn, type LiveDeps } from './sessionLive.mts';
import { clearPage, EVENT_TYPES, fakePage, fakeSt, install, uninstall } from './sessionFakes.mts';

afterEach(() => { uninstall(); delete (globalThis as any).document; });

let clock = 1000;
const baseDeps = (overrides: Partial<LiveDeps> = {}): LiveDeps => ({
  send: async () => ({ replied: true }),
  waitIdle: async () => undefined,
  waitScheduler: async () => ({ quietMs: 0 }),
  startSend: async () => undefined,
  waitGenerating: async () => true,
  clickSwipeRight: async () => undefined,
  ...clearPage,
  openChat: async () => undefined,
  reload: async () => undefined,
  now: () => { clock += 100; return clock; },
  ...overrides,
});

const greeting = () => [{ name: 'Narrator', mes: 'The guild hall is loud.' }, { name: 'You', is_user: true, mes: 'Hello.' }, { name: 'Belle', mes: 'Hi.' }];

test('turn: a group send that drafts two members records both generations, both replies and both speakers', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const { ctx, events, state } = fake;
  const send = async (_page: unknown, line: string) => {
    ctx.chat.push({ name: 'You', is_user: true, mes: line });
    for (const [chid, text] of [[1, 'Belle shrugs: fine by me.'], [2, 'Dalan counts the coin.']] as const) {
      await events.emit(EVENT_TYPES.GENERATION_STARTED, 'normal', {}, false);
      await events.emit(EVENT_TYPES.GROUP_MEMBER_DRAFTED, chid);
      ctx.chat.push({ name: ctx.characters[chid].name, mes: text });
      await events.emit(EVENT_TYPES.MESSAGE_RECEIVED, ctx.chat.length - 1, 'normal');
      await events.emit(EVENT_TYPES.GENERATION_ENDED);
    }
    await events.emit(EVENT_TYPES.GENERATION_STARTED, 'quiet', {}, false);
    state.snapshot = { ...state.snapshot, activeCheckpointId: 'road-to-wendhope', activeCheckpointName: 'The Road North', boundary: 4, blackboard: { path: 'wendhope', party_name: 'Ash Lanterns' } };
    state.journal = [...state.journal, { at: '2026-10-01T10:01:00.000Z', boundary: 4, messageId: 5, kind: 'transition', summary: 'guild-hall → road-to-wendhope' }];
    return { replied: true, lastSpeaker: 'Dalan' };
  };
  const record = await runTurn(fakePage(), 'We take Wendhope as the Ash Lanterns.', baseDeps({ send }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.deepEqual(record.replies.map((reply) => reply.speaker), ['Belle', 'Dalan']);
  assert.deepEqual(record.speakers, ['Belle', 'Dalan']);
  assert.equal(record.generations.count, 2, 'the quiet pass is not a loud generation');
  assert.equal(record.generations.quiet, 1);
  assert.deepEqual(record.generations.drafted, ['Belle', 'Dalan']);
  assert.equal(record.multiGeneration, true);
  assert.deepEqual(record.checkpoint.before, { id: 'guild-hall', name: 'The Guild Hall' });
  assert.deepEqual(record.checkpoint.after, { id: 'road-to-wendhope', name: 'The Road North' });
  assert.equal(record.checkpoint.changed, true);
  assert.deepEqual(record.blackboard.changed.path, { from: 'none', to: 'wendhope' });
  assert.equal(record.blackboard.count, 2);
  assert.deepEqual(record.journal.map((event) => event.kind), ['transition']);
  assert.equal(record.pipeline?.state, 'idle');
  assert.ok(record.timing.totalMs > 0 && record.timing.actMs > 0);
});

test('T1 turn: a group round whose second reply lands after send returns is waited for, and the record holds both replies', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const { ctx, events } = fake;
  const reply = async (chid: number, text: string) => {
    await events.emit(EVENT_TYPES.GENERATION_STARTED, 'normal', {}, false);
    await events.emit(EVENT_TYPES.GROUP_MEMBER_DRAFTED, chid);
    ctx.chat.push({ name: ctx.characters[chid].name, mes: text });
    await events.emit(EVENT_TYPES.MESSAGE_RECEIVED, ctx.chat.length - 1, 'normal');
    await events.emit(EVENT_TYPES.GENERATION_ENDED);
  };
  let ticks = 0;
  const page = fakePage({
    waitForTimeout: async () => {
      ticks += 1;
      if (ticks === 3) await reply(2, 'Dalan arrives late with the ledger.');
      if (ticks === 4) await events.emit(EVENT_TYPES.GROUP_WRAPPER_FINISHED);
    },
  });
  const send = async (_page: unknown, line: string) => {
    ctx.chat.push({ name: 'You', is_user: true, mes: line });
    await events.emit(EVENT_TYPES.GROUP_WRAPPER_STARTED);
    await reply(1, 'Belle answers first.');
    return { replied: true, lastSpeaker: 'Belle' };
  };
  const record = await runTurn(page, 'Both of you, report.', baseDeps({ send }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.deepEqual(record.speakers, ['Belle', 'Dalan']);
  assert.equal(record.generations.count, 2);
  assert.equal((record.send as any).round.settled, true);
  assert.ok(ticks >= 4, 'the wait outlasted the second reply and the wrapper close');
});

test('T1 turn: control, a group round that never closes is reported after the budget, not waited for forever', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const { ctx, events } = fake;
  const send = async (_page: unknown, line: string) => {
    ctx.chat.push({ name: 'You', is_user: true, mes: line });
    await events.emit(EVENT_TYPES.GROUP_WRAPPER_STARTED);
    ctx.chat.push({ name: 'Belle', mes: 'Still talking.' });
    return { replied: true };
  };
  const record = await runTurn(fakePage(), 'Hello?', baseDeps({ send }), { timeoutMs: 3000 });
  assert.equal(record.ok, false);
  assert.ok(record.problems.some((problem) => problem.startsWith('the round did not settle')), record.problems.join('; '));
});

test('T1 follow-up: a chained voice whose speaker is still being decided after the round closes is waited for (T1-3 Alexander m26 / msg 27)', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const { ctx, events } = fake;
  let pending = false;
  (globalThis as any).storyOrchestratorTalk = { chainPending: () => pending };
  const reply = async (chid: number, text: string) => {
    await events.emit(EVENT_TYPES.GROUP_WRAPPER_STARTED);
    await events.emit(EVENT_TYPES.GENERATION_STARTED, 'normal', {}, false);
    await events.emit(EVENT_TYPES.GROUP_MEMBER_DRAFTED, chid);
    ctx.chat.push({ name: ctx.characters[chid].name, mes: text });
    await events.emit(EVENT_TYPES.MESSAGE_RECEIVED, ctx.chat.length - 1, 'normal');
    await events.emit(EVENT_TYPES.GENERATION_ENDED);
    await events.emit(EVENT_TYPES.GROUP_WRAPPER_FINISHED);
  };
  let ticks = 0;
  const page = fakePage({
    waitForTimeout: async () => {
      ticks += 1;
      if (ticks === 40) { await reply(2, 'Dalan, chained, answers the King.'); pending = false; }
    },
  });
  const send = async (_page: unknown, line: string) => {
    ctx.chat.push({ name: 'You', is_user: true, mes: line });
    await reply(1, 'Belle answers first.');
    pending = true;
    return { replied: true, lastSpeaker: 'Belle' };
  };
  try {
    const record = await runTurn(page, 'Your Majesty, the front.', baseDeps({ send }));
    assert.equal(record.ok, true, record.problems.join('; '));
    assert.deepEqual(record.speakers, ['Belle', 'Dalan']);
    assert.equal((record.send as any).round.settled, true);
    assert.ok(ticks >= 40, 'the wait outlasted the chain decision');
  } finally {
    delete (globalThis as any).storyOrchestratorTalk;
  }
});

test('T1 follow-up: control, a chain that never stops reporting pending is reported after the budget', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const { ctx } = fake;
  (globalThis as any).storyOrchestratorTalk = { chainPending: () => true };
  const send = async (_page: unknown, line: string) => {
    ctx.chat.push({ name: 'You', is_user: true, mes: line });
    ctx.chat.push({ name: 'Belle', mes: 'Done.' });
    return { replied: true };
  };
  try {
    const record = await runTurn(fakePage(), 'Hello?', baseDeps({ send }), { timeoutMs: 12000 });
    assert.equal(record.ok, false);
    assert.ok(record.problems.some((problem) => problem.startsWith('the round did not settle')), record.problems.join('; '));
  } finally {
    delete (globalThis as any).storyOrchestratorTalk;
  }
});

test('turn: a send that nothing answers is recorded as not ok, and a scheduler that never drains is named', async () => {
  install(fakeSt({ chat: greeting() }));
  const fake = (globalThis as any).SillyTavern.getContext();
  const send = async (_page: unknown, line: string) => { fake.chat.push({ name: 'You', is_user: true, mes: line }); return { replied: false }; };
  const record = await runTurn(fakePage(), 'Anyone?', baseDeps({ send, waitScheduler: async () => { throw new Error('still reading'); } }));
  assert.equal(record.ok, false);
  assert.equal(record.replied, false);
  assert.ok(record.problems.some((problem) => problem.startsWith('no reply')));
  assert.ok(record.problems.some((problem) => problem.includes('still reading')));
});

test('swipe-new: clicks the swipe arrow on the last reply and records the new swipe', async () => {
  const fake = fakeSt({ chat: [...greeting().slice(0, 2), { name: 'Belle', mes: 'one', swipes: ['one', 'two'], swipe_id: 0 }] });
  install(fake);
  const clickSwipeRight = async () => { const last = fake.ctx.chat[2]; last.swipes.push('three'); last.swipe_id = 2; last.mes = 'three'; await fake.events.emit(EVENT_TYPES.MESSAGE_SWIPED, 2); };
  const record = await runMutation(fakePage(), 'swipe-new', {}, baseDeps({ clickSwipeRight }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.deepEqual({ before: record.did.swipesBefore, after: record.did.swipesAfter, generated: record.did.generated }, { before: 2, after: 3, generated: true });
  assert.ok(record.hostEvents.some((event: any) => event.event === 'message_swiped'));
});

test('swipe-new: refuses when the player spoke last', async () => {
  install(fakeSt({ chat: greeting().slice(0, 2) }));
  await assert.rejects(runMutation(fakePage(), 'swipe-new', {}, baseDeps()), /player's own/);
});

test('regen: runs /regenerate and records the reply before and after', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  fake.ctx.executeSlashCommandsWithOptions = async (command: string) => { fake.ctx.slash = [command]; fake.ctx.chat[2].mes = 'Hello again.'; };
  const record = await runMutation(fakePage(), 'regen', {}, baseDeps());
  assert.deepEqual(fake.ctx.slash, ['/regenerate await=true']);
  assert.equal((record.did as any).lastAfter.id, 2);
  assert.equal(record.ok, true);
});

test('edit: rewrites the message, emits MESSAGE_EDITED and records the rollback the product performed', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  fake.state.snapshot.activeCheckpointId = 'road-to-wendhope';
  fake.state.snapshot.activeCheckpointName = 'The Road North';
  fake.state.snapshot.boundary = 5;
  fake.events.on(EVENT_TYPES.MESSAGE_EDITED, (id: number) => {
    fake.state.snapshot = { ...fake.state.snapshot, activeCheckpointId: 'guild-hall', activeCheckpointName: 'The Guild Hall', boundary: 3, lastRollback: { checkpointName: 'The Guild Hall', at: 'now' } };
    fake.state.journal = [...fake.state.journal, { at: '2026-10-01T10:02:00.000Z', boundary: 3, messageId: id, kind: 'rollback', summary: 'stepped back to The Guild Hall' }];
  });
  const record = await runMutation(fakePage(), 'edit', { messageId: 1, text: 'Actually, no.' }, baseDeps());
  assert.equal(fake.ctx.chat[1].mes, 'Actually, no.');
  assert.equal(record.rollback.happened, true);
  assert.deepEqual(record.rollback.boundary, { from: 5, to: 3 });
  assert.deepEqual(record.rollback.checkpoint.to, { id: 'guild-hall', name: 'The Guild Hall' });
  assert.equal(record.rollback.events.length, 1);
  assert.deepEqual(record.rollback.notice, { checkpointName: 'The Guild Hall', at: 'now' });
});

test('delete: removes exactly one message through ST\'s own deleteMessage', async () => {
  install(fakeSt({ chat: greeting() }));
  const record = await runMutation(fakePage(), 'delete', { messageId: 'last' }, baseDeps());
  assert.equal(record.ok, true);
  assert.equal((record.did as any).speaker, 'Belle');
  assert.deepEqual(record.chat, { lengthBefore: 3, lengthAfter: 2, chatAfter: 'chat-a' });
  assert.equal(record.rollback.happened, false);
});

test('switch-chat-mid-gen: starts a generation, switches to the other chat and back, and checks where the line landed', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const chats: Record<string, any[]> = { 'chat-a': fake.ctx.chat, 'chat-b': [{ name: 'Narrator', mes: 'Eshalanore.' }] };
  const openChat = async (_page: unknown, target: { chatId: string }) => { fake.ctx.chatId = target.chatId; fake.ctx.chat = chats[target.chatId]; await fake.events.emit(EVENT_TYPES.CHAT_CHANGED, target.chatId); };
  const startSend = async (_page: unknown, line: string) => { fake.ctx.chat.push({ name: 'You', is_user: true, mes: line }); };
  const record = await runMutation(fakePage(), 'switch-chat-mid-gen', { line: 'We ride.', to: 'chat-b', group: 'Adolion - Adventurer' }, baseDeps({ openChat, startSend }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.equal((record.did as any).target.chatId, 'chat-b');
  assert.equal((record.did as any).back.chatId, 'chat-a');
  assert.equal((record.did as any).observedGenerating, true);
  assert.deepEqual(record.hostEvents.filter((event: any) => event.event === 'chat_changed').map((event: any) => event.chatId), ['chat-b', 'chat-a']);
});

test('switch-chat-mid-gen: a chat in another group is opened through its own group, the way back through the origin group', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const chats: Record<string, any[]> = { 'chat-a': fake.ctx.chat, 'chat-b': [{ name: 'Narrator', mes: 'Aegis.' }] };
  const opened: Array<{ chatId: string; group: string | null; groupId?: string | null }> = [];
  const openChat = async (_page: unknown, target: { chatId: string; group: string | null; groupId?: string | null }) => { opened.push(target); fake.ctx.chatId = target.chatId; fake.ctx.chat = chats[target.chatId]; };
  const startSend = async (_page: unknown, line: string) => { fake.ctx.chat.push({ name: 'You', is_user: true, mes: line }); };
  const record = await runMutation(fakePage(), 'switch-chat-mid-gen', { line: 'We ride.', to: 'chat-b', chatId: 'chat-a', group: 'Adolion - Between the Roads', groupId: 'g-aegis', toGroup: "Adolion - The Adventurer's Road", toGroupId: 'g-adv' }, baseDeps({ openChat, startSend }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.deepEqual(opened.map((target) => [target.chatId, target.groupId ?? target.group]), [['chat-b', 'g-adv'], ['chat-a', 'g-aegis']]);
});

test('switch-chat-mid-gen: ST refuses to leave a generating group, so a switch to another group waits for the reply and goes at once', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const chats: Record<string, any[]> = { 'chat-a': fake.ctx.chat, 'chat-b': [{ name: 'Narrator', mes: 'Aegis.' }] };
  const order: string[] = [];
  const openChat = async (_page: unknown, target: { chatId: string }) => { order.push(`open ${target.chatId}`); fake.ctx.chatId = target.chatId; fake.ctx.chat = chats[target.chatId]; };
  const startSend = async (_page: unknown, line: string) => { fake.ctx.chat.push({ name: 'You', is_user: true, mes: line }); };
  const waitIdle = async () => { order.push('idle'); };
  const crossed = await runMutation(fakePage(), 'switch-chat-mid-gen', { line: 'We ride.', to: 'chat-b', chatId: 'chat-a', group: 'Adolion - Between the Roads', groupId: 'g-aegis', toGroup: "Adolion - The Adventurer's Road", toGroupId: 'g-adv' }, baseDeps({ openChat, startSend, waitIdle }));
  assert.equal((crossed.did as any).switchedAt, 'after-reply');
  assert.deepEqual(order.slice(0, 2), ['idle', 'open chat-b']);
  order.length = 0;
  fake.ctx.chatId = 'chat-a';
  fake.ctx.chat = chats['chat-a'];
  const within = await runMutation(fakePage(), 'switch-chat-mid-gen', { line: 'We ride.', to: 'chat-b', chatId: 'chat-a', group: 'Adolion - Between the Roads', groupId: 'g-aegis' }, baseDeps({ openChat, startSend, waitIdle }));
  assert.equal((within.did as any).switchedAt, 'mid-generation');
  assert.equal(order[0], 'open chat-b');
});

test('switch-chat-mid-gen: a player line that lands in the other chat is a problem', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const chats: Record<string, any[]> = { 'chat-a': fake.ctx.chat, 'chat-b': [] };
  const openChat = async (_page: unknown, target: { chatId: string }) => { fake.ctx.chatId = target.chatId; fake.ctx.chat = chats[target.chatId]; };
  const startSend = async () => { chats['chat-b'].push({ name: 'You', is_user: true, mes: 'We ride.' }); };
  const record = await runMutation(fakePage(), 'switch-chat-mid-gen', { line: 'We ride.', to: 'chat-b' }, baseDeps({ openChat, startSend }));
  assert.equal(record.ok, false);
  assert.ok(record.problems.includes('the player line reached the chat switched to'));
});

test('reload-mid-gen: reloads during the generation, re-arms the recorder and reopens the session chat', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  let reopened: string | null = null;
  const reload = async () => { delete (globalThis as any).__soSessionRecorder; fake.ctx.chatId = null; };
  let reopenedGroup: string | null | undefined;
  const openChat = async (_page: unknown, target: { chatId: string; groupId?: string | null }) => { reopened = target.chatId; reopenedGroup = target.groupId; fake.ctx.chatId = target.chatId; };
  const record = await runMutation(fakePage(), 'reload-mid-gen', { line: 'We reach the walls.', group: 'Adolion - Adventurer' }, baseDeps({ reload, openChat }));
  assert.equal(reopened, 'chat-a');
  assert.equal(reopenedGroup, 'g1', 'the group is reopened by id: after a reload the name lookup found nothing');
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.equal((record.did as any).reloaded, true);
  assert.ok((globalThis as any).__soSessionRecorder?.armed, 'the recorder is armed again after the reload');
});

test('flag: presses the drawer flag with forced clicks, types the note and waits for the journal flag', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  (globalThis as any).document = { getElementById: () => ({ classList: { contains: () => false } }) };
  const page = fakePage();
  page.onPress = async () => { fake.state.journal = [...fake.state.journal, { at: 'now', boundary: 3, messageId: 2, kind: 'flag', summary: 'flag', detail: { note: page.typed['#so-flag-note'] } }]; };
  const record = await flagMoment(page, 'the narrator packed my bags');
  assert.equal(record.ok, true);
  assert.equal(record.via, 'drawer');
  assert.deepEqual(page.clicks, ['#so-drawer .drawer-toggle', '#so-flag-moment', '#so-flag-note:Enter']);
  assert.equal((record.flag as any).detail.note, 'the narrator packed my bags');
});

test('flag: falls back to /story flag when the drawer cannot be driven', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  (globalThis as any).document = { getElementById: () => ({ classList: { contains: () => true } }) };
  fake.ctx.executeSlashCommandsWithOptions = async (command: string) => { fake.ctx.slash.push(command); fake.state.journal = [...fake.state.journal, { at: 'now', boundary: 3, messageId: 2, kind: 'flag', summary: 'flag' }]; };
  const page = fakePage();
  page.onClick = async () => { throw new Error('element is not stable'); };
  const record = await flagMoment(page, 'slow | odd');
  assert.equal(record.via, 'slash');
  assert.match(String(record.fallbackReason), /not stable/);
  assert.deepEqual(fake.ctx.slash, ['/story flag slow / odd']);
  assert.equal(record.ok, true);
});

const recapShown = (fake: ReturnType<typeof fakeSt>, chatId: string, at = new Date().toISOString()) => {
  fake.state.journal = [...fake.state.journal, { at, boundary: 3, messageId: 2, kind: 'story', summary: 'away recap shown', detail: { note: `chat ${chatId}` } }];
};

test('age: backdates the selected story\'s lastSessionAt, saves, reloads the page, reopens the group by id and reads the recap from the journal', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const steps: string[] = [];
  const reload = async () => { steps.push('reload'); fake.ctx.chatId = null; };
  const openChat = async (_page: unknown, target: { chatId: string; group: string | null; groupId?: string | null }) => {
    steps.push(`open ${target.groupId}/${target.chatId}`);
    fake.ctx.chatId = target.chatId;
    recapShown(fake, target.chatId);
  };
  const before = Date.now();
  const record = await backdateSession(fakePage(), 24, baseDeps({ reload, openChat }), { chatId: 'chat-a', group: 'Adolion - Adventurer', groupId: 'g1' });
  assert.deepEqual(steps, ['reload', 'open g1/chat-a']);
  assert.equal(record.ok, true);
  assert.equal(record.fired, true);
  assert.equal((record.recap as any)?.summary, 'away recap shown');
  assert.equal(fake.ctx.metadataSaves, 1);
  const at = Date.parse(fake.ctx.chatMetadata.story_orchestrator.stories['adolion-adventurer'].extras.lastSessionAt);
  assert.ok(before - at >= 24 * 3600000 - 1000 && before - at <= 24 * 3600000 + 5000);
  assert.equal(record.before, '2026-10-01T09:00:00.000Z');
});

test('age: a chat with no story state is refused, not silently aged', async () => {
  const fake = fakeSt({ chat: greeting() });
  fake.ctx.chatMetadata = {};
  install(fake);
  const record = await backdateSession(fakePage(), 24, baseDeps(), null, { waitMs: 10 });
  assert.equal(record.ok, false);
  assert.equal(record.fired, false);
});

test('age: the getter is not evidence (it is empty once the popup showed), and an older recap record does not count', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  recapShown(fake, 'chat-a', '2026-01-01T00:00:00.000Z');
  fake.state.recap = null;
  const reloads: string[] = [];
  const quiet = await backdateSession(fakePage(), 24, baseDeps({ reload: async () => { reloads.push('reload'); }, openChat: async () => undefined }), { chatId: 'chat-a', group: null, groupId: 'g1' }, { waitMs: 10 });
  assert.equal(quiet.fired, false, 'a recap shown before the backdate is not this one');
  assert.deepEqual(reloads, ['reload'], 'a real page reload, not reloadCurrentChat');
  const shown = await backdateSession(fakePage(), 24, baseDeps({ openChat: async (_page, target) => { recapShown(fake, target.chatId); } }), { chatId: 'chat-a', group: null, groupId: 'g1' }, { waitMs: 10 });
  assert.equal(shown.fired, true, 'the popup was shown and journaled, so the getter being null does not matter');
});

test('group needle: the id wins over the name, the name is the fallback', () => {
  assert.equal(groupNeedle({ group: 'Adolion - The Adventurer\'s Road', groupId: '1790854408906' }), '1790854408906');
  assert.equal(groupNeedle({ group: 'Adolion - Esha', groupId: null }), 'Adolion - Esha');
  assert.equal(groupNeedle({ group: null }), null);
});

test('pure helpers: blackboard diff and the journal multiset', () => {
  assert.deepEqual(blackboardDiff({ a: 1, b: [1] }, { a: 1, b: [1, 2], c: 'x' }).changed, { b: { from: [1], to: [1, 2] }, c: { from: null, to: 'x' } });
  const event = { at: 't', boundary: 1, messageId: 1, kind: 'k', summary: 's' };
  assert.equal(newJournalEvents([event], [event, event]).length, 1, 'a repeated identical event is still new');
});

const fakeDocument = (state: { drawerOpen: boolean; popups: number }) => ({
  getElementById: (id: string) => (id === 'drawer-manager' ? { classList: { contains: (name: string) => name === 'openDrawer' && state.drawerOpen } } : null),
  querySelectorAll: () => ({ length: state.popups }),
});

const transitionNote = (text = 'The Road North') => ({ name: 'Note', is_system: true, mes: `◈ ${text}`, extra: { type: 'comment' } });

const replyWithNote = () => [...greeting().slice(0, 2), { name: 'Tobias', mes: 'A sensible choice.', swipes: ['A sensible choice.'], swipe_id: 0 }, transitionNote()];

const swipeOn = (fake: ReturnType<typeof fakeSt>, refire: boolean) => async (_page: unknown, selector?: string) => {
  const id = selector ? Number(/mesid="(\d+)"/.exec(selector)?.[1]) : fake.ctx.chat.length - 1;
  const message = fake.ctx.chat[id];
  if (fake.ctx.chat.length - 1 !== id || message.is_system) return;
  message.swipes.push('For now.');
  message.swipe_id = message.swipes.length - 1;
  message.mes = 'For now.';
  await fake.events.emit(EVENT_TYPES.MESSAGE_SWIPED, id);
  if (refire) fake.ctx.chat.push(transitionNote());
};

const flagJournal = (fake: ReturnType<typeof fakeSt>) => async () => { fake.state.journal = [...fake.state.journal, { at: 'now', boundary: 3, messageId: 2, kind: 'flag', summary: 'flag' }]; };

test('T0-3 flag: a drawer that was closed is closed again after the flag', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const drawer = { drawerOpen: false, popups: 0 };
  (globalThis as any).document = fakeDocument(drawer);
  const page = fakePage();
  page.onClick = async (selector: string) => { if (selector === '#so-drawer .drawer-toggle') drawer.drawerOpen = !drawer.drawerOpen; };
  page.onPress = flagJournal(fake);
  const record = await flagMoment(page, 'note covers the reply');
  assert.equal(record.ok, true);
  assert.equal(drawer.drawerOpen, false, 'the drawer no longer covers the swipe arrow');
  assert.deepEqual((record as any).drawer, { before: false, after: false, restored: true });
  assert.deepEqual(page.clicks, ['#so-drawer .drawer-toggle', '#so-flag-moment', '#so-flag-note:Enter', '#so-drawer .drawer-toggle']);
});

test('T0-3 flag control: a drawer the player had open stays open', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const drawer = { drawerOpen: true, popups: 0 };
  (globalThis as any).document = fakeDocument(drawer);
  const page = fakePage();
  page.onClick = async (selector: string) => { if (selector === '#so-drawer .drawer-toggle') drawer.drawerOpen = !drawer.drawerOpen; };
  page.onPress = flagJournal(fake);
  const record = await flagMoment(page, 'keep it open');
  assert.equal(drawer.drawerOpen, true);
  assert.deepEqual((record as any).drawer, { before: true, after: true, restored: true });
  assert.deepEqual(page.clicks, ['#so-flag-moment', '#so-flag-note:Enter']);
});

test('T0-3 swipe-new: the drawer and popups are closed and the arrow hit-tested before the click', async () => {
  const fake = fakeSt({ chat: [...greeting().slice(0, 2), { name: 'Belle', mes: 'one', swipes: ['one'], swipe_id: 0 }] });
  install(fake);
  const drawer = { drawerOpen: true, popups: 1 };
  (globalThis as any).document = fakeDocument(drawer);
  const order: string[] = [];
  const closeOverlays = async () => { order.push('close'); drawer.drawerOpen = false; drawer.popups = 0; };
  const hitTest = async (_page: unknown, selector: string) => { order.push(`hit ${selector}`); return { selector, found: true, clickable: !drawer.drawerOpen }; };
  const clickSwipeRight = async (page: unknown, selector: string) => { order.push(`click ${selector}`); await swipeOn(fake, false)(page, selector); };
  const record = await runMutation(fakePage(), 'swipe-new', {}, baseDeps({ closeOverlays, hitTest, clickSwipeRight }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.deepEqual(order, ['close', 'hit #chat .mes[mesid="2"] .swipe_right', 'click #chat .mes[mesid="2"] .swipe_right']);
  assert.deepEqual((record.did as any).overlays.after, { drawerOpen: false, popups: 0 });
});

test('T0-3 swipe-new: an arrow that is not hit-testable is never clicked, and the record says why', async () => {
  const fake = fakeSt({ chat: [...greeting().slice(0, 2), { name: 'Belle', mes: 'one', swipes: ['one'], swipe_id: 0 }] });
  install(fake);
  let clicked = false;
  const hitTest = async (_page: unknown, selector: string) => ({ selector, found: true, clickable: false, blocked: 'overlay', reason: 'a pointer would hit div.so-overview-layout' });
  const record = await runMutation(fakePage(), 'swipe-new', {}, baseDeps({ hitTest, clickSwipeRight: async () => { clicked = true; } }));
  assert.equal(clicked, false);
  assert.equal(record.ok, false);
  assert.match(record.problems[0], /not hit-testable \(overlay: a pointer would hit div\.so-overview-layout\)/);
});

test('T1 swipe-new: the reply is scrolled into view before the hit-test, so an arrow under the HUD off-screen is reached', async () => {
  const fake = fakeSt({ chat: [...greeting().slice(0, 2), { name: 'Belle', mes: 'one', swipes: ['one'], swipe_id: 0 }] });
  install(fake);
  const view = { atBottom: false };
  const order: string[] = [];
  const revealMessage = async (_page: unknown, selector: string) => { order.push(`reveal ${selector}`); view.atBottom = true; return { found: true, scrolledToBottom: true, inView: true }; };
  const hitTest = async (_page: unknown, selector: string) => {
    order.push('hit');
    return view.atBottom ? { selector, found: true, clickable: true } : { selector, found: true, clickable: false, blocked: 'overlay', reason: 'a pointer would hit div#so-hud' };
  };
  const clickSwipeRight = async (page: unknown, selector: string) => { order.push('click'); await swipeOn(fake, false)(page, selector); };
  const record = await runMutation(fakePage(), 'swipe-new', {}, baseDeps({ revealMessage, hitTest, clickSwipeRight }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.deepEqual(order, ['reveal #chat .mes[mesid="2"] .swipe_right', 'hit', 'click']);
  assert.deepEqual((record.did as any).revealed, { found: true, scrolledToBottom: true, inView: true });
});

test('T1 swipe-new: control, an arrow that stays covered after the reveal is still never clicked', async () => {
  const fake = fakeSt({ chat: [...greeting().slice(0, 2), { name: 'Belle', mes: 'one', swipes: ['one'], swipe_id: 0 }] });
  install(fake);
  let reveals = 0;
  let clicked = false;
  const revealMessage = async () => { reveals += 1; return { found: true, scrolledToBottom: true, inView: false }; };
  const hitTest = async (_page: unknown, selector: string) => ({ selector, found: true, clickable: false, blocked: 'overlay', reason: 'a pointer would hit div#so-hud' });
  const record = await runMutation(fakePage(), 'swipe-new', {}, baseDeps({ revealMessage, hitTest, clickSwipeRight: async () => { clicked = true; } }));
  assert.equal(clicked, false);
  assert.equal(reveals, 2, 'one reveal, then one more before giving up');
  assert.match(record.problems[0], /not hit-testable \(overlay: a pointer would hit div#so-hud\)/);
});

test('T0-3 swipe-new: a swipe that re-fires a transition and appends a note after the reply is still a new swipe', async () => {
  const fake = fakeSt({ chat: [...greeting().slice(0, 2), { name: 'Tobias', mes: 'A sensible choice.', swipes: ['A sensible choice.'], swipe_id: 0 }] });
  install(fake);
  const record = await runMutation(fakePage(), 'swipe-new', {}, baseDeps({ clickSwipeRight: swipeOn(fake, true) }));
  assert.equal(record.ok, true, record.problems.join('; '));
  const did = record.did as any;
  assert.deepEqual({ id: did.messageId, before: did.swipesBefore, after: did.swipesAfter, swipeId: did.swipeIdAfter, generated: did.generated }, { id: 2, before: 1, after: 2, swipeId: 1, generated: true });
  assert.equal(fake.ctx.chat.length, 4, 'the note the re-fired transition posted is after the reply');
});

test('T0-3 swipe-new: a transition note last is skipped, removed, and the reply that moved the story is swiped', async () => {
  const fake = fakeSt({ chat: replyWithNote() });
  install(fake);
  const record = await runMutation(fakePage(), 'swipe-new', {}, baseDeps({ clickSwipeRight: swipeOn(fake, false) }));
  assert.equal(record.ok, true, record.problems.join('; '));
  const did = record.did as any;
  assert.equal(did.messageId, 2);
  assert.equal(did.speaker, 'Tobias');
  assert.equal(did.target.skippedNotes, 1);
  assert.deepEqual(did.target.notesRemoved.map((note: any) => note.messageId), [3]);
  assert.equal(did.generated, true);
  assert.deepEqual(fake.ctx.chat[2].swipes, ['A sensible choice.', 'For now.']);
});

test('T0-3 regen: a transition note last is removed first, so /regenerate replaces the reply instead of appending below the note', async () => {
  const fake = fakeSt({ chat: replyWithNote() });
  install(fake);
  let lengthAtRegen = -1;
  fake.ctx.executeSlashCommandsWithOptions = async (command: string) => { fake.ctx.slash.push(command); lengthAtRegen = fake.ctx.chat.length; fake.ctx.chat[2].mes = 'For now.'; };
  const record = await runMutation(fakePage(), 'regen', {}, baseDeps());
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.equal(lengthAtRegen, 3, 'the reply was the last message when /regenerate ran');
  const did = record.did as any;
  assert.equal(did.target?.messageId, 2);
  assert.equal(did.target?.skippedNotes, 1);
  assert.equal(did.lastAfter.id, 2);
});

test('T0-3 regen control: with no note the last reply is regenerated and nothing is removed', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const record = await runMutation(fakePage(), 'regen', {}, baseDeps());
  const did = record.did as any;
  assert.deepEqual({ id: did.target?.messageId, skipped: did.target?.skippedNotes, removed: did.target?.notesRemoved }, { id: 2, skipped: 0, removed: [] });
  assert.equal(fake.ctx.chat.length, 3);
});

test('T0-3 delete last: a transition note last is skipped and the reply is deleted, and the record says what went', async () => {
  const fake = fakeSt({ chat: replyWithNote() });
  install(fake);
  const record = await runMutation(fakePage(), 'delete', { messageId: 'last' }, baseDeps());
  assert.equal(record.ok, true, record.problems.join('; '));
  const did = record.did as any;
  assert.deepEqual({ id: did.messageId, speaker: did.speaker, isNote: did.isNote, text: did.text }, { id: 2, speaker: 'Tobias', isNote: false, text: 'A sensible choice.' });
  assert.equal(did.target?.requested, 'last');
  assert.equal(did.target?.skippedNotes, 1);
  assert.deepEqual(fake.ctx.chat.map((message: any) => message.name), ['Narrator', 'You', 'Note']);
});

test('T0-3 delete control: an explicit id still deletes exactly that message, note or not', async () => {
  const fake = fakeSt({ chat: replyWithNote() });
  install(fake);
  const record = await runMutation(fakePage(), 'delete', { messageId: 3 }, baseDeps());
  const did = record.did as any;
  assert.deepEqual({ id: did.messageId, isNote: did.isNote, requested: did.target?.requested }, { id: 3, isNote: true, requested: 3 });
  assert.equal(fake.ctx.chat.length, 3);
});

const LOOPING = 'The front holds.\nThe banners are still.\nThe front holds.\nShe waits.\nThe front holds.';
const guardedSend = (fake: ReturnType<typeof fakeSt>, replies: Array<[number, string]>) => async (_page: unknown, line: string) => {
  fake.ctx.chat.push({ name: 'You', is_user: true, mes: line });
  for (const [chid, text] of replies) {
    fake.ctx.chat.push({ name: fake.ctx.characters[chid].name, mes: text, swipes: [text], swipe_id: 0 });
    await fake.events.emit(EVENT_TYPES.MESSAGE_RECEIVED, fake.ctx.chat.length - 1, 'normal');
  }
  return { replied: true };
};

test('T1 loop guard: a looping last reply is recorded, flagged and swiped once before the next turn', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const flags: string[] = [];
  const record = await runGuardedTurn(fakePage(), 'Hold the line.', baseDeps({ send: guardedSend(fake, [[1, LOOPING]]), flag: async (_page, note) => { flags.push(note); return { kind: 'flag', note, ok: true }; }, clickSwipeRight: swipeOn(fake, false) }));
  assert.deepEqual(record.modelDefect, { kind: 'loop', messageId: 4, sample: 'The front holds. (x3)' });
  assert.deepEqual(flags, ['model defect: loop']);
  assert.equal((record.autoRepair as any).swiped, true);
  assert.deepEqual((record.autoRepair as any).stillDefective, []);
  assert.equal(fake.ctx.chat[4].swipes.length, 2, 'one new swipe, not more');
});

test('T1 loop guard: a corrupt reply that is not the last one is flagged, and the record says why it was not swiped', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  const flags: string[] = [];
  let swiped = false;
  const record = await runGuardedTurn(fakePage(), 'Report.', baseDeps({ send: guardedSend(fake, [[1, 'Her face was pale pale under the lantern.'], [2, 'Dalan nods.']]), flag: async (_page, note) => { flags.push(note); return { ok: true }; }, clickSwipeRight: async () => { swiped = true; } }));
  assert.equal(record.modelDefect?.kind, 'corrupt');
  assert.deepEqual(flags, ['model defect: corrupt']);
  assert.equal(swiped, false);
  assert.match(String((record.autoRepair as any).skipped), /not the last character reply/);
});

test('T1 loop guard: control, a clean round is neither flagged nor swiped', async () => {
  const fake = fakeSt({ chat: greeting() });
  install(fake);
  let flagged = false;
  let swiped = false;
  const record = await runGuardedTurn(fakePage(), 'Onward.', baseDeps({ send: guardedSend(fake, [[1, 'Belle shoulders her pack.'], [2, 'Dalan counts the coin, then counts it again.']]), flag: async () => { flagged = true; return { ok: true }; }, clickSwipeRight: async () => { swiped = true; } }));
  assert.equal(record.ok, true, record.problems.join('; '));
  assert.deepEqual({ defect: record.modelDefect, defects: record.modelDefects, repair: record.autoRepair, flagged, swiped }, { defect: null, defects: [], repair: null, flagged: false, swiped: false });
});
