// Safe wrapper around page.evaluate() for extracting data from the ST browser context.
//
// Handles JSON serialization edge cases (functions, circular refs, undefined)
// and provides clear error messages on evaluation failure.

import { fileURLToPath } from 'node:url';
import { connectToST } from './connection.mjs';
import { ensureSTReady } from './st-ready.mjs';

export async function evaluateInST(page, fn, ...args) {
  try {
    return await page.evaluate(fn, ...args);
  } catch (err) {
    const message = err.message || String(err);
    if (message.includes('Target closed') || message.includes('Session closed')) {
      throw new Error(`Browser closed - tab was closed during evaluation. ${message}`);
    }
    if (message.includes('Execution context was destroyed')) {
      throw new Error(`SillyTavern page navigated away during evaluation. ${message}`);
    }
    if (message.includes('Cannot find context')) {
      throw new Error(`Browser closed - browser context lost. ${message}`);
    }
    throw new Error(`Evaluation failed in SillyTavern page: ${message}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      console.log('Connecting and verifying evaluate...');
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;

      await ensureSTReady(page);

      const info = await evaluateInST(page, () => ({
        url: globalThis.location.href,
        title: document.title,
        contextKeys: Object.keys(globalThis.SillyTavern.getContext()),
      }));
      console.log('Evaluation OK:');
      console.log(JSON.stringify(info, null, 2));
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
