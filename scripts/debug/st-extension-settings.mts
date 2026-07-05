// Dump extension settings from SillyTavern's getContext().extensionSettings.
//
// Defaults to the "story-orchestrator" extension. Pass an extension name
// to inspect any other extension, or null/undefined for the full map.

import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

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
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    const extName = process.argv[2] || 'story-orchestrator';
    const useAll = extName === '--all';
    const data = useAll
      ? await dumpExtensionSettings(page, null)
      : await dumpExtensionSettings(page, extName);

    console.log(JSON.stringify(data, null, 2));
    const label = useAll ? 'extension-settings-all' : `extension-settings-${extName}`;
    await writeJSON(data, label);
  });
}
