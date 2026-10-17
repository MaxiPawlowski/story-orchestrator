import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintChat, firstChange } from './lib/chatUntouched.mts';

const chat = () => [
  { name: 'Max', is_user: true, is_system: false, mes: 'Hello.', swipe_id: 0, swipes: ['Hello.'] },
  { name: 'Mara', is_user: false, is_system: false, mes: 'Hi.', swipe_id: 0, swipes: ['Hi.', 'Hey.'], extra: { reasoning: 'She is wary.' } },
];
const blob = () => ({
  chatId: 'c1',
  stories: { s: { engineState: { boundary: 3 }, extras: { extraction: { audits: [], settings: { cadence: 2 } }, judge: { calls: [] }, modelCalls: [], updatedAt: 't0', memory: { entries: [] } } } },
});

const changed = (mutate: (state: { chat: ReturnType<typeof chat>; blob: ReturnType<typeof blob> }) => void): string | null => {
  const before = { chat: chat(), blob: blob() };
  const after = { chat: chat(), blob: blob() };
  mutate(after);
  return firstChange(fingerprintChat(before.chat, before.blob), fingerprintChat(after.chat, after.blob));
};

test('v2.8 35 G6: a planted write to any hashed field fails and names the first changed field', () => {
  assert.equal(changed(({ chat }) => { chat[1].mes = 'Hello there.'; }), 'message 1: mes');
  assert.equal(changed(({ chat }) => { chat[1].swipe_id = 1; }), 'message 1: swipe_id');
  assert.equal(changed(({ chat }) => { chat[1].swipes[1] = 'Yo.'; }), 'message 1: swipes');
  assert.equal(changed(({ chat }) => { chat[1].extra!.reasoning = 'She trusts him.'; }), 'message 1: reasoning');
  assert.equal(changed(({ chat }) => { chat[0].is_system = true; }), 'message 0: is_system');
  assert.equal(changed(({ chat }) => { chat[1].name = 'Finn'; }), 'message 1: name');
  assert.equal(changed(({ chat }) => { chat.push({ ...chat[0] }); }), 'chat length 2 -> 3');
  assert.equal(changed(({ blob }) => { blob.stories.s.engineState.boundary = 4; }), 'story blob: stories.s.engineState.boundary');
  assert.equal(changed(({ blob }) => { blob.stories.s.extras.extraction.settings.cadence = 3; }), 'story blob: stories.s.extras.extraction.settings.cadence');
  assert.equal(changed(({ blob }) => { (blob.stories.s.extras.memory.entries as unknown[]).push({ id: 'm1' }); }), 'story blob: stories.s.extras.memory.entries');
});

test('v2.8 35 G6: a clean run that only writes audit bookkeeping passes', () => {
  assert.equal(changed(({ blob }) => {
    (blob.stories.s.extras.extraction.audits as unknown[]).push({ id: 'a1' });
    (blob.stories.s.extras.judge.calls as unknown[]).push({ use: 'scene' });
    (blob.stories.s.extras.modelCalls as unknown[]).push({ role: 'read' });
    blob.stories.s.extras.updatedAt = 't1';
  }), null);
  assert.equal(changed(() => undefined), null);
});

test('v2.8 35 G6: the off-chat measurement runners fail on a touched chat', async () => {
  const { readFileSync } = await import('node:fs');
  for (const script of ['so-live-suite.mts', 'so-role-calibration.mts']) {
    const source = readFileSync(new URL(`./${script}`, import.meta.url), 'utf8');
    assert.match(source, /firstChange\(untouchedBefore, await captureChatFingerprint\(page\)\)/, script);
    assert.match(source, /chat touched: /, script);
  }
});
