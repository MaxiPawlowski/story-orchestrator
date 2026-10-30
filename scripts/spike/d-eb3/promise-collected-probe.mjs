import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');

const PORT = 9477;
const N = Number(process.env.N ?? 30);
const dir = mkdtempSync(join(tmpdir(), 'deb3-'));
const child = spawn(chromium.executablePath(), [`--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--no-first-run', '--headless=new',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
for (let i = 0; i < 300; i++) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); break; } catch { await sleep(200); } }
await sleep(1000); const page = browser.contexts()[0].pages()[0] ?? await browser.contexts()[0].newPage();
const cdp = await browser.contexts()[0].newCDPSession(page);

async function storm(ms, { reconnect = false, alloc = true } = {}) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (alloc) await cdp.send('Runtime.evaluate', { expression: 'void JSON.stringify(Array.from({length: 200000}, (_, i) => ({i, s: "x".repeat(40)}))).length' }).catch(() => {});
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    if (reconnect) { const b2 = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); await b2.contexts()[0].pages()[0]?.evaluate(() => 1).catch(() => {}); await b2.close(); }
    await sleep(20);
  }
}

const variants = {
  unreachable: async () => { await new Promise(() => {}); },
  heldTimer: async () => { const p = new Promise((r) => setTimeout(() => r('ok'), 1200)); (globalThis.__held ??= []).push(p); return await p; },
  plainTimer: async () => await new Promise((r) => setTimeout(() => r('ok'), 1200)),
  unrefWorker: async () => {
    const src = URL.createObjectURL(new Blob(['onmessage = (e) => setTimeout(() => postMessage(e.data), 800);'], { type: 'text/javascript' }));
    return await new Promise((r) => { const w = new Worker(src); w.onmessage = (e) => r(e.data); w.postMessage('ok'); });
  },
};

const results = {};
for (const [name, fn] of Object.entries(variants)) {
  for (const reconnect of [false, true]) {
    const key = `${name}${reconnect ? '+reconnect' : ''}`;
    const tally = { ok: 0, collected: 0, other: 0, timeout: 0, sample: null };
    const runs = name === 'unreachable' ? 3 : N;
    for (let i = 0; i < runs; i++) {
      const evaluation = page.evaluate(fn).then(() => 'ok', (e) => String(e.message));
      const stormDone = storm(1500, { reconnect });
      const outcome = await Promise.race([evaluation, sleep(6000).then(() => 'timeout')]);
      await stormDone;
      if (outcome === 'ok') tally.ok++;
      else if (outcome === 'timeout') tally.timeout++;
      else if (/collected|Execution context was destroyed/.test(outcome)) { tally.collected++; tally.sample ??= outcome.slice(0, 160); }
      else { tally.other++; tally.sample ??= outcome.slice(0, 160); }
    }
    results[key] = tally;
    console.log(key, JSON.stringify(tally));
  }
}
console.log(JSON.stringify({ chromium: browser.version(), N, results }, null, 2));
await browser.close().catch(() => {});
child.kill();
await sleep(1000);
try { rmSync(dir, { recursive: true, force: true }); } catch {}
process.exit(0);
