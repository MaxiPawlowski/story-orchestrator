import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contextOf, readChatInventory, readHostSwipes, readLivePresets, readObservation, readRuntimeBlob, readTranscript, readWizardDrafts } from './sessionPageReads.mts';
import { fakeSt, install, uninstall } from './sessionFakes.mts';
import { findCard, loadCards, parseLiveArgs, verifySession } from '../so-session.mts';

afterEach(uninstall);

const page = { evaluate: async (fn: any, arg: any) => fn(arg) };

test('AS-23 reads: the transcript keeps every swipe, the observation names the chat and the folded count', async () => {
  const fake = fakeSt({ chat: [{ name: 'Narrator', mes: 'Hall.' }, { name: 'You', is_user: true, mes: 'Hi.' }, { name: 'Belle', mes: 'B', swipes: ['A', 'B'], swipe_id: 1 }] });
  fake.ctx.groups[0].chats = ['chat-a', 'chat-old'];
  install(fake);
  (fake.runtime as any).getPayloadCaptures = () => [{ folded: 4 }];
  const transcript = await readTranscript(page);
  assert.deepEqual(transcript.messages[2].swipes, ['A', 'B']);
  assert.equal(transcript.messages[2].swipeId, 1);
  const observed = await readObservation(page);
  assert.deepEqual({ chatId: observed.chatId, group: observed.group, folded: observed.folded, boundary: observed.boundary }, { chatId: 'chat-a', group: 'Adolion - Adventurer', folded: 4, boundary: 3 });
  assert.deepEqual(contextOf(transcript.messages, 2).map((message) => message.id), [1, 2]);
  assert.deepEqual(await readChatInventory(page), [{ chatId: 'chat-a', group: 'Adolion - Adventurer', groupId: 'g1' }, { chatId: 'chat-old', group: 'Adolion - Adventurer', groupId: 'g1' }]);
  assert.deepEqual((await readRuntimeBlob(page)).selectedStoryId, 'adolion-adventurer');
  fake.ctx.extensionSettings = { 'story-orchestrator': { wizardSessions: [{ key: 'so-w11' }], v2Stories: [{ id: 'tide', title: 'Tide', version: 2 }] } };
  const drafts = await readWizardDrafts(page);
  assert.equal(drafts.sessions.length, 1);
  assert.deepEqual(drafts.library, [{ id: 'tide', title: 'Tide', version: 2 }]);
});

test('AS-28 live args: --arm tags a generated reply, never a flag or an edit', () => {
  assert.deepEqual(parseLiveArgs('turn', ['d', 'x', '--arm', 'beat']).tag, { arm: 'beat' });
  assert.deepEqual(parseLiveArgs('swipe-new', ['d', '--arm', 'plain', '--gate', 'C3']).tag, { arm: 'plain', gate: 'C3' });
  assert.equal(parseLiveArgs('turn', ['d', 'x']).tag, undefined);
  assert.throws(() => parseLiveArgs('flag', ['d', 'note', '--arm', 'beat']), /tag a generated reply/);
  assert.throws(() => parseLiveArgs('turn', ['d', 'x', '--arm', 'a', '--gate', 'Z1']), /--gate must be one of/);
});

test('AS-22/23 verify: tracked chats need their full persisted runtime and the card its artifacts', async () => {
  const doc = await loadCards();
  const card = findCard(doc, 'T0-1');
  const dir = await mkdtemp(join(tmpdir(), 'so-verify-'));
  const session = { chats: [{ chatId: 'c1', group: 'G', primary: true }, { chatId: 'c2', group: 'G', how: 'switch-chat-mid-gen' }] };
  const empty = await verifySession(dir, session, doc, card);
  assert.ok(empty.invalid.includes('journal.jsonl is missing'));
  assert.ok(empty.invalid.some((line) => line.includes('chat c1 was tracked but its persisted runtime was not exported')));
  assert.ok(empty.invalid.some((line) => line.startsWith('required artifact turns: 0 captured')));
  for (const name of ['journal.jsonl', 'payloads.jsonl', 'console.jsonl']) await writeFile(join(dir, name), '', 'utf-8');
  const full = { selectedStoryId: 's', stories: { s: { engineState: {}, engineHistory: {}, pinnedStory: {}, extras: { effects: {}, memory: {} } } } };
  await writeFile(join(dir, 'runtime-c1.json'), JSON.stringify(full), 'utf-8');
  await writeFile(join(dir, 'runtime-c2.json'), JSON.stringify(full), 'utf-8');
  await writeFile(join(dir, 'turns.jsonl'), `${JSON.stringify({ kind: 'turn', ok: true })}\n`, 'utf-8');
  await mkdir(join(dir, 'shots'));
  const ok = await verifySession(dir, session, doc, card);
  assert.deepEqual(ok.invalid, []);
  assert.equal(ok.inventory.chats, 2);
});

test('preset overlay: the live instruct and sampler values come from the page context, and a missing holder reads null', async () => {
  const fake = fakeSt({ chat: [{ name: 'Narrator', mes: 'Hall.' }] });
  (fake.ctx as any).powerUserSettings = { instruct: { preset: 'Gemma 4', last_output_sequence: 'X', enabled: true } };
  (fake.ctx as any).textCompletionSettings = { preset: 'Artemis v1.1 RP', samplers: ['min_p', 'temperature'], temp: 1 };
  install(fake);
  assert.deepEqual(await readLivePresets(page), { instruct: { preset: 'Gemma 4', last_output_sequence: 'X', sequences_as_stop_strings: null }, textgen: { preset: 'Artemis v1.1 RP', samplers: ['min_p', 'temperature'] } });
  delete (fake.ctx as any).powerUserSettings;
  (fake.ctx as any).textCompletionSettings = { preset: 'x' };
  assert.deepEqual(await readLivePresets(page), { instruct: null, textgen: { preset: 'x', samplers: null } });
});

test('T0-3: the host swipes read comes from ST\'s own checkbox, and a missing one reads null', async () => {
  const box = { checked: true };
  (globalThis as any).document = { getElementById: (id: string) => (id === 'swipes-checkbox' ? box : null) };
  try {
    assert.deepEqual(await readHostSwipes(page), { swipes: true });
    box.checked = false;
    assert.deepEqual(await readHostSwipes(page), { swipes: false });
    (globalThis as any).document = { getElementById: () => null };
    assert.deepEqual(await readHostSwipes(page), { swipes: null });
  } finally {
    delete (globalThis as any).document;
  }
});
