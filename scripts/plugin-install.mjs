import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage: node scripts/plugin-install.mjs [--st-root <path>] [--check]

Copies both Story Orchestrator server plugins into <ST root>/plugins/.
The ST root defaults to five levels above this extension (public/scripts/extensions/third-party/<ext>),
or ST_ROOT. ST loads it only with enableServerPlugins: true in config.yaml, after a restart.
--check reports whether the installed copy matches this one, without writing.`;

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const PLUGINS = {
    'story-orchestrator-judge': ['package.json', 'index.mjs'],
    'story-orchestrator-gpu': ['package.json', 'index.mjs', 'gate.mjs'],
};

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

const rows = Object.entries(PLUGINS).map(([name, files]) => {
    const source = path.join(extensionRoot, 'server-plugin', name);
    const target = path.join(stRoot, 'plugins', name);
    const upToDate = files.every((file) => fs.existsSync(path.join(target, file)) && fs.readFileSync(path.join(target, file), 'utf-8') === fs.readFileSync(path.join(source, file), 'utf-8'));
    return { name, source, target, files, installed: fs.existsSync(target), upToDate };
});

if (args.includes('--check')) {
    console.log(JSON.stringify({ stRoot, plugins: rows.map(({ name, target, installed, upToDate }) => ({ name, target, installed, upToDate })) }));
    process.exit(rows.every((row) => row.upToDate) ? 0 : 2);
}

for (const { source, target, files } of rows) {
    fs.mkdirSync(target, { recursive: true });
    for (const file of files) fs.copyFileSync(path.join(source, file), path.join(target, file));
}
const config = fs.existsSync(path.join(stRoot, 'config.yaml')) ? fs.readFileSync(path.join(stRoot, 'config.yaml'), 'utf-8') : '';
const enabled = /^enableServerPlugins:\s*true\s*$/m.test(config);
console.log(JSON.stringify({ stRoot, plugins: rows.map(({ name, files }) => ({ name, copied: files })), enableServerPlugins: enabled, restartNeeded: true }));
if (!enabled) console.log('enableServerPlugins is false in config.yaml: the plugin will not load until it is set to true and ST restarts.');
