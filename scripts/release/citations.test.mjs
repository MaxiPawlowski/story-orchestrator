import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citedPaths, debugCitationsInReplanRecords, docFiles, missingCitations } from './citations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const known = JSON.parse(readFileSync(join(ROOT, 'scripts/release/citations-known.json'), 'utf-8')).known;

test('every cited repo path exists, or is a listed absence with a reason (rule 11)', () => {
  const listed = new Set(known.map((entry) => entry.path));
  const unlisted = missingCitations(ROOT).filter((entry) => !listed.has(entry.path));
  assert.deepEqual(unlisted, []);
});

test('a listed absence that now exists, or that no document cites, fails, so the list cannot rot', () => {
  const cited = new Set(docFiles(ROOT).flatMap((file) => citedPaths(readFileSync(join(ROOT, file), 'utf-8'))));
  assert.deepEqual(known.filter((entry) => existsSync(join(ROOT, entry.path))).map((entry) => entry.path), []);
  assert.deepEqual(known.filter((entry) => !cited.has(entry.path)).map((entry) => entry.path), []);
  for (const entry of known) assert.ok(entry.kind && entry.reason, `${entry.path} needs a kind and a reason`);
});

test('no gate record written since the replan cites .debug/, which rotates', () => {
  const hits = docFiles(ROOT).flatMap((file) => debugCitationsInReplanRecords(readFileSync(join(ROOT, file), 'utf-8')).map((path) => `${file}: ${path}`));
  assert.deepEqual(hits, []);
});

test('the citation reader: records/ shorthand, line suffixes, braces, anchors, and non-paths', () => {
  const text = [
    '`records/v2.3-replan/V20e/j0-run1.log`',
    '`src/runtime/journal.ts:69`',
    '`src/services/stHost/presets.ts:4–17,:67`',
    '`test/journeys/records/v2.3-plan03/run2.{json,log}`',
    '`docs/plans/v2.3/00-overview.md#replan`',
    '`scripts/debug/so-journey.mts run J0`',
    '`src/<name>/*`',
    '`npm run build`',
  ].join(' ');
  assert.deepEqual(citedPaths(text), [
    'test/journeys/records/v2.3-replan/V20e/j0-run1.log',
    'src/runtime/journal.ts',
    'src/services/stHost/presets.ts',
    'test/journeys/records/v2.3-plan03/run2.json',
    'test/journeys/records/v2.3-plan03/run2.log',
    'docs/plans/v2.3/00-overview.md',
    'scripts/debug/so-journey.mts',
  ]);
  const record = '### V9 gate (2026-09-23)\n- saw `.debug/x.json`; the rule names `.debug/` itself\n### Audit\n- old `.debug/y.json`';
  assert.deepEqual(debugCitationsInReplanRecords(record), ['.debug/x.json']);
});
