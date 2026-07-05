// Safe wrapper around page.evaluate() for extracting data from the ST browser context.
//
// Handles JSON serialization edge cases (functions, circular refs, undefined)
// and provides clear error messages on evaluation failure.

import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { connectToST } from './connection.mts';
import { ensureSTReady } from './st-ready.mts';

// The closure passed to page.evaluate() runs inside the ST browser page, against
// window.SillyTavern's dynamically-shaped runtime context - not worth fabricating
// types for here (see CLAUDE.md: don't guess at unconfirmed ST value shapes).
// Only the outer Node-side plumbing (page, return value) is meaningfully typed.
export async function evaluateInST<R = unknown>(page: Page, fn: (arg: any) => R | Promise<R>, arg?: any): Promise<R> {
  try {
    return await page.evaluate(fn, arg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
        url: (globalThis as any).location.href,
        title: document.title,
        contextKeys: Object.keys((globalThis as any).SillyTavern.getContext()),
      }));
      console.log('Evaluation OK:');
      console.log(JSON.stringify(info, null, 2));
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
