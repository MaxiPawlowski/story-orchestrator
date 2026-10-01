import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureChat, LIVE_VERBS, runLive, shotName } from './sessionDriver.mts';
import type { LiveDeps } from './sessionLive.mts';
import { EVENT_TYPES, fakePage, fakeSt, install, uninstall } from './sessionFakes.mts';
import { appendTurn, findCard, loadCards, loadIndex, nextSeq, parseLiveArgs, planStart, sessionChat } from '../so-session.mts';

afterEach(uninstall);

const deps = (overrides: Partial<LiveDeps> = {}): LiveDeps => ({
  send: async () => ({ replied: true }), waitIdle: async () => undefined, waitScheduler: async () => ({}), startSend: async () => undefined,
  waitGenerating: async () => true, clickSwipeRight: async () => undefined, openChat: async () => undefined, reload: async () => undefined, now: () => Date.now(), ...overrides,
});

const chat = () => [{ name: 'Narrator', mes: 'Hall.' }, { name: 'You', is_user: true, mes: 'Hi.' }, { name: 'Belle', mes: 'Hey.' }];

test('live: every verb is wired to one CLI parse', () => {
  assert.deepEqual([...LIVE_VERBS], ['turn', 'swipe-new', 'regen', 'edit', 'delete', 'switch-chat-mid-gen', 'reload-mid-gen', 'flag', 'shot', 'age', 'adopt']);
  assert.deepEqual(parseLiveArgs('turn', ['test/sessions/T0/T0-1-1', 'We take it.', '--chat', 'c1', '--timeout-ms', '900000']), {
    verb: 'turn', dir: 'test/sessions/T0/T0-1-1', args: { line: 'We take it.' }, chat: 'c1', options: { timeoutMs: 900000 },
  });
  assert.deepEqual(parseLiveArgs('edit', ['d', '4', 'Actually, no.']).args, { messageId: 4, text: 'Actually, no.' });
  assert.deepEqual(parseLiveArgs('delete', ['d']).args, { messageId: 'last' });
  assert.deepEqual(parseLiveArgs('switch-chat-mid-gen', ['d', 'We ride.', '--to', 'c2']).args, { line: 'We ride.', to: 'c2' });
  assert.deepEqual(parseLiveArgs('flag', ['d', 'felt wrong', '--via', 'slash']).args, { note: 'felt wrong', via: 'slash' });
  assert.deepEqual(parseLiveArgs('age', ['d', '24']).args, { hours: 24 });
  assert.equal(parseLiveArgs('turn', ['d', 'x', '--no-expect-reply']).options?.expectReply, false);
  assert.throws(() => parseLiveArgs('turn', ['d']), /turn needs a player line/);
  assert.throws(() => parseLiveArgs('switch-chat-mid-gen', ['d', 'x']), /--to <chatId>/);
  assert.throws(() => parseLiveArgs('shot', ['d']), /needs a label/);
  assert.throws(() => parseLiveArgs('age', ['d', 'soon']), /number of hours/);
  assert.throws(() => parseLiveArgs('adopt', []), /session dir/);
});

test('live turn: reopens the session chat when another chat is open, then plays the turn', async () => {
  const fake = fakeSt({ chat: chat(), chatId: 'other' });
  install(fake);
  const opened: string[] = [];
  const record: any = await runLive(fakePage(), { verb: 'turn', dir: '.', chat: { chatId: 'chat-a', group: 'Adolion - Adventurer' }, args: { line: 'We go.' } }, deps({
    openChat: async (_page, target) => { opened.push(`${target.group}/${target.chatId}`); fake.ctx.chatId = target.chatId; },
    send: async (_page, line) => { fake.ctx.chat.push({ name: 'You', is_user: true, mes: line }, { name: 'Dalan', mes: 'Fine.' }); return { replied: true }; },
  }));
  assert.deepEqual(opened, ['Adolion - Adventurer/chat-a']);
  assert.deepEqual(record.ensured, { chatId: 'chat-a', reopened: true, from: 'other' });
  assert.equal(record.kind, 'turn');
  assert.deepEqual(record.speakers, ['Dalan']);
});

test('live: a session chat that cannot be reopened stops the verb before it touches anything', async () => {
  install(fakeSt({ chat: chat(), chatId: 'other' }));
  await assert.rejects(ensureChat(fakePage(), { chatId: 'chat-a', group: null }, { openChat: async () => undefined }), /could not be reopened/);
});

test('live adopt: records the open chat with its group and story', async () => {
  install(fakeSt({ chat: chat() }));
  const record: any = await runLive(fakePage(), { verb: 'adopt', dir: '.', chat: null, args: {} }, deps());
  assert.deepEqual(record.chat, { chatId: 'chat-a', groupId: 'g1', group: 'Adolion - Adventurer', storyId: 'adolion-adventurer', activeCheckpointId: 'guild-hall' });
});

test('live shot: writes a numbered screenshot into the session dir', async () => {
  install(fakeSt({ chat: chat() }));
  const dir = await mkdtemp(join(tmpdir(), 'so-shot-'));
  const taken: string[] = [];
  const page = fakePage({ screenshot: async ({ path }: { path: string }) => { taken.push(path); } });
  const record: any = await runLive(page, { verb: 'shot', dir, chat: { chatId: 'chat-a', group: null }, args: { label: 'HUD after transition!', seq: 7 } }, deps());
  assert.equal(record.path, 'shots/007-HUD-after-transition.png');
  assert.equal(taken.length, 1);
  assert.equal(shotName(12, '///'), '012-shot.png');
});

test('live age: backdates and reports whether the recap fired', async () => {
  const fake = fakeSt({ chat: chat() });
  install(fake);
  fake.events.on(EVENT_TYPES.CHAT_CHANGED, () => { fake.state.recap = { title: 'Welcome back' }; });
  const record: any = await runLive(fakePage(), { verb: 'age', dir: '.', chat: { chatId: 'chat-a', group: null }, args: { hours: 30 } }, deps());
  assert.equal(record.kind, 'age');
  assert.equal(record.ok, true);
  assert.equal(record.hours, 30);
});

test('turns.jsonl: every record gets the next sequence number', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-turns-'));
  assert.equal(await nextSeq(dir), 1);
  await appendTurn(dir, { kind: 'turn', ok: true });
  const second = await appendTurn(dir, { kind: 'mutation', verb: 'regen', ok: true });
  assert.equal(second.seq, 2);
  const rows = (await readFile(join(dir, 'turns.jsonl'), 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => [row.seq, row.kind]), [[1, 'turn'], [2, 'mutation']]);
  assert.equal(await nextSeq(dir), 3);
});

test('session chat: the primary chat is the default, an explicit chat must belong to the session', () => {
  const session = { chats: [{ chatId: 'esha', group: 'Adolion - Esha', primary: false }, { chatId: 'adv', group: 'Adolion - Adventurer', primary: true }] };
  assert.deepEqual(sessionChat(session, null), { chatId: 'adv', group: 'Adolion - Adventurer' });
  assert.deepEqual(sessionChat(session, 'esha'), { chatId: 'esha', group: 'Adolion - Esha' });
  assert.throws(() => sessionChat(session, 'nope'), /not one of this session's chats/);
  assert.equal(sessionChat({ chats: [] }, null), null);
});

test('start: a waiting card, an aged fresh card and a re-seed over a held chat are refused before any lane is touched', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const base = { lane: null, allowComfy: false, seed: true };
  assert.match(String(planStart(doc, index, findCard(doc, 'T6-1'), base, null).refused), /T6-1 waits: plan 05 R3/);
  assert.equal(planStart(doc, index, findCard(doc, 'T6-1'), { ...base, forceWaiting: true }, null).refused, null);
  assert.match(String(planStart(doc, index, findCard(doc, 'T1-1'), { ...base, age: 24 }, null).refused), /--age backdates the chat a card continues/);
  assert.match(String(planStart(doc, index, findCard(doc, 'T2-2'), { ...base, lane: 2 }, null, [{ charter: 'T2-1', lane: 2 }]).refused), /lane 2 holds the T2-1 chat/);
  const planned = planStart(doc, index, findCard(doc, 'T2-2'), { ...base, planned: 3 }, null, [{ charter: 'T2-1', lane: 2 }]) as any;
  assert.equal(planned.lane, 3);
  assert.equal(planned.pin.profile, 'Artemis RunPod RP');
  assert.equal(planned.pin.judge, 'on');
  assert.equal((planStart(doc, index, findCard(doc, 'T6-4'), base, null) as any).pin.judge, 'off');
});

test('start: a continuation carries its age, and a wizard continuation needs the adopted chat', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const base = { lane: null, allowComfy: false, seed: true };
  const aged = planStart(doc, index, findCard(doc, 'T0-2'), { ...base, age: 24 }, { session: { lane: 1, chats: [{ chatId: 'c', group: 'Adolion - Adventurer', primary: true }] } }) as any;
  assert.equal(aged.age, 24);
  assert.match(String(planStart(doc, index, findCard(doc, 'T5-3'), base, { session: { lane: 4, chats: [] } }).refused), /run so-session adopt/);
  const wizard = planStart(doc, index, findCard(doc, 'T5-3'), base, { session: { lane: 4, chats: [{ chatId: 'w1', group: 'The Cartographer', primary: true, adopted: true }] } }) as any;
  assert.deepEqual({ lane: wizard.lane, group: wizard.open.group, chat: wizard.open.continueChat, seed: wizard.seed }, { lane: 4, group: 'The Cartographer', chat: 'w1', seed: false });
  assert.deepEqual((planStart(doc, index, findCard(doc, 'T5-1'), base, null) as any).open.premise.id, 'cartographer');
});
