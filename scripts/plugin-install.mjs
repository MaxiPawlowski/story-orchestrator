import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredStRoot, stRootIssue } from './lib/stRoot.mjs';
import { applyInstall, planInstall, selectedPlugins } from './lib/pluginInstall.mjs';

const USAGE = `Usage: node scripts/plugin-install.mjs [--st-root <path>] [--check] [--force]
       npm run plugins:install -- [--check] [--force]

Copies the judge plugin into <ST root>/plugins/. Add --with gpu,media,harness for optional plugins.
The ST root is ST_ROOT or the gitignored .st-root file. ST loads plugins only with
enableServerPlugins: true in config.yaml, after a restart.
Idempotent: a plugin whose files already match is left alone. An installed plugin
with a NEWER version than this checkout is refused unless --force.
--check reports each plugin's installed and source version and what an install would do, without writing.`;

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
}
const rootFlag = args.indexOf('--st-root');
const stRoot = rootFlag >= 0 ? path.resolve(args[rootFlag + 1]) : configuredStRoot(process.env, extensionRoot);
if (!stRoot) {
    console.error(`${stRootIssue(null)}\n\n${USAGE}`);
    process.exit(1);
}

if (!fs.existsSync(path.join(stRoot, 'src', 'plugin-loader.js'))) {
    console.error(`Not a SillyTavern root (no src/plugin-loader.js): ${stRoot}\n\n${USAGE}`);
    process.exit(1);
}

const withFlag = args.indexOf('--with');
const selected = withFlag < 0 ? [] : (args[withFlag + 1] ?? '').split(',').filter(Boolean);
if (withFlag >= 0 && !selected.length) throw new Error('--with needs gpu, media or harness.');
const rows = planInstall({ extensionRoot, stRoot, plugins: selectedPlugins(selected) });
const report = (row) => ({ name: row.name, target: row.target, installedVersion: row.installedVersion, sourceVersion: row.sourceVersion, action: row.action, ...(row.copied ? { copied: row.copied } : {}) });

if (args.includes('--check')) {
    console.log(JSON.stringify({ stRoot, plugins: rows.map(report) }));
    process.exit(rows.every((row) => row.upToDate) ? 0 : 2);
}

const applied = applyInstall(rows, { force: args.includes('--force') });
const config = fs.existsSync(path.join(stRoot, 'config.yaml')) ? fs.readFileSync(path.join(stRoot, 'config.yaml'), 'utf-8') : '';
const enabled = /^enableServerPlugins:\s*true\s*$/m.test(config);
const changed = applied.some((row) => row.copied.length);
console.log(JSON.stringify({ stRoot, plugins: applied.map(report), enableServerPlugins: enabled, restartNeeded: changed }));
if (!enabled) console.log('enableServerPlugins is false in config.yaml: the plugins will not load until it is set to true and ST restarts.');
const refused = applied.filter((row) => row.action === 'refuse-downgrade' && !row.copied.length);
if (refused.length) {
    console.error(`Refused to downgrade ${refused.map((row) => `${row.name} ${row.installedVersion} -> ${row.sourceVersion}`).join(', ')}; pass --force to install this checkout's copy anyway.`);
    process.exit(3);
}
