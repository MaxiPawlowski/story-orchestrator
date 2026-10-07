import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const out = resolve('test/measurements/v2.7/saga-main-cast');
const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8')).filter((row) => row.blink && row.talk);
const webpack = require('webpack');
const config = require('../../webpack.config.js')({}, { mode: 'production' });
await new Promise<void>((done, reject) => {
  const compiler = webpack({ mode: 'production', target: 'web', entry: resolve('scripts/debug/lib/sagaSpritePlayer.jsx'),
    output: { path: out, filename: 'player.js' }, resolve: config.resolve, module: config.module,
    optimization: { minimize: true }, performance: { hints: false } });
  compiler.run((error, stats) => compiler.close(() => error || stats?.hasErrors() ? reject(error ?? new Error(stats.toString())) : done()));
});
const script = (await readFile(resolve(out, 'player.js'), 'utf8')).replace(/<\/script/gi, '<\\/script');
const id = createHash('sha256').update(JSON.stringify(samples)).digest('hex');
const data = JSON.stringify({ id, samples }).replace(/</g, '\\u003c');
await writeFile(resolve(out, 'index.html'), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Saga — sprites</title>
<style>body{margin:0;background:#18212c;color:#eef2f6;font:16px system-ui}main{max-width:1100px;margin:auto;padding:20px}label{display:block;margin:14px 0}button,select{font:inherit;padding:10px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panels section{background:#263545;text-align:center;border-radius:10px}.portrait{position:relative;height:520px;overflow:hidden}.zoom{position:absolute;inset:0;transform-origin:50% 15%}.portrait img{position:absolute;width:100%;height:100%;inset:0;object-fit:contain}@media(max-width:650px){.panels{grid-template-columns:1fr}.portrait{height:400px}}</style>
<div id="root"></div><script id="pack-data" type="application/json">${data}</script><script>${script}</script></html>`);
console.log(JSON.stringify({ file: resolve(out, 'index.html'), expressions: samples.length, characters: new Set(samples.map((row) => row.name)).size }));
