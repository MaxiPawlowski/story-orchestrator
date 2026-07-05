// Ensures the connected SillyTavern page is fully initialized.
//
// Waits for `window.SillyTavern` to exist and `getContext()` to return
// a non-null object, then returns the context's top-level keys.

import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { connectToST } from './connection.mts';

export async function ensureSTReady(page: Page, { timeout = 15_000 }: { timeout?: number } = {}): Promise<string[]> {
  try {
    await page.waitForFunction(
      () => {
        const st = (globalThis as any).SillyTavern;
        if (!st || typeof st.getContext !== 'function') return false;
        const ctx = st.getContext();
        return ctx != null && typeof ctx === 'object';
      },
      { timeout },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(
        `SillyTavern not ready after ${timeout}ms. ` +
        'Ensure the app is fully loaded at the expected URL.',
      );
    }
    throw new Error(`SillyTavern readiness check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const keys = await page.evaluate(() =>
    Object.keys((globalThis as any).SillyTavern.getContext()),
  );
  return keys;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      console.log('Launching Chromium and connecting to SillyTavern...');
      const { browser: b, page } = await connectToST();
      browser = b;

      console.log('Waiting for ST readiness...');
      const keys = await ensureSTReady(page);
      console.log(`ST ready. Context keys (${keys.length}): ${keys.join(', ')}`);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
