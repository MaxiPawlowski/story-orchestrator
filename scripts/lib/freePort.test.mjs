import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { freePort, listenOnFreePort } from './freePort.mjs';

const close = (server) => new Promise((resolve) => server.close(resolve));

test('concurrent picks hold distinct ports, none of them the fixed Storybook port', async () => {
  const servers = Array.from({ length: 16 }, () => createServer((_req, res) => res.end('ok')));
  try {
    const ports = await Promise.all(servers.map((server) => listenOnFreePort(server)));
    assert.equal(new Set(ports).size, ports.length);
    assert.ok(ports.every((port) => Number.isInteger(port) && port > 0 && port !== 6006));
    const bodies = await Promise.all(ports.map(async (port) => (await fetch(`http://127.0.0.1:${port}/`)).text()));
    assert.deepEqual(new Set(bodies), new Set(['ok']));
  } finally {
    await Promise.all(servers.map(close));
  }
});

test('a picked port stays usable while another process holds 6006', async () => {
  const holder = createServer();
  const held = await new Promise((resolve) => {
    holder.once('error', () => resolve(false));
    holder.listen(6006, '127.0.0.1', () => resolve(true));
  });
  const server = createServer((_req, res) => res.end('ok'));
  try {
    const port = await listenOnFreePort(server);
    assert.notEqual(port, 6006);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'ok');
  } finally {
    await close(server);
    if (held) await close(holder);
  }
});

test('freePort answers a bindable port and releases it', async () => {
  const port = await freePort();
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await close(server);
});

test('listenOnFreePort rejects a bind error instead of hanging', async () => {
  const server = createServer();
  await assert.rejects(listenOnFreePort(server, '256.0.0.1'));
});
