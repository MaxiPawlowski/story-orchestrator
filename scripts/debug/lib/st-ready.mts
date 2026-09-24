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
    // A page can look fully ready while every POST it makes 403s: ST captures its CSRF token during
    // firstLoadInit, but the server session can rotate underneath a shared browser kept open for hours.
    // GET /csrf-token answers the server's current token without mutating it. Compare, never replace:
    // replacing the header inside a run would hide that the next ordinary ST action still cannot save.
    // A freshly loaded page has no token for about a second: ST fetches it in firstLoadInit, after the
    // context exists. Comparing then read a cold browser as "stale" every time (parallel lanes, 2026-09-24).
    await page.waitForFunction(() => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      return typeof ctx?.getRequestHeaders !== 'function' || Boolean(ctx.getRequestHeaders()?.['X-CSRF-Token']);
    }, { timeout }).catch(() => undefined);
    const csrf = await page.evaluate(async () => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      if (typeof ctx?.getRequestHeaders !== 'function') return { ok: true };
      const pageToken = String(ctx.getRequestHeaders()?.['X-CSRF-Token'] ?? '');
      const response = await fetch('/csrf-token');
      const current = response.ok ? String((await response.json())?.token ?? '') : '';
      return { ok: Boolean(pageToken && current && pageToken === current), pageToken: Boolean(pageToken), currentToken: Boolean(current) };
    });
    if (!csrf.ok && !csrf.pageToken) throw new Error(`SillyTavern never received a CSRF token within ${timeout} ms; the page did not finish loading`);
    if (!csrf.ok) throw new Error('SillyTavern CSRF token is stale; reload the shared page before running a write or live gate');
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
