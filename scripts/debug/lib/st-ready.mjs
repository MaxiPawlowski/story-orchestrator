// Ensures the connected SillyTavern page is fully initialized.
//
// Waits for `window.SillyTavern` to exist and `getContext()` to return
// a non-null object, then returns the context's top-level keys.

import { fileURLToPath } from 'node:url';
import { connectToST } from './connection.mjs';

export async function ensureSTReady(page, { timeout = 15_000 } = {}) {
  try {
    await page.waitForFunction(
      () => {
        const st = globalThis.SillyTavern;
        if (!st || typeof st.getContext !== 'function') return false;
        const ctx = st.getContext();
        return ctx != null && typeof ctx === 'object';
      },
      { timeout },
    );
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error(
        `SillyTavern not ready after ${timeout}ms. ` +
        'Ensure the app is fully loaded at the expected URL.',
      );
    }
    throw new Error(`SillyTavern readiness check failed: ${err.message}`);
  }

  const keys = await page.evaluate(() =>
    Object.keys(globalThis.SillyTavern.getContext()),
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
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
