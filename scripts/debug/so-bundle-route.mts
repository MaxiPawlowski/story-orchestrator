import { laneFs } from '../lib/laneSafety.mjs';
const { appendFile, rm, writeFile } = laneFs;
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route } from 'playwright';
import { connectToST } from './lib/connection.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { BUNDLE_ROUTE_PATTERN, BUNDLE_ROUTE_READY, readLaneBundle, serveFrozen, servedBundleInPage } from './lib/laneBundle.mts';

const USAGE = `Usage: node scripts/debug/so-bundle-route.mts <route <laneRoot> | served>

Run with a lane's environment (st-lanes.mts env <n>); st-lanes.mts bundle <n> freeze starts route for you.

  route <laneRoot>   stay attached to the lane browser and answer every request under
                     /scripts/extensions/third-party/story-orchestrator/ from the frozen copy named in
                     <laneRoot>/bundle.json (a browser context route, so reloads and new tabs keep it).
                     Writes <laneRoot>/${BUNDLE_ROUTE_READY} once routing, logs misses to
                     <laneRoot>/bundle-route.log, exits when the lane browser goes away
  served             print the bundle sha the lane page is served now (its dist/manifest.json, fetched
                     through the page, so a route counts)`;

async function route(laneRoot: string) {
  const record = readLaneBundle(laneRoot);
  if (!record) throw new Error(`${laneRoot} has no bundle.json: freeze first (st-lanes.mts bundle <n> freeze)`);
  const log = resolve(laneRoot, 'bundle-route.log');
  const ready = resolve(laneRoot, BUNDLE_ROUTE_READY);
  const { browser, page } = await connectToST();
  const context = page.context();
  let served = 0;
  let missing = 0;
  await context.route(BUNDLE_ROUTE_PATTERN, async (request: Route) => {
    const outcome = await serveFrozen(request, record.dir, request.request().url()).catch(async (error) => {
      await request.abort('failed').catch(() => undefined);
      await appendFile(log, `${new Date().toISOString()} error ${request.request().url()} ${error instanceof Error ? error.message : String(error)}\n`).catch(() => undefined);
      return 'missing' as const;
    });
    if (outcome === 'served') served += 1;
    else {
      missing += 1;
      await appendFile(log, `${new Date().toISOString()} missing ${request.request().url()}\n`).catch(() => undefined);
    }
  });
  await writeFile(ready, JSON.stringify({ pid: process.pid, sha256: record.sha256, dir: record.dir, at: new Date().toISOString() }, null, 2), 'utf-8');
  await appendFile(log, `${new Date().toISOString()} routing ${record.sha256} from ${record.dir} (pid ${process.pid})\n`);
  const done = async (why: string) => {
    await appendFile(log, `${new Date().toISOString()} stopped (${why}): ${served} served, ${missing} missing\n`).catch(() => undefined);
    await rm(ready, { force: true }).catch(() => undefined);
    process.exit(0);
  };
  browser.on('disconnected', () => void done('the lane browser went away'));
  process.on('SIGTERM', () => void done('SIGTERM'));
  process.on('SIGINT', () => void done('SIGINT'));
  await new Promise(() => undefined);
}

async function served() {
  const { browser, page } = await connectToST();
  try {
    await ensureSTReady(page, { timeout: 60_000 });
    console.log(JSON.stringify(await servedBundleInPage(page)));
  } finally {
    await browser.close().catch(() => undefined);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  const run = command === 'route' && arg ? route(resolve(arg)) : command === 'served' ? served() : null;
  if (!run) { console.log(USAGE); process.exitCode = 2; }
  else run.catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
