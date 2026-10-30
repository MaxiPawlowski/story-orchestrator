import { createServer } from 'node:net';

export const LOOPBACK = '127.0.0.1';

export function listenOnFreePort(server, host = LOOPBACK) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

export async function freePort(host = LOOPBACK) {
  const probe = createServer();
  const port = await listenOnFreePort(probe, host);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
