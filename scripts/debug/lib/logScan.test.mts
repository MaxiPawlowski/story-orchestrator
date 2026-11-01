import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { testTempDir } from '../../lib/testTemp.mjs';
import { grepLog, LOG_LINE_MAX, logBytes } from './logScan.mts';
import { DEFAULT_SETTLE_MS, SETTLE_ENV, settleTimeoutMs } from './sessionSettle.mts';
import { JUDGE_LOADED_MARK, loadedJudgeRate } from './sessionLanes.mts';

test('43 H2: the lane log is scanned in chunks from an offset, never read whole into one string', async () => {
  const root = await testTempDir('so-logscan-');
  const path = resolve(root, 'server.log');
  const props = `{"props":"${'x'.repeat(LOG_LINE_MAX * 3)}"}`;
  const head = `boot\r\n${JUDGE_LOADED_MARK} limits per user 120/min\r\n`;
  const body = `${props}\nComfyUI ECONNREFUSED 127.0.0.1:8188\nnoise ✓ é\n${JUDGE_LOADED_MARK} limits per user 240/min\ntail without newline ComfyUI`;
  await writeFile(path, head + body, 'utf-8');
  const comfy = (line: string) => /ComfyUI/.test(line);
  for (const chunk of [7, 64, 1 << 20]) {
    assert.deepEqual(grepLog(path, comfy, 0, chunk), ['ComfyUI ECONNREFUSED 127.0.0.1:8188', 'tail without newline ComfyUI'], `chunk ${chunk}`);
    assert.equal(loadedJudgeRate(grepLog(path, (line) => line.includes(JUDGE_LOADED_MARK), 0, chunk).join('\n')), 240);
  }
  assert.deepEqual(grepLog(path, (line) => line.includes('boot')), ['boot']);
  assert.deepEqual(grepLog(path, (line) => line.includes('boot'), Buffer.byteLength(head)), []);
  assert.deepEqual(grepLog(path, (line) => line.startsWith('noise')), ['noise ✓ é']);
  assert.equal(grepLog(path, (line) => line.startsWith('{"props"')).length, 1);
  assert.equal(grepLog(path, (line) => line.includes('boot'), logBytes(path) + 100).length, 1, 'an offset past the end means the log rotated: scan from 0');
  assert.deepEqual(grepLog(resolve(root, 'missing.log'), () => true), []);
  assert.equal(logBytes(resolve(root, 'missing.log')), 0);
});

test('43 H2: the open-chat settle limit defaults to 180 s and takes SO_SESSION_SETTLE_MS', () => {
  assert.equal(settleTimeoutMs({}), DEFAULT_SETTLE_MS);
  assert.equal(DEFAULT_SETTLE_MS, 180000);
  assert.equal(settleTimeoutMs({ [SETTLE_ENV]: '300000' }), 300000);
  assert.throws(() => settleTimeoutMs({ [SETTLE_ENV]: 'soon' }), /not a positive number/);
  assert.throws(() => settleTimeoutMs({ [SETTLE_ENV]: '0' }), /not a positive number/);
});
