import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const cdp = process.argv[2] ?? 'http://127.0.0.1:9302';
const dir = resolve(process.argv[3] ?? 'dist');
const prefix = '/scripts/extensions/third-party/story-orchestrator/dist/';
const types: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.css': 'text/css' };

const browser = await chromium.connectOverCDP(cdp);
const context = browser.contexts()[0];
let served = 0;
await context.route((url) => url.pathname.startsWith(prefix), async (route) => {
  const path = new URL(route.request().url()).pathname.slice(prefix.length);
  try {
    const body = await readFile(join(dir, path));
    served += 1;
    await route.fulfill({ status: 200, body, headers: { 'content-type': types[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream', 'cache-control': 'no-store' } });
  } catch {
    await route.fulfill({ status: 404, body: '' });
  }
});
console.log(JSON.stringify({ routing: prefix, from: dir, cdp }));
setInterval(() => console.log(JSON.stringify({ at: new Date().toISOString(), served })), 60000);
