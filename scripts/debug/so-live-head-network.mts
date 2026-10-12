import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import type { Page, Response } from 'playwright';
import { runCli } from './lib/cli.mts';
import { DEBUG_DIR } from './lib/connection.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { openGroup, closeUnpinnedDrawers } from './st-navigation.mts';

const MARKERS = { renderer: 'uMouthState', rigSchema: 'weightBand', drivers: 'mouthHead' };
const argument = (key: string, fallback = '') => {
  const at = process.argv.indexOf(key);
  return at < 0 ? fallback : process.argv[at + 1] || fallback;
};

async function main(page: Page) {
  const label = argument('--label', new Date().toISOString().replace(/[:.]/g, '-'));
  const seen: { at: number; file: string; bytes: number; status: number; phase: string; markers: string[] }[] = [];
  let phase = 'initial';
  const start = Date.now();
  const listener = async (response: Response) => {
    const url = new URL(response.url());
    if (!url.pathname.includes('/third-party/story-orchestrator/dist/')) return;
    const body = await response.body().catch(() => Buffer.alloc(0));
    const text = body.toString('utf8');
    seen.push({ at: Date.now() - start, file: url.pathname.split('/').pop()!, bytes: body.length, status: response.status(), phase,
      markers: Object.entries(MARKERS).filter(([, marker]) => text.includes(marker)).map(([name]) => name) });
  };
  page.on('response', listener);
  const cache = await page.context().newCDPSession(page);
  await cache.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload();
  await ensureSTReady(page);
  await page.waitForTimeout(3000);
  phase = 'mounted';
  if (!(await page.evaluate(() => (globalThis as any).SillyTavern.getContext().groupId))) {
    await page.waitForFunction(() => (globalThis as any).SillyTavern.getContext().groups?.some((group: any) => group.name === 'SO-Show Lantern Inn'), undefined, { timeout: 30000 });
    await openGroup(page, 'SO-Show Lantern Inn');
    await closeUnpinnedDrawers(page);
  }
  await page.waitForSelector('canvas.so-live-head', { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(5000);
  const mountedCanvas = await page.locator('canvas.so-live-head').count();
  page.off('response', listener);
  await cache.detach();
  const initial = seen.filter((row) => row.phase === 'initial');
  const mounted = seen.filter((row) => row.phase === 'mounted');
  const initialMarkers = [...new Set(initial.flatMap((row) => row.markers))];
  const mountedMarkers = [...new Set(mounted.flatMap((row) => row.markers))];
  const record = {
    label,
    initialFiles: initial.map((row) => ({ file: row.file, bytes: row.bytes, markers: row.markers })),
    mountedFiles: mounted.map((row) => ({ file: row.file, bytes: row.bytes, markers: row.markers })),
    initialMarkers, mountedMarkers, mountedCanvas,
    failed: seen.filter((row) => row.status >= 400).length,
    lazyOk: initialMarkers.length === 0 && mountedMarkers.length > 0 && mountedCanvas > 0,
  };
  await mkdir(resolve(DEBUG_DIR, 'live-head'), { recursive: true });
  await writeFile(resolve(DEBUG_DIR, 'live-head', `network-${label}.json`), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
  assert.ok(record.lazyOk, 'the renderer, rig schema or drivers were in the initial load, or the live head never mounted');
  return { ok: true };
}

await runCli(main);
