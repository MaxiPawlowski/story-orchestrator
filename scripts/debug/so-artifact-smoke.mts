import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { DEBUG_DIR } from './lib/connection.mts';
import { closeCheckpointStudio, openCheckpointStudio } from './so-ui.mts';
import { EXTENSION_BASE, bundleIssues, chunkRequestIssues, consoleIssues, globalIssues } from '../release/smokeChecks.mjs';

const USAGE = `Usage: node scripts/debug/so-artifact-smoke.mts probe [--release-manifest <release-manifest.json>] [--out <file.json>]

v2.5 plan 12 SM steps 3b, 5 and 6 on an ARTIFACT install: black-box, through the page and the network
only. It never drives a storyOrchestrator* handle. Reloads with the HTTP cache off, opens the Studio from the settings panel, and checks:
every lazy chunk answers 200, no chunk-load error in the console, storyOrchestratorRuntime and
talkControlInterceptor present, the served dist/index.js is dist/manifest.json's
bundle (and release-manifest.json's when given). Steps 1-4 (install by the U6 route, first run,
provisioning sun-ruins through ST's UI, one real turn, restart) are not automated here yet.`;

const sha256 = async (page: Page, url: string) => page.evaluate(async (target: string) => {
  const response = await fetch(target, { cache: 'no-store' });
  if (!response.ok) return null;
  const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}, url);

export async function probeArtifact(page: Page, { releaseManifest = null as string | null } = {}) {
  const responses: Array<{ url: string; status: number }> = [];
  const messages: string[] = [];
  page.on('response', (response) => { if (response.url().includes(EXTENSION_BASE)) responses.push({ url: response.url(), status: response.status() }); });
  page.on('console', (message) => messages.push(message.text()));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#story-orchestrator-settings').waitFor({ state: 'attached', timeout: 60000 });
  await openCheckpointStudio(page);
  await page.waitForTimeout(3000);
  await closeCheckpointStudio(page).catch(() => undefined);
  const keys = await page.evaluate(() => Object.keys(globalThis).filter((key) => key.startsWith('storyOrchestrator') || key === 'talkControlInterceptor'));
  const built = await page.evaluate(async (base: string) => (await (await fetch(`${base}/dist/manifest.json`, { cache: 'no-store' })).json())?.bundle?.sha256 ?? null, EXTENSION_BASE);
  const served = await sha256(page, `${EXTENSION_BASE}/dist/index.js`);
  const released = releaseManifest ? JSON.parse(await readFile(resolve(releaseManifest), 'utf-8')).bundle?.sha256 : undefined;
  const issues = [...globalIssues(keys), ...chunkRequestIssues(responses), ...consoleIssues(messages), ...bundleIssues({ served, built, released })];
  return { ok: issues.length === 0, issues, served, built, released: released ?? null, globals: keys, chunks: responses.filter((response) => /\/dist\/\d+\.index\.js/.test(response.url)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (hasHelpFlag() || args[0] !== 'probe') {
    console.log(USAGE);
    process.exit(args[0] === 'probe' ? 0 : 1);
  }
  const argValue = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  runCli(async (page) => {
    const record = await probeArtifact(page, { releaseManifest: argValue('--release-manifest') ?? null });
    const out = resolve(argValue('--out') ?? resolve(DEBUG_DIR, 'artifact-smoke.json'));
    await writeFile(out, JSON.stringify(record, null, 2), 'utf-8');
    console.log(JSON.stringify({ ok: record.ok, issues: record.issues, out }, null, 2));
    return { ok: record.ok };
  });
}
