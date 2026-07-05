import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEBUG_DIR = resolve(PROJECT_ROOT, '.debug');
const SESSION_PATH = resolve(DEBUG_DIR, 'session.json');
const DEFAULT_ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000/';
const DEFAULT_CDP_PORT = Number(process.env.ST_DEBUG_CDP_PORT || 9222);
const DEFAULT_TIMEOUT_MS = Number(process.env.ST_DEBUG_TIMEOUT_MS || 30000);
const DEFAULT_HEADED = String(process.env.ST_DEBUG_HEADED || '').toLowerCase() === 'true';

function normalizeUrl(value) {
  return new URL(value).href;
}

async function readSession() {
  try {
    return JSON.parse(await readFile(SESSION_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export async function writeSession(data) {
  await mkdir(DEBUG_DIR, { recursive: true });
  await writeFile(SESSION_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function clearSession() {
  await rm(SESSION_PATH, { force: true });
}

export async function getSessionStatus() {
  const session = await readSession();
  if (!session?.cdpEndpoint) return { running: false, session: null };
  try {
    const response = await fetch(`${session.cdpEndpoint}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return { running: false, session, error: `HTTP ${response.status}` };
    const version = await response.json();
    return { running: true, session, version };
  } catch (err) {
    return { running: false, session, error: err.message || String(err) };
  }
}

function sameOriginOrBlank(page, stUrl) {
  const url = page.url();
  if (!url || url === 'about:blank') return true;
  try {
    return new URL(url).origin === new URL(stUrl).origin;
  } catch {
    return false;
  }
}

async function pickPage(browser, stUrl) {
  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const pages = context.pages();
  const existing = pages.find((page) => sameOriginOrBlank(page, stUrl));
  const page = existing || await context.newPage();
  if (page.url() === 'about:blank') {
    await page.goto(stUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  return page;
}

async function attachToSession(stUrl) {
  const session = await readSession();
  if (!session?.cdpEndpoint) return null;
  try {
    const browser = await Promise.race([
      chromium.connectOverCDP(session.cdpEndpoint),
      new Promise((_, reject) => setTimeout(() => reject(new Error('CDP attach timed out.')), DEFAULT_TIMEOUT_MS)),
    ]);
    const page = await pickPage(browser, session.stUrl || stUrl);
    return { browser, page, attached: true, session };
  } catch {
    await clearSession();
    return null;
  }
}

export async function connectToST({
  stUrl = DEFAULT_ST_URL,
  headless = !DEFAULT_HEADED,
  attach = true,
  timeout = DEFAULT_TIMEOUT_MS,
} = {}) {
  await mkdir(DEBUG_DIR, { recursive: true });
  const normalizedStUrl = normalizeUrl(stUrl);
  if (attach) {
    const attached = await attachToSession(normalizedStUrl);
    if (attached) return attached;
  }

  const browser = await Promise.race([
    chromium.launch({ headless }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Chromium launch timed out.')), timeout)),
  ]);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  await page.goto(normalizedStUrl, { waitUntil: 'domcontentloaded', timeout });

  return { browser, page, attached: false, session: null };
}

export { DEBUG_DIR, PROJECT_ROOT, SESSION_PATH, DEFAULT_ST_URL, DEFAULT_CDP_PORT, DEFAULT_TIMEOUT_MS };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      console.log('Connecting to SillyTavern...');
      const result = await connectToST();
      browser = result.browser;
      const { page } = result;
      const title = await page.title();
      console.log(`Connected. Page title: "${title}"`);
      console.log(`Page URL: ${page.url()}`);
      console.log(`Mode: ${result.attached ? 'attached session' : 'ephemeral browser'}`);
      console.log(`.debug/ directory: ${DEBUG_DIR}`);
    } catch (err) {
      console.error('Connection failed:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
      process.exit(process.exitCode || 0);
    }
  })();
}
