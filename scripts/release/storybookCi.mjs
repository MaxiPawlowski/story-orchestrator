import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOPBACK, listenOnFreePort } from '../lib/freePort.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

export const STATIC_DIR = resolve(root, '.sb-static');
export const TEST_RUNNER = resolve(root, 'node_modules', '@storybook', 'test-runner', 'dist', 'test-storybook.js');

export function testRunnerArgs(url, extra = []) {
  return [TEST_RUNNER, '--url', url, '--maxWorkers', '4', ...extra];
}

export async function serveStatic(dir = STATIC_DIR, host = LOOPBACK) {
  const { createServer } = require('http-server');
  const served = createServer({ root: dir, cache: -1 });
  const port = await listenOnFreePort(served.server, host);
  return { url: `http://${host}:${port}`, port, close: () => new Promise((done) => { served.server.close(() => done()); served.server.closeAllConnections?.(); }) };
}

async function main(argv) {
  if (!existsSync(resolve(STATIC_DIR, 'index.json'))) {
    console.error(`[storybook-ci] ${STATIC_DIR} has no index.json; run npm run storybook:build first`);
    return 1;
  }
  const server = await serveStatic();
  console.log(`[storybook-ci] serving .sb-static at ${server.url}`);
  try {
    return await new Promise((done) => {
      const child = spawn(process.execPath, testRunnerArgs(server.url, argv), { cwd: root, stdio: 'inherit' });
      const stop = () => child.kill();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      child.once('error', (error) => { console.error(`[storybook-ci] ${error.message}`); done(1); });
      child.once('exit', (code, signal) => done(code ?? (signal ? 1 : 0)));
    });
  } finally {
    await server.close();
  }
}

const invoked = resolve(process.argv[1] ?? '').replace(/\\/g, '/').toLowerCase();
if (fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === invoked) process.exitCode = await main(process.argv.slice(2));
