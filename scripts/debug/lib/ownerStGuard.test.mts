import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { OWNER_ST_FLAG, ownerStRefusal, urlPort } from './ownerStGuard.mts';
import { testTempDirSync } from '../../lib/testTemp.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

test('D-EB6: the owner ST and the shared CDP browser are refused, a lane is not', () => {
  assert.match(ownerStRefusal({ tool: 'so-run-header.mts', stUrls: ['http://127.0.0.1:8000/'] }) ?? '', /refused: it would read ST http:\/\/127\.0\.0\.1:8000\/ \(the owner's SillyTavern\)/);
  assert.match(ownerStRefusal({ tool: 'so-run-header.mts', cdpEndpoints: ['http://127.0.0.1:9222'] }) ?? '', /shared CDP browser/);
  assert.match(ownerStRefusal({ tool: 'so-run-header.mts', stUrls: ['http://localhost:8000/#chat'] }) ?? '', /st-lanes\.mts run <n> --/);
  assert.equal(ownerStRefusal({ tool: 'so-run-header.mts', stUrls: ['http://127.0.0.1:8142/'], cdpEndpoints: ['http://127.0.0.1:9342'] }), null);
  assert.equal(ownerStRefusal({ tool: 'so-run-header.mts', stUrls: [undefined, null, ''], cdpEndpoints: [undefined] }), null);
});

test('D-EB6: --owner-st is the explicit ask that lets a header read the owner install', () => {
  assert.equal(ownerStRefusal({ tool: 'so-run-header.mts', stUrls: ['http://127.0.0.1:8000/'], cdpEndpoints: ['http://127.0.0.1:9222'], args: ['capture', OWNER_ST_FLAG] }), null);
});

test('urlPort reads loopback ports only', () => {
  assert.equal(urlPort('http://127.0.0.1:8000/'), 8000);
  assert.equal(urlPort('http://localhost/'), 80);
  assert.equal(urlPort('http://192.168.50.130:8000/'), null);
  assert.equal(urlPort('not a url'), null);
});

test('D-EB6: so-run-header capture run unlaned exits 2 before connecting to anything', () => {
  const env: NodeJS.ProcessEnv = { ...process.env, SO_DEBUG_DIR: testTempDirSync('so-owner-st-'), ST_URL: '', ST_DEBUG_CDP_PORT: '' };
  delete env.SO_LANE;
  for (const command of [['capture'], ['show'], ['diff', 'missing-baseline.json']]) {
    const run = spawnSync(process.execPath, ['scripts/debug/so-run-header.mts', ...command], { cwd: ROOT, env, encoding: 'utf-8', timeout: 60000 });
    assert.equal(run.status, 2, `${command[0]}: ${run.stderr}`);
    assert.match(run.stderr, /so-run-header\.mts refused: it would read ST http:\/\/127\.0\.0\.1:8000\//);
  }
});
