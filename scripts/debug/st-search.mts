// Search SillyTavern host source code for patterns, definitions, and API surfaces.
//
// Uses ripgrep (rg) when available, falls back to Node.js fs + regex.
// Not a Playwright script — runs entirely in Node against the filesystem.

import { execFile } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { writeJSON } from './lib/output.mts';

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findDefaultSTRoot() {
  if (process.env.ST_ROOT) return resolve(process.env.ST_ROOT);
  let current = PROJECT_ROOT;
  for (let i = 0; i < 12; i += 1) {
    if (await pathExists(resolve(current, 'public', 'script.js'))) return current;
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return resolve(PROJECT_ROOT, '..', '..', '..', '..', '..');
}

const DEFAULT_GLOBS = '*.js,*.ts,*.mjs';
const MAX_RESULTS = 50;

interface SearchResult {
  file: string;
  line: number;
  text: string;
}

function parseFileGlobs(globStr) {
  return globStr.split(',').map((g) => g.trim()).filter(Boolean);
}

function rgSearch(pattern, { stRoot, globs, maxResults }): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const args = [
      '--json',
      '--max-count', String(maxResults),
      '--glob', '!node_modules',
      '--glob', '!.git',
    ];
    for (const g of parseFileGlobs(globs)) {
      args.push('--glob', g);
    }
    args.push(pattern, '.');

    execFile('rg', args, { cwd: stRoot, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code === 1 && !stderr) {
        resolve([]);
        return;
      }
      if (err) {
        reject(new Error(`rg failed: ${stderr || err.message}`));
        return;
      }
      const results: SearchResult[] = [];
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type !== 'match') continue;
          const data = obj.data;
          results.push({
            file: (data.path?.text?.replace(/^\.[\\/]/, '') ?? '').replace(/\\/g, '/'),
            line: data.line_number,
            text: data.lines?.text?.trimEnd() ?? '',
          });
        } catch {}
      }
      resolve(results.slice(0, maxResults));
    });
  });
}

async function walkDir(dir, exts, collected = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return collected; }
  for (const entry of entries) {
    const name = entry.name;
    if (name === 'node_modules' || name === '.git' || name === '.debug') continue;
    const full = join(dir, name);
    if (entry.isDirectory()) {
      await walkDir(full, exts, collected);
    } else if (exts.has(extname(name))) {
      collected.push(full);
    }
  }
  return collected;
}

async function fsSearch(pattern, { stRoot, globs, maxResults }): Promise<SearchResult[]> {
  const exts = new Set(parseFileGlobs(globs).map((g) => {
    const dot = g.lastIndexOf('.');
    return dot >= 0 ? g.slice(dot) : g;
  }));
  const files = await walkDir(stRoot, exts);
  const regex = new RegExp(pattern, 'i');
  const results: SearchResult[] = [];
  for (const file of files) {
    if (results.length >= maxResults) break;
    let content;
    try { content = await readFile(file, 'utf-8'); }
    catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push({
          file: relative(stRoot, file).replace(/\\/g, '/'),
          line: i + 1,
          text: lines[i].trimEnd(),
        });
        if (results.length >= maxResults) break;
      }
    }
  }
  return results;
}

async function hasRg() {
  return new Promise((resolve) => {
    execFile('rg', ['--version'], (err) => resolve(!err));
  });
}

export async function searchSTSource(pattern, {
  stRoot = null,
  files = DEFAULT_GLOBS,
  maxResults = MAX_RESULTS,
} = {}) {
  const opts = { stRoot: stRoot ? resolve(stRoot) : await findDefaultSTRoot(), globs: files, maxResults };
  if (await hasRg()) {
    return rgSearch(pattern, opts);
  }
  return fsSearch(pattern, opts);
}

export async function findEventTypes({ stRoot = null } = {}) {
  return searchSTSource('event_types\\.', { stRoot, files: '*.js,*.ts,*.mjs', maxResults: 100 });
}

export async function findEndpoints(pathPattern, { stRoot = null } = {}) {
  const pattern = pathPattern
    ? `(app|router)\\.(get|post|put|delete|patch)\\(.*${pathPattern}`
    : '(app|router)\\.(get|post|put|delete|patch)\\(';
  return searchSTSource(pattern, { stRoot, files: '*.js,*.ts,*.mjs', maxResults: 100 });
}

export async function findContextExports({ stRoot = null } = {}) {
  stRoot = stRoot ? resolve(stRoot) : await findDefaultSTRoot();
  const ctxPath = resolve(stRoot, 'public', 'scripts', 'st-context.js');
  const rel = relative(stRoot, ctxPath).replace(/\\/g, '/');
  const results = await searchSTSource('export ', { stRoot, files: 'st-context.js' });
  return results.filter((r) => r.file === rel || r.file.endsWith('/st-context.js'));
}

export async function findModuleExports(modulePath, { stRoot = null } = {}) {
  const glob = modulePath.includes('*') ? modulePath : modulePath.replace(/\\/g, '/').split('/').pop();
  return searchSTSource('^export ', { stRoot, files: glob });
}

function formatResults(results) {
  if (!results.length) return '(no matches)';
  return results.map((r) => `${r.file}:${r.line}: ${r.text}`).join('\n');
}

const PRESETS = new Set(['--event-types', '--endpoints', '--context-exports', '--module-exports']);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const args = process.argv.slice(2);
    let preset = null;
    let presetArg = null;
    let pattern = null;
    let files = DEFAULT_GLOBS;
    let stRoot = process.env.ST_ROOT ?? null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--files' && args[i + 1]) { files = args[++i]; continue; }
      if (args[i] === '--root' && args[i + 1]) { stRoot = args[++i]; continue; }
      if (PRESETS.has(args[i])) { preset = args[i]; presetArg = args[i + 1] ?? null; continue; }
      if (!pattern) pattern = args[i];
    }

    if (!preset && !pattern) {
      console.log('Usage: node st-search.mjs <pattern> [--files *.js,*.ts] [--root <path>]');
      console.log('Presets: --event-types  --endpoints [path]  --context-exports  --module-exports <file>');
      process.exitCode = 1;
      return;
    }

    try {
      let results;
      let label = 'st-search';
      if (preset === '--event-types') {
        results = await findEventTypes({ stRoot });
        label = 'st-search-events';
      } else if (preset === '--endpoints') {
        results = await findEndpoints(presetArg, { stRoot });
        label = 'st-search-endpoints';
      } else if (preset === '--context-exports') {
        results = await findContextExports({ stRoot });
        label = 'st-search-context';
      } else if (preset === '--module-exports') {
        if (!presetArg) { console.error('--module-exports requires a file argument.'); process.exitCode = 1; return; }
        results = await findModuleExports(presetArg, { stRoot });
        label = 'st-search-module';
      } else {
        results = await searchSTSource(pattern, { stRoot, files });
      }

      console.log(formatResults(results));
      console.log(`\n(${results.length} result${results.length === 1 ? '' : 's'})`);
      await writeJSON(results, label);
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    }
  })();
}
