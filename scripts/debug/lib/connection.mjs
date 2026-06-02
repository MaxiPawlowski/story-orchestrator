// Playwright connection helper for SillyTavern debug scripts.
//
// Launches a Playwright-managed Chromium instance and navigates to
// SillyTavern. No external browser or CDP flags required — just a
// running SillyTavern server at the configured URL.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEBUG_DIR = resolve(PROJECT_ROOT, '.debug');

export async function connectToST({
  stUrl = 'http://127.0.0.1:8000/',
  headless = false,
} = {}) {
  await mkdir(DEBUG_DIR, { recursive: true });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  await page.goto(stUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  return { browser, page };
}

export { DEBUG_DIR, PROJECT_ROOT };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      console.log('Launching Chromium and connecting to SillyTavern...');
      const result = await connectToST();
      browser = result.browser;
      const { page } = result;
      const title = await page.title();
      console.log(`Connected. Page title: "${title}"`);
      console.log(`Page URL: ${page.url()}`);
      console.log(`.debug/ directory: ${DEBUG_DIR}`);
    } catch (err) {
      console.error('Connection failed:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) {
        browser.close();
      }
    }
  })();
}
