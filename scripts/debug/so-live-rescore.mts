import { register } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventoryFixture, rescoreRecord, summarizeInventory, type LiveTiers, type RecordedFixture } from './lib/needleInventory.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX_DIR = join(ROOT, 'test/fixtures');
const OUT_DIR = join(ROOT, 'test/goldens/live/rescore');

const USAGE = `Usage: node --experimental-transform-types scripts/debug/so-live-rescore.mts <inventory|rescore> [dir] [--out <file>] [--check]
  (or: node scripts/debug/so-live-suite.mts inventory|rescore ..., which adds the flag)

  inventory   every live-suite needle against the recorded live answer in [dir] (default test/goldens/live):
              term | prefix | substring-only | absent | unrecorded, with its declared mode. --check exits 1
              when a prefix-dependent needle is not declared prefix in its fixture.
  rescore     re-scores every recorded golden under scorer v1 and the current version; writes a NEW record
              (default test/goldens/live/rescore/scorer-v<version>.json) and refuses to overwrite one.
  Offline: no ST, no model.`;

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

const argValue = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
};

async function loadRecorded(dir: string): Promise<RecordedFixture[]> {
  register(pathToFileURL(join(ROOT, 'scripts/spike/typesafe/lib/loader.mts')).href);
  const load = (path: string) => import(pathToFileURL(join(ROOT, path)).href);
  const { buildFixtureRun } = await load('src/extraction/fixtureRun.ts');
  const { parseSharedReadResponse } = await load('src/extraction/parse.ts');
  const { liveReadTiers } = await load('src/extraction/liveTiers.ts');
  const names = readdirSync(FIX_DIR).filter((file) => /^extractor.*\.story\.json$/.test(file)).map((file) => file.replace(/\.story\.json$/, '')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return names.flatMap((name) => {
    const expectedPath = join(FIX_DIR, `${name}.expected.json`);
    const transcriptPath = join(FIX_DIR, `${name}.transcript.json`);
    if (!existsSync(expectedPath) || !existsSync(transcriptPath)) return [];
    const expected = readJson(expectedPath);
    const transcript = readJson(transcriptPath) as Array<{ index: number; speaker: string; text: string; is_user?: boolean }>;
    const players = transcript.filter((entry) => entry.is_user === true).map((entry) => entry.speaker);
    const responsePath = join(dir, `${name}.response.txt`);
    if (!existsSync(responsePath)) return [{ name, expected, players, live: null }];
    const spec = (expected.spec ?? {}) as { blackboard?: { values?: Record<string, unknown> } };
    const run = buildFixtureRun({ story: readJson(join(FIX_DIR, `${name}.story.json`)), transcript, ...spec });
    const parsed = parseSharedReadResponse(readFileSync(responsePath, 'utf-8'), run.story, spec.blackboard?.values ?? {});
    return [{ name, expected, players, live: liveReadTiers(parsed) as LiveTiers }];
  });
}

const writeNew = (path: string, value: unknown) => {
  if (existsSync(path)) throw new Error(`${relative(ROOT, path)} exists; a re-score never overwrites a record (pass a new --out)`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

async function main() {
  const command = process.argv[2];
  if (command !== 'inventory' && command !== 'rescore') {
    console.log(USAGE);
    process.exit(command ? 2 : 0);
  }
  const positional = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'test/goldens/live';
  const dir = resolve(ROOT, positional);
  const fixtures = await loadRecorded(dir);
  if (command === 'inventory') {
    const rows = fixtures.flatMap(inventoryFixture);
    const summary = summarizeInventory(fixtures, rows);
    const out = argValue('--out');
    const report = { kind: 'live-suite-needle-inventory', source: relative(ROOT, dir).split('\\').join('/'), summary: { ...summary, prefixDependent: summary.prefixDependent.length, substringOnly: summary.substringOnly.length, undeclaredPrefix: summary.undeclaredPrefix.length }, prefixDependent: summary.prefixDependent, substringOnly: summary.substringOnly, rows };
    if (out) {
      mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
      writeFileSync(resolve(ROOT, out), `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify(report.summary, null, 2));
    for (const row of summary.prefixDependent) console.log(`prefix ${row.fixture}.${row.tier} ${row.kind} "${row.needle}" declared=${row.declared ?? 'term'}`);
    for (const row of summary.substringOnly) console.log(`substring-only ${row.fixture}.${row.tier} ${row.kind} "${row.needle}"`);
    if (process.argv.includes('--check') && summary.undeclaredPrefix.length) process.exit(1);
    return;
  }
  const record = rescoreRecord(fixtures, relative(ROOT, dir).split('\\').join('/'), new Date().toISOString());
  const out = resolve(ROOT, argValue('--out') ?? join(OUT_DIR, `scorer-v${record.scorerVersion}.json`));
  writeNew(out, record);
  console.log(`rescored ${record.fixtures.length} recorded fixture(s) under scorer v${record.fromScorerVersion} -> v${record.scorerVersion}; ${record.changed.length} changed verdict(s); unrecorded: ${record.unrecorded.length}`);
  for (const row of record.changed) console.log(`changed ${row.fixture}.${row.tier}: v1 ${row.v1 ? 'pass' : 'fail'} -> v${record.scorerVersion} ${row.v2 ? 'pass' : 'fail'}`);
  console.log(`record: ${relative(ROOT, out)}`);
}

await main();
