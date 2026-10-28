import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupKey, backupsFor, countChat, parseChatJsonl, report, type ChatRow } from './swipeBacks.mts';
import { countChats } from '../so-swipe-backs.mts';

const player = (text: string): ChatRow => ({ name: 'Max', is_user: true, is_system: false, mes: text } as ChatRow);
const reply = (date: string, swipes: number, at: number): ChatRow => ({
  name: 'Arin', is_user: false, is_system: false, swipes: Array.from({ length: swipes }, (_, index) => `v${index}`), swipe_id: at,
  swipe_info: Array.from({ length: swipes }, (_, index) => ({ send_date: index ? `${date}-${index}` : date })),
} as ChatRow);
const snap = (label: string, rows: ChatRow[]) => ({ label, rows });

test('v3.0 14 SP1: a reply showing an older version than its newest is one swipe-back; regenerations alone are none', () => {
  const rows = [player('a'), reply('d1', 3, 2), player('b'), reply('d2', 2, 0), player('c'), reply('d3', 1, 0)];
  assert.deepEqual(countChat('c1', [snap('final', rows)]), {
    chat: 'c1', snapshots: 1, playerTurns: 3, replies: 3, regenerations: 3, swipeBacks: 1, swipeBacksKeptInFinal: 1, perHundred: 33.33,
  });
});

test('v3.0 14 SP1: backups expose a back move the final file no longer shows, and a version deleted is not a back move', () => {
  const early = [player('a'), reply('d1', 2, 1)];
  const back = [player('a'), reply('d1', 3, 1)];
  const forward = [player('a'), reply('d1', 3, 2)];
  const deleted = [player('a'), reply('d1', 2, 1)];
  assert.equal(countChat('c', [snap('1', early), snap('2', back), snap('3', forward)]).swipeBacks, 1);
  assert.equal(countChat('c', [snap('1', forward), snap('2', deleted)]).swipeBacks, 0);
  assert.equal(countChat('c', [snap('1', forward), snap('2', [player('a'), reply('d1', 3, 0)])]).swipeBacks, 1);
  assert.equal(countChat('c', [snap('1', forward), snap('2', forward)]).swipeBacks, 0);
});

test('v3.0 14 SP1: the verdict needs 3 per 100 over at least 300 turns; fewer turns are insufficient whatever the rate', () => {
  const chat = (playerTurns: number, swipeBacks: number) => ({ chat: 'x', snapshots: 1, playerTurns, replies: playerTurns, regenerations: 0, swipeBacks, swipeBacksKeptInFinal: 0, perHundred: null });
  assert.equal(report([chat(300, 9)]).verdict, 'pass');
  assert.equal(report([chat(300, 8)]).verdict, 'fail');
  assert.equal(report([chat(100, 2)]).verdict, 'insufficient');
  assert.equal(report([chat(100, 50)]).verdict, 'insufficient');
  assert.equal(report([chat(150, 2), chat(150, 7)]).perHundred, 3);
});

test('v3.0 14 SP1: the chat header line is skipped and backups match only this chat key, oldest first', () => {
  assert.equal(parseChatJsonl(`${JSON.stringify({ chat_metadata: {}, user_name: 'Max' })}\n${JSON.stringify(player('a'))}\n`).length, 1);
  assert.equal(backupKey('2026-10-25@04h32m41s362ms'), '2026_10_25_04h32m41s362ms');
  assert.deepEqual(backupsFor('2026-10-25@04h32m41s362ms', [
    'chat_2026_10_25_04h32m41s362ms_20261025-043305.jsonl', 'chat_2026_10_25_04h32m41s362ms_20261025-043255.jsonl',
    'chat_2026_10_25_04h32m41s362ms_extra_20261025-043255.jsonl', 'chat_other_20261025-043255.jsonl',
  ]), ['chat_2026_10_25_04h32m41s362ms_20261025-043255.jsonl', 'chat_2026_10_25_04h32m41s362ms_20261025-043305.jsonl']);
});

test('v3.0 14 SP1: the CLI reads the chat file after its backups and prints counts, never text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'so-swipe-backs-'));
  await mkdir(join(root, 'group chats'));
  await mkdir(join(root, 'backups'));
  const lines = (rows: ChatRow[]) => `${[{ chat_metadata: {} }, ...rows].map((row) => JSON.stringify(row)).join('\n')}\n`;
  await writeFile(join(root, 'backups', 'chat_g1_20261026-010000.jsonl'), lines([player('secret line'), reply('d1', 2, 1)]));
  await writeFile(join(root, 'backups', 'chat_g1_20261026-010100.jsonl'), lines([player('secret line'), reply('d1', 2, 0)]));
  await writeFile(join(root, 'group chats', 'g1.jsonl'), lines([player('secret line'), reply('d1', 2, 1)]));
  const result = await countChats([join(root, 'group chats', 'g1.jsonl')]);
  assert.equal(result.chats[0].snapshots, 3);
  assert.equal(result.swipeBacks, 1);
  assert.equal(result.verdict, 'insufficient');
  assert.doesNotMatch(JSON.stringify(result), /secret line|v0|v1/);
  assert.equal((await countChats([join(root, 'group chats', 'g1.jsonl')], { backups: null })).swipeBacks, 0);
});
