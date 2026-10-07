// v2.8 plan 26: per-change reuse of defect-replay rows. A row is reused only when it was killed last
// time, its spec is unchanged, nothing outside src/ and docs/ changed, its mutated file did not change,
// none of its tests reads the tree through fs, and jest names none of its tests as related to a change.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPLAY_CACHE_VERSION = 1;

export const sha = (text) => createHash('sha1').update(text).digest('hex');

export const specHash = (spec) => sha(JSON.stringify({ ...spec, source: undefined }));

export function fileHashes(root, files) {
  const hashes = {};
  for (const path of files) {
    try {
      hashes[path] = sha(readFileSync(join(root, path)));
    } catch {
      continue;
    }
  }
  return hashes;
}

export function changedFiles(before = {}, after = {}) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter((path) => before[path] !== after[path]).sort();
}

const FS_READ = /from ["']node:fs["']|from ["']fs["']|require\(["'](node:)?fs["']\)/;

export const readsTree = (source) => FS_READ.test(source);

export const outsideSource = (changed) => changed.filter((path) => !path.startsWith('src/') && !path.startsWith('docs/'));

export function reusableRows({ cache, hashes, specs, related = new Set(), readsFiles = () => false }) {
  const reused = new Map();
  if (!cache || cache.version !== REPLAY_CACHE_VERSION) return { reused, reason: 'no cache' };
  const changed = changedFiles(cache.files, hashes);
  const outside = outsideSource(changed);
  if (outside.length) return { reused, reason: `changed outside src/: ${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ', ...' : ''}` };
  for (const spec of specs) {
    const row = cache.rows?.[spec.id];
    if (!row || row.verdict !== 'killed' || row.specHash !== specHash(spec)) continue;
    if (changed.includes(spec.file)) continue;
    if (spec.tests.some((test) => related.has(test) || readsFiles(test))) continue;
    reused.set(spec.id, row);
  }
  return { reused, reason: `${changed.length} file(s) changed` };
}

export function nextCache({ hashes, specs, rows }) {
  const byId = new Map(specs.map((spec) => [spec.id, spec]));
  const kept = {};
  for (const row of rows) {
    if (row.verdict !== 'killed' || !byId.has(row.id)) continue;
    kept[row.id] = { verdict: row.verdict, specHash: specHash(byId.get(row.id)), killedBy: row.killedBy, killedCount: row.killedCount, ms: row.ms };
  }
  return { version: REPLAY_CACHE_VERSION, files: hashes, rows: kept };
}

export function longestFirst(specs, cache) {
  const ms = (spec) => cache?.rows?.[spec.id]?.ms ?? Number.POSITIVE_INFINITY;
  return specs.map((spec, index) => ({ spec, index })).sort((a, b) => ms(b.spec) - ms(a.spec) || a.index - b.index).map(({ spec }) => spec);
}
