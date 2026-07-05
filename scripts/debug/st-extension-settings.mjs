// Dump extension settings from SillyTavern's getContext().extensionSettings.
//
// Defaults to the "story-orchestrator" extension. Pass an extension name
// to inspect any other extension, or null/undefined for the full map.

import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';

export async function dumpExtensionSettings(page, extensionName = 'story-orchestrator') {
  return evaluateInST(page, (extName) => {
    const ctx = SillyTavern.getContext();
    const settings = ctx.extensionSettings;
    if (!settings) return null;
    if (extName) {
      return settings[extName] ?? null;
    }
    const summary = {};
    for (const [key, val] of Object.entries(settings)) {
      if (val && typeof val === 'object') {
        summary[key] = { _keys: Object.keys(val), _type: 'object' };
      } else {
        summary[key] = val;
      }
    }
    return summary;
  }, extensionName);
}

const USAGE = `Usage: node st-extension-settings.mjs [extensionName|--all]

No args: print story-orchestrator settings.
With a name: print that extension's settings.
--all: print summary of all extension settings.`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  (async () => {
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);

      const extName = process.argv[2] || 'story-orchestrator';
      const useAll = extName === '--all';
      const data = useAll
        ? await dumpExtensionSettings(page, null)
        : await dumpExtensionSettings(page, extName);

      console.log(JSON.stringify(data, null, 2));
      const label = useAll ? 'extension-settings-all' : `extension-settings-${extName}`;
      await writeJSON(data, label);
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
