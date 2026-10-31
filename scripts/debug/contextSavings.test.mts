import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dedupeHits, FIXED_SENTENCES, fixedHits, recapHits, SHARED_CLAUSES, SHEET_HEADER, sheetHits, untrimmedSet } from './so-context-savings.mts';
import type { LoudPrompt } from './lib/payloadChats.mts';

const ROOT = join(import.meta.dirname, '..', '..');
const source = ['src/engine/agency.ts', 'src/pacing/guidance.ts', 'src/pacing/steering.ts', 'src/memory/innerRender.ts', 'src/runtime/narratorSheet.ts']
  .map((file) => readFileSync(join(ROOT, file), 'utf-8')).join('\n').replace(/\$\{PLAYER_REF\}/g, '{{user}}').replace(/"\s*\r?\n\s*\+\s*`|`\s*\r?\n\s*\+\s*"|"\s*\r?\n\s*\+\s*"|`\s*\r?\n\s*\+\s*`/g, '');

test('every measured sentence is still in the source it was copied from', () => {
  for (const sentence of [...FIXED_SENTENCES, SHEET_HEADER]) assert.ok(source.includes(sentence), sentence);
});

test('dedupe counts only the second and later copy of a shared clause', () => {
  const clause = SHARED_CLAUSES[1].replace(/\{\{user\}\}/g, 'Ava');
  assert.deepEqual(dedupeHits(`a ${clause} b`), []);
  assert.deepEqual(dedupeHits(`a ${clause} b\nPacing: c ${clause}`), [clause]);
});

test('sheet counts unset rows, and the header only when every row is unset', () => {
  assert.deepEqual(sheetHits(`${SHEET_HEADER}\n- Status: Health: —\n- Status: Gold: 3\nnext`), ['- Status: Health: —']);
  assert.deepEqual(sheetHits(`${SHEET_HEADER}\n- Status: Health: —\nnext`), [SHEET_HEADER, '- Status: Health: —']);
});

test('recap counts blocks only while the chat is untrimmed; fixed counts sentences after the preamble only', () => {
  const turn = (role: string, text: string) => ({ role, text, raw: '' });
  const make = (history: string[], prompt: string): LoudPrompt => ({ chat: 'c', member: 'm', index: 0, prompt, history: history.map((text) => turn('user', text)), system: '' });
  const first = make(['opener'], '[Recent events]\nThey met.\n\n');
  const later = make(['second'], '[Recent events]\nThey met.\n\n');
  const untrimmed = untrimmedSet([first, later]);
  assert.deepEqual(recapHits(first, untrimmed.has(first)), ['[Recent events]\nThey met.']);
  assert.deepEqual(recapHits(later, untrimmed.has(later)), []);
  const sentence = FIXED_SENTENCES[0];
  assert.deepEqual(fixedHits(`<|turn>system\n${sentence}<turn|>\n<|turn>user\nhi<turn|>\n`), []);
  assert.deepEqual(fixedHits(`<|turn>system\ncard<turn|>\n<|turn>system\n${sentence}<turn|>\n`), [sentence]);
});
