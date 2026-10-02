import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contextOf, readChatInventory, readHostImageGeneration, readHostSwipes, readLivePresets, readObservation, readRuntimeBlob, readTranscript, readWizardDrafts } from './sessionPageReads.mts';
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
  const thinking = { ...session, presetOverlay: { applied: true, variant: 'thinking' } };
  await writeFile(join(dir, 'chat-full-c1.json'), JSON.stringify([{ isUser: true, text: 'hi' }, { isUser: false, text: 'Hello.', reasoning: '' }]), 'utf-8');
  const silent = await verifySession(dir, thinking, doc, card);
  assert.ok(silent.invalid.some((line) => line.startsWith('the thinking preset overlay ran, but no reply carried reasoning')));
  assert.deepEqual((await verifySession(dir, { ...session, presetOverlay: { applied: true, variant: 'fix' } }, doc, card)).invalid, []);
  await writeFile(join(dir, 'chat-full-c1.json'), JSON.stringify([{ isUser: false, text: 'Hello.', reasoning: '- greet them' }]), 'utf-8');
  assert.deepEqual((await verifySession(dir, thinking, doc, card)).invalid, []);
});

test('preset overlay: the live instruct and sampler values come from the page context, and a missing holder reads null', async () => {
  const fake = fakeSt({ chat: [{ name: 'Narrator', mes: 'Hall.' }] });
  (fake.ctx as any).powerUserSettings = { instruct: { preset: 'Gemma 4', last_output_sequence: 'X', enabled: true } };
  (fake.ctx as any).textCompletionSettings = { preset: 'Artemis v1.1 RP', samplers: ['min_p', 'temperature'], temp: 1 };
  install(fake);
  assert.deepEqual(await readLivePresets(page), {
    instruct: { preset: 'Gemma 4', last_output_sequence: 'X', sequences_as_stop_strings: null, names_behavior: null, story_string_prefix: null },
    textgen: { preset: 'Artemis v1.1 RP', samplers: ['min_p', 'temperature'] }, context: null,
    settings: { 'power_user.user_prompt_bias': null, 'power_user.show_user_prompt_bias': null, 'power_user.reasoning.auto_parse': null, 'power_user.reasoning.name': null, 'power_user.reasoning.prefix': null, 'power_user.reasoning.suffix': null, amount_gen: null, 'power_user.auto_fix_generated_markdown': null, 'extension_settings.regex': null },
    profile: null,
  });
  (fake.ctx as any).powerUserSettings = {
    instruct: { preset: 'Gemma 4 Thinking', last_output_sequence: '', sequences_as_stop_strings: false, names_behavior: 'force', story_string_prefix: 'P' },
    context: { preset: 'Gemma 4', names_as_stop_strings: false },
    user_prompt_bias: '<|channel>thought\n', show_user_prompt_bias: false, reasoning: { auto_parse: true, name: 'Gemma 4', prefix: '<|channel>thought\n', suffix: '<channel|>' },
    auto_fix_generated_markdown: false,
  };
  (fake.ctx as any).extensionSettings = { ...(fake.ctx as any).extensionSettings, regex: [{ id: 'so-thinking-name-echo', findRegex: '/x/g' }], connectionManager: { selectedProfile: 'b', profiles: [{ id: 'a', name: 'Memory' }, { id: 'b', name: 'Artemis RunPod RP', instruct: 'Gemma 4 Thinking', 'start-reply-with': '<|channel>thought\n', 'reasoning-template': 'Gemma 4', preset: 'Artemis v1.1 RP' }] } };
  (globalThis as any).document = { getElementById: (id: string) => (id === 'amount_gen' ? { value: '1400' } : null) };
  try {
    const thinking = await readLivePresets(page);
    assert.deepEqual(thinking.context, { preset: 'Gemma 4', names_as_stop_strings: false });
    assert.deepEqual(thinking.settings, { 'power_user.user_prompt_bias': '<|channel>thought\n', 'power_user.show_user_prompt_bias': false, 'power_user.reasoning.auto_parse': true, 'power_user.reasoning.name': 'Gemma 4', 'power_user.reasoning.prefix': '<|channel>thought\n', 'power_user.reasoning.suffix': '<channel|>', amount_gen: 1400, 'power_user.auto_fix_generated_markdown': false, 'extension_settings.regex': [{ id: 'so-thinking-name-echo', findRegex: '/x/g' }] });
    assert.deepEqual(thinking.profile, { name: 'Artemis RunPod RP', instruct: 'Gemma 4 Thinking', 'start-reply-with': '<|channel>thought\n', 'reasoning-template': 'Gemma 4', preset: 'Artemis v1.1 RP' });
  } finally { delete (globalThis as any).document; }
  delete (fake.ctx as any).extensionSettings.connectionManager;
  delete (fake.ctx as any).powerUserSettings;
  (fake.ctx as any).textCompletionSettings = { preset: 'x' };
  assert.deepEqual(await readLivePresets(page), { instruct: null, textgen: { preset: 'x', samplers: null }, context: null, settings: null, profile: null });
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

test('T6-3-3: the Image Generation read comes from the page\'s own disabledExtensions, and a missing list reads null', async () => {
  const fake = fakeSt({ chat: [] });
  install(fake);
  (fake.ctx as any).extensionSettings = { disabledExtensions: ['tts', 'stable-diffusion'] };
  assert.deepEqual(await readHostImageGeneration(page), { imageGenerationDisabled: true });
  (fake.ctx as any).extensionSettings = { disabledExtensions: ['tts'] };
  assert.deepEqual(await readHostImageGeneration(page), { imageGenerationDisabled: false });
  (fake.ctx as any).extensionSettings = {};
  assert.deepEqual(await readHostImageGeneration(page), { imageGenerationDisabled: null });
});
