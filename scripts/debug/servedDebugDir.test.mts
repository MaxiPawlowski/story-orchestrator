import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PROJECT_ROOT } from './lib/connection.mts';

const HARDCODED = /(?:join|resolve)\([^;\n]*?['"`]\.debug(?:\/[^'"`]*)?['"`]/g;

const scriptFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : scriptFiles(path);
  return /\.(mts|mjs)$/.test(entry.name) && !/\.test\.(mts|mjs)$/.test(entry.name) ? [path] : [];
});

export const hardcodedDebugPaths = (files: Array<{ path: string; text: string }>) =>
  files.flatMap(({ path, text }) => [...text.matchAll(HARDCODED)].map((match) => `${path}: ${match[0]}`));

test('v2.5 plan 12 P3: no script builds a path into the served .debug/ instead of the debug dir', () => {
  const files = scriptFiles(join(PROJECT_ROOT, 'scripts')).map((path) => ({ path: relative(PROJECT_ROOT, path), text: readFileSync(path, 'utf-8') }));
  assert.ok(files.length > 50);
  assert.deepEqual(hardcodedDebugPaths(files), []);
});

test('control: planted .debug joins are caught, the debug dir and prose are not', () => {
  const text = [
    "const a = join(PROJECT_ROOT, '.debug', 'x');",
    "const b = resolve(process.cwd(), argValue('--out', '.debug/out.jsonl'));",
    "const c = resolve(DEBUG_DIR, 'x.json');",
    "console.log('writes .debug/x.json');",
  ].join('\n');
  assert.equal(hardcodedDebugPaths([{ path: 'p.mts', text }]).length, 2);
});
