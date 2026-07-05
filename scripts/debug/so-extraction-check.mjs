import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { runScenario } from './so-scenario.mjs';

export async function runExtractionCheck(page) {
  return runScenario(page, 'test/scenarios/plan03-extraction.json', { sandbox: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);
      const result = await runExtractionCheck(page);
      if (!result.ok) process.exitCode = 1;
    } catch (err) {
      console.error('Error:', err.message || String(err));
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
