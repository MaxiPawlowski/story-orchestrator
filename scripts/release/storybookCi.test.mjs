import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic, testRunnerArgs } from './storybookCi.mjs';
import { testTempDirSync } from '../lib/testTemp.mjs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('test-storybook:ci serves on a port picked per run, never the fixed 6006', () => {
  const ci = pkg.scripts['test-storybook:ci'];
  assert.match(ci, /scripts\/release\/storybookCi\.mjs/);
  assert.doesNotMatch(ci, /6006/);
});

test('two concurrent Storybook servers get distinct ports and both serve the static build', async () => {
  const dir = testTempDirSync('so-sb-static-');
  writeFileSync(join(dir, 'index.json'), '{"v":5}');
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>sb</title>');
  const [a, b] = await Promise.all([serveStatic(dir), serveStatic(dir)]);
  try {
    assert.notEqual(a.port, b.port);
    for (const server of [a, b]) {
      assert.equal(await (await fetch(`${server.url}/index.json`)).text(), '{"v":5}');
      assert.match(await (await fetch(`${server.url}/`)).text(), /<title>sb<\/title>/);
    }
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

test('the test runner is pointed at the picked url', () => {
  const args = testRunnerArgs('http://127.0.0.1:51234', ['--shard', '1/2']);
  assert.deepEqual(args.slice(1), ['--url', 'http://127.0.0.1:51234', '--maxWorkers', '4', '--shard', '1/2']);
});
