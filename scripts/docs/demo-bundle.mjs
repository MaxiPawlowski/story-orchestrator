import { build } from 'esbuild';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE = `Usage: node scripts/docs/demo-bundle.mjs [demo|rig|all]
  demo  docs/guide/showcase/animated-character/demo.js (+ demo.css): the live-head demo page bundle
  rig   .build/demo-art/rig-build.js: in-browser rig synthesis used by scripts/docs/demo-rigs.mjs
Separate from the extension's webpack build; nothing here enters dist/.`;

const shared = {
    bundle: true,
    format: 'iife',
    target: ['chrome110', 'firefox115', 'safari16'],
    tsconfig: path.join(root, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.json': 'json' },
    legalComments: 'none',
    logLevel: 'warning',
};

const targets = {
    demo: { ...shared, entryPoints: [path.join(root, 'src/sprites/showcase/demoEntry.tsx')], outfile: path.join(root, 'docs/guide/showcase/animated-character/demo.js'), minify: true, jsx: 'automatic' },
    rig: { ...shared, entryPoints: [path.join(root, 'src/sprites/showcase/rigBuild.ts')], outfile: path.join(root, '.build/demo-art/rig-build.js'), minify: false },
};

const which = process.argv[2] ?? 'all';
if (!['demo', 'rig', 'all'].includes(which)) { console.error(USAGE); process.exit(2); }
for (const [name, options] of Object.entries(targets)) {
    if (which !== 'all' && which !== name) continue;
    await mkdir(path.dirname(options.outfile), { recursive: true });
    await build(options);
    console.log(`${name}: ${path.relative(root, options.outfile)} ${(await stat(options.outfile)).size} B`);
}
