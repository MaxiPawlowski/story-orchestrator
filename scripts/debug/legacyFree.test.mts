import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = 'scripts/debug/legacyFree.test.mts';
const BASELINE = join(ROOT, 'test', 'findings', 'legacy-baseline-scripts.json');

export const LEGACY_PATTERN = /legacy|migrat|OrHash|version\s*[!=]==\s*\d|selectedStoryHash|legacy-v2|v3-chat-blob|persistenceMigration/i;

interface AllowedHit { file: string; text: string; count: number; reason: string }
interface Spec { closed: boolean; baseline: Record<string, number>; allowlist: AllowedHit[] }

const walk = (dir: string, keep: (name: string) => boolean): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, keep);
    return keep(entry.name) ? [path] : [];
  });
};

const scanned = (): string[] => [
  ...walk(join(ROOT, 'scripts', 'debug'), (name) => name.endsWith('.mts')),
  ...walk(join(ROOT, 'scripts', 'release'), (name) => /\.(mjs|mts)$/.test(name)),
  ...walk(join(ROOT, 'test', 'fixtures'), () => true),
  ...walk(join(ROOT, 'test', 'scenarios'), () => true),
  ...walk(join(ROOT, 'test', 'journeys'), (name) => name.endsWith('.journey.json')).filter((path) => dirname(path) === join(ROOT, 'test', 'journeys')),
].map((path) => relative(ROOT, path).replace(/\\/g, '/')).filter((path) => path !== SELF).sort();

export const legacyHits = (text: string): string[] =>
  text.split(/\r?\n/).map((line) => line.trim()).filter((line) => LEGACY_PATTERN.test(line));

export function judgeLegacy(files: Record<string, string>, spec: Spec) {
  const unexpected: string[] = [];
  const stale: string[] = [];
  const allowlistDrift: string[] = [];
  const counts: Record<string, number> = {};
  for (const [file, text] of Object.entries(files)) {
    const hits = legacyHits(text);
    const allowed = spec.allowlist.filter((entry) => entry.file === file);
    const rest = hits.filter((hit) => !allowed.some((entry) => entry.text === hit)).length;
    for (const entry of allowed) {
      const seen = hits.filter((hit) => hit === entry.text).length;
      if (seen !== entry.count) allowlistDrift.push(`${file}: "${entry.text}" seen ${seen}, allowed exactly ${entry.count}`);
    }
    if (rest) counts[file] = rest;
  }
  for (const entry of spec.allowlist) if (!(entry.file in files)) allowlistDrift.push(`${entry.file}: allowlisted but not scanned`);
  for (const [file, count] of Object.entries(counts)) {
    const allowed = spec.baseline[file] ?? 0;
    if (count > allowed) unexpected.push(`${file}: ${count} hit(s), baseline ${allowed}`);
  }
  for (const [file, allowed] of Object.entries(spec.baseline)) {
    const count = counts[file] ?? 0;
    if (count < allowed) stale.push(`${file}: baseline ${allowed}, now ${count} (shrink the baseline)`);
  }
  return { unexpected, stale, allowlistDrift, remaining: spec.closed ? Object.keys(spec.baseline) : [] };
}

const spec = JSON.parse(readFileSync(BASELINE, 'utf8')) as Spec;
const files = Object.fromEntries(scanned().map((path) => [path, readFileSync(join(ROOT, path), 'utf8')]));
const verdict = judgeLegacy(files, spec);

test('S1 (scripts + test): no legacy hit outside the baseline and the allowlist', () => {
  assert.deepEqual(verdict.unexpected, []);
});

test('S1 (scripts + test): the baseline only shrinks', () => {
  assert.deepEqual(verdict.stale, []);
});

test('S1 (scripts + test): allowlisted lines match exactly, with exact counts', () => {
  assert.deepEqual(verdict.allowlistDrift, []);
});

test('S1 (scripts + test): a closed baseline is empty', () => {
  assert.deepEqual(verdict.remaining, []);
});

test('S1 (scripts + test): kept history is not scanned', () => {
  assert.equal(Object.keys(files).some((path) => /^(test\/journeys\/records|test\/findings\/mutations|scripts\/review|docs)\//.test(path)), false);
  assert.ok(Object.keys(files).length > 50);
});

test('control: a synthetic offender fails the scan', () => {
  const empty: Spec = { closed: false, baseline: {}, allowlist: [] };
  const offender = { 'test/scenarios/x.json': '{ "eval": "const id = blob.selectedStoryHash; if (blob.version !== 4) throw 1;" }\n{ "file": "../fixtures/v3-chat-blob.json" }' };
  assert.deepEqual(judgeLegacy(offender, empty).unexpected, ['test/scenarios/x.json: 2 hit(s), baseline 0']);
  assert.equal(judgeLegacy({ 'x.mts': 'clean' }, { ...empty, baseline: { 'x.mts': 1 } }).stale.length, 1);
  assert.deepEqual(judgeLegacy({}, { closed: true, baseline: { 'x.mts': 1 }, allowlist: [] }).remaining, ['x.mts']);
  const allowlist = [{ file: 'x.mts', text: 'const legacy = 1;', count: 1, reason: 'r' }];
  assert.equal(judgeLegacy({ 'x.mts': 'const legacy = 1;\nconst legacy = 1;' }, { ...empty, allowlist }).allowlistDrift.length, 1);
  assert.deepEqual(judgeLegacy({ 'x.mts': 'const legacy = 1;' }, { ...empty, allowlist }).unexpected, []);
  assert.deepEqual(judgeLegacy({ 'x.mts': 'const legacy = 1;\nconst legacyPath = 2;' }, { ...empty, allowlist }).unexpected, ['x.mts: 1 hit(s), baseline 0']);
});
