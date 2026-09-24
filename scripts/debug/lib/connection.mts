import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// v2.3 plan 11's concurrent-load ingredient: two isolated browser sessions, each with its own CDP
// port AND its own artifact directory, because two processes sharing one `.debug/` also share
// `session.json` (the second `st-session start` overwrites the first's record), the journey config
// snapshot and the asset baseline — so the second run's cleanup can read the first's state. Unset
// means the historical `.debug/`, so every existing recipe and path is unchanged.
export function debugDirFor(env: NodeJS.ProcessEnv, root: string = PROJECT_ROOT): string {
  const configured = String(env.SO_DEBUG_DIR ?? "").trim();
  return configured ? resolve(root, configured) : resolve(root, ".debug");
}

const DEBUG_DIR = debugDirFor(process.env);
const SESSION_PATH = resolve(DEBUG_DIR, 'session.json');
const DEFAULT_ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000/';
const DEFAULT_CDP_PORT = Number(process.env.ST_DEBUG_CDP_PORT || 9222);
const DEFAULT_TIMEOUT_MS = Number(process.env.ST_DEBUG_TIMEOUT_MS || 30000);
const DEFAULT_HEADED = String(process.env.ST_DEBUG_HEADED || '').toLowerCase() === 'true';

export interface DebugSession {
  cdpEndpoint: string;
  stUrl: string;
  pid: number | null;
  headed: boolean;
  startedAt: string;
  launcher: string;
}

export interface SessionStatus {
  running: boolean;
  session: DebugSession | null;
  error?: string;
  version?: unknown;
}

export interface ConnectResult {
  browser: Browser;
  page: Page;
  attached: boolean;
  session: DebugSession | null;
}

export interface ConnectOptions {
  stUrl?: string;
  headless?: boolean;
  attach?: boolean;
  timeout?: number;
}

function normalizeUrl(value: string): string {
  return new URL(value).href;
}

async function readSession(): Promise<DebugSession | null> {
  try {
    return JSON.parse(await readFile(SESSION_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export async function writeSession(data: DebugSession): Promise<void> {
  await mkdir(DEBUG_DIR, { recursive: true });
  await writeFile(SESSION_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function clearSession(): Promise<void> {
  await rm(SESSION_PATH, { force: true });
}

export async function getSessionStatus(): Promise<SessionStatus> {
  const session = await readSession();
  if (!session?.cdpEndpoint) return { running: false, session: null };
  try {
    const response = await fetch(`${session.cdpEndpoint}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return { running: false, session, error: `HTTP ${response.status}` };
    const version = await response.json();
    return { running: true, session, version };
  } catch (err) {
    return { running: false, session, error: err instanceof Error ? err.message : String(err) };
  }
}

function sameOriginOrBlank(page: Page, stUrl: string): boolean {
  const url = page.url();
  if (!url || url === 'about:blank') return true;
  try {
    return new URL(url).origin === new URL(stUrl).origin;
  } catch {
    return false;
  }
}

function requestedViewport(): { width: number; height: number } | null {
  const raw = process.env.ST_DEBUG_VIEWPORT;
  if (!raw) return null;
  const match = /^(\d+)x(\d+)$/.exec(raw.trim());
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function measuredViewport(page: Page): Promise<{ width: number; height: number } | null> {
  const known = page.viewportSize();
  if (known) return known;
  try {
    return await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  } catch {
    return null;
  }
}

// 2026-09-24: J6.6 crashed the runner twice on lane 0 with "Page.handleJavaScriptDialog: No dialog is
// showing" at its reload. With no listener, Playwright closes every dialog itself (a beforeunload is
// accepted, the rest dismissed) from an internal promise nobody awaits, so when another client on the
// shared CDP browser settles the dialog first the rejection is uncaught and kills the process. The same
// defaults, settled here with the race swallowed.
const settled = new WeakSet<Page>();
export function settleDialogs(page: Pick<Page, 'on'>) {
  if (settled.has(page as Page)) return;
  settled.add(page as Page);
  page.on('dialog', (dialog) => {
    void (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
  });
}

async function pickPage(browser: Browser, stUrl: string): Promise<Page> {
  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const pages = context.pages();
  const existing = pages.find((page) => sameOriginOrBlank(page, stUrl));
  const page = existing || await context.newPage();
  const override = requestedViewport();
  const viewport = await measuredViewport(page);
  if (override) {
    if (!viewport || viewport.width !== override.width || viewport.height !== override.height) {
      await page.setViewportSize(override);
    }
  } else if (!viewport || viewport.width < 1280) {
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  settleDialogs(page);
  if (page.url() === 'about:blank') {
    await page.goto(stUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  return page;
}

async function attachToSession(stUrl: string): Promise<ConnectResult | null> {
  const session = await readSession();
  if (!session?.cdpEndpoint) return null;
  try {
    const browser = await Promise.race([
      chromium.connectOverCDP(session.cdpEndpoint),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('CDP attach timed out.')), DEFAULT_TIMEOUT_MS)),
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
}: ConnectOptions = {}): Promise<ConnectResult> {
  await mkdir(DEBUG_DIR, { recursive: true });
  const normalizedStUrl = normalizeUrl(stUrl);
  if (attach) {
    const attached = await attachToSession(normalizedStUrl);
    if (attached) return attached;
  }

  const browser = await Promise.race([
    chromium.launch({ headless }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Chromium launch timed out.')), timeout)),
  ]);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  settleDialogs(page);

  await page.goto(normalizedStUrl, { waitUntil: 'domcontentloaded', timeout });

  return { browser, page, attached: false, session: null };
}

export { DEBUG_DIR, PROJECT_ROOT, SESSION_PATH, DEFAULT_ST_URL, DEFAULT_CDP_PORT, DEFAULT_TIMEOUT_MS };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser: Browser | undefined;
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
      console.error('Connection failed:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
      process.exit(process.exitCode || 0);
    }
  })();
}
