import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage: node scripts/plugin-install.mjs [--st-root <path>] [--check]

Copies server-plugin/story-orchestrator-judge into <ST root>/plugins/story-orchestrator-judge.
The ST root defaults to five levels above this extension (public/scripts/extensions/third-party/<ext>),
or ST_ROOT. ST loads it only with enableServerPlugins: true in config.yaml, after a restart.
--check reports whether the installed copy matches this one, without writing.`;

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const source = path.join(extensionRoot, 'server-plugin', 'story-orchestrator-judge');
const FILES = ['package.json', 'index.mjs'];

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
}
const rootFlag = args.indexOf('--st-root');
const stRoot = path.resolve(rootFlag >= 0 ? args[rootFlag + 1] : process.env.ST_ROOT ?? path.resolve(extensionRoot, '..', '..', '..', '..', '..'));

if (!fs.existsSync(path.join(stRoot, 'src', 'plugin-loader.js'))) {
    console.error(`Not a SillyTavern root (no src/plugin-loader.js): ${stRoot}\n\n${USAGE}`);
    process.exit(1);
}

const target = path.join(stRoot, 'plugins', 'story-orchestrator-judge');
const same = FILES.every((file) => fs.existsSync(path.join(target, file)) && fs.readFileSync(path.join(target, file), 'utf-8') === fs.readFileSync(path.join(source, file), 'utf-8'));

if (args.includes('--check')) {
    console.log(JSON.stringify({ stRoot, target, installed: fs.existsSync(target), upToDate: same }));
    process.exit(same ? 0 : 2);
}

fs.mkdirSync(target, { recursive: true });
for (const file of FILES) fs.copyFileSync(path.join(source, file), path.join(target, file));
const config = fs.existsSync(path.join(stRoot, 'config.yaml')) ? fs.readFileSync(path.join(stRoot, 'config.yaml'), 'utf-8') : '';
const enabled = /^enableServerPlugins:\s*true\s*$/m.test(config);
console.log(JSON.stringify({ stRoot, target, copied: FILES, enableServerPlugins: enabled, restartNeeded: true }));
if (!enabled) console.log('enableServerPlugins is false in config.yaml: the plugin will not load until it is set to true and ST restarts.');
