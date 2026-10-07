import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredStRoot, stRootIssue } from './lib/stRoot.mjs';
import { applyInstall, planInstall, selectedPlugins } from './lib/pluginInstall.mjs';

const USAGE = `Usage: node scripts/plugin-install.mjs [--st-root <path>] [--with gpu,media,harness] [--check]
       npm run plugins:install -- [--with gpu,media,harness] [--check]

Copies the judge plugin into <ST root>/plugins/. Add --with gpu,media,harness for the optional plugins.
An optional plugin already installed in <ST root>/plugins/ is always checked and kept in sync.
The ST root is ST_ROOT or the gitignored .st-root file. ST loads plugins only with
enableServerPlugins: true in config.yaml, after a restart.
Decided by content, never by version: every shipped file (tests, README.md and fixtures/ excluded) is compared
by sha256, and only the files that differ are copied. A plugin's local config.json is never touched.
--check reports, per plugin, which files differ, without writing; exit 2 when any do.`;

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
const rows = planInstall({ extensionRoot, stRoot, plugins: selectedPlugins(selected, { stRoot }) });
const report = (row) => ({ name: row.name, target: row.target, action: row.action, ...(row.differs.length ? { differs: row.differs } : {}), ...(row.copied ? { copied: row.copied } : {}) });

if (args.includes('--check')) {
    console.log(JSON.stringify({ stRoot, plugins: rows.map(report) }));
    process.exit(rows.every((row) => row.upToDate) ? 0 : 2);
}

const applied = applyInstall(rows);
const config = fs.existsSync(path.join(stRoot, 'config.yaml')) ? fs.readFileSync(path.join(stRoot, 'config.yaml'), 'utf-8') : '';
const enabled = /^enableServerPlugins:\s*true\s*$/m.test(config);
const changed = applied.some((row) => row.copied.length);
console.log(JSON.stringify({ stRoot, plugins: applied.map(report), enableServerPlugins: enabled, restartNeeded: changed }));
if (!enabled) console.log('enableServerPlugins is false in config.yaml: the plugins will not load until it is set to true and ST restarts.');
