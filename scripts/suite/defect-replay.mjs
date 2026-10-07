#!/usr/bin/env node
// v2.6 plan 13 R2: re-introduce every historical defect in test/findings/defect-replay/ and require
// the suite to fail on each. This is the gate that makes pruning safe: a retired test is safe only
// while every replayed defect is still killed.
//
//   node scripts/suite/defect-replay.mjs [--only id,id] [--out report.json] [--list] [--full] [--workers n] [--cached]
//
// Mutants run in parallel, one staged copy per worker (v2.8 plan 26). --cached reuses rows killed last
// time that no change since can reach (scripts/lib/suiteReplayCache.mjs): per-change runs only, never
// the plan-close or release gate. Every complete run refreshes the cache.
//
// Exit 0 only when the unmutated baseline passes and every mutant is killed by a failed assertion.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyMutant, classifyJest, specProblems } from '../lib/suiteMutants.mjs';
import { failingTitles, runJest, runJestAsync, stageCopies, stageCopy, trackedFiles, withMutated, withMutatedAsync } from '../lib/suiteStage.mjs';
import { changedFiles, fileHashes, longestFirst, nextCache, readsTree, reusableRows } from '../lib/suiteReplayCache.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPECS = join(ROOT, 'test', 'findings', 'defect-replay');
const CACHE = join(ROOT, '.build', 'defect-replay-cache.json');

export const replayScope = (spec, full) => (full ? [] : ['--runTestsByPath', ...spec.tests]);

export const defaultWorkers = (cores = availableParallelism()) => Math.max(1, Math.min(8, Math.floor(cores / 2)));

export const replayVerdict = (run) => (run.timedOut ? 'timeout' : classifyJest(run.result));

export const loadSpecs = (dir = SPECS) => readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => ({ source: name, ...JSON.parse(readFileSync(join(dir, name), 'utf-8')) }));

const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

const readCache = () => {
  try {
    return existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf-8')) : null;
  } catch {
    return null;
  }
};

function relatedTests(dir, changed) {
  const sources = changed.filter((path) => path.startsWith('src/'));
  if (!sources.length) return new Set();
  const run = spawnSync(process.execPath, [join(dir, 'node_modules', 'jest', 'bin', 'jest.js'), '--listTests', '--findRelatedTests', ...sources], { cwd: dir, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`jest --listTests failed: ${(run.stderr ?? '').slice(-2000)}`);
  return new Set(run.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((path) => path.replace(/\\/g, '/')).map((path) => path.slice(path.indexOf('/src/') + 1)));
}

async function runPool(dirs, specs, full, first) {
  const rows = new Map();
  let next = 0;
  const worker = async (dir, index) => {
    if (index === 0 && first) await first(dir);
    while (next < specs.length) {
      const spec = specs[next];
      next += 1;
      const applied = applyMutant(readFileSync(join(dir, spec.file), 'utf-8'), spec);
      if (!applied.ok) {
        rows.set(spec.id, { id: spec.id, verdict: 'did-not-apply', detail: applied.reason, ms: 0 });
        console.log(`${spec.id}: DID NOT APPLY (${applied.reason})`);
        continue;
      }
      const run = await withMutatedAsync(dir, spec.file, applied.mutated, () => runJestAsync(dir, replayScope(spec, full), { timeoutMs: 10 * 60 * 1000 }));
      const verdict = replayVerdict(run);
      const killers = failingTitles(run.result);
      rows.set(spec.id, { id: spec.id, verdict, ms: run.ms, killedBy: killers.slice(0, 10), killedCount: killers.length });
      console.log(`${spec.id}: ${verdict.toUpperCase()} (${killers.length} failing, ${(run.ms / 1000).toFixed(1)}s)${verdict === 'killed' ? `  e.g. ${killers[0]}` : ''}`);
    }
  };
  await Promise.all(dirs.map((dir, index) => worker(dir, index)));
  return rows;
}

async function main() {
  const started = Date.now();
  const only = arg('--only')?.split(',').map((id) => id.trim()).filter(Boolean);
  const specs = loadSpecs().filter((spec) => !only || only.includes(spec.id));
  if (process.argv.includes('--list')) {
    for (const spec of specs) console.log(`${spec.id.padEnd(40)} ${spec.file}  <- ${spec.tests.join(', ')}`);
    return 0;
  }
  const invalid = specs.flatMap((spec) => specProblems(spec, ROOT).map((problem) => `${spec.source}: ${problem}`));
  if (invalid.length) {
    console.error(invalid.join('\n'));
    return 2;
  }
  const files = trackedFiles(ROOT);
  if (process.argv.includes('--discover')) return discover(stageCopy(ROOT, 'defect-replay', files), specs);
  const full = process.argv.includes('--full');
  const cached = process.argv.includes('--cached') && !full;
  const hashes = fileHashes(ROOT, files);
  const workers = Math.max(1, Math.min(specs.length, (Number(arg('--workers') ?? process.env.SO_REPLAY_WORKERS) || defaultWorkers())));
  const dirs = (await stageCopies(ROOT, Array.from({ length: workers }, (_, index) => `defect-replay-w${index}`), files)).map((staged) => staged.dir);
  const cache = readCache();
  let reused = new Map();
  if (cached) {
    const reading = reusableRows({ cache, hashes, specs, related: relatedTests(dirs[0], changedFiles(cache?.files, hashes)), readsFiles: (test) => readsTree(readFileSync(join(ROOT, test), 'utf-8')) });
    reused = reading.reused;
    console.log(`--cached: ${reading.reason}; reusing ${reused.size} of ${specs.length} row(s)`);
  }
  const torun = longestFirst(specs.filter((spec) => !reused.has(spec.id)), cache);
  const union = [...new Set(torun.flatMap((spec) => spec.tests))].sort();
  console.log(`staged ${workers} cop${workers === 1 ? 'y' : 'ies'} in ${((Date.now() - started) / 1000).toFixed(1)}s (${dirs[0]}); baseline over ${full ? 'the whole jest suite (--full)' : `${union.length} test file(s)`}`);
  let baseline = { result: { success: true, numPassedTests: 0, numTotalTests: 1 }, ms: 0, stderr: '' };
  const runBaseline = async (dir) => {
    baseline = await runJestAsync(dir, [...(full ? [] : ['--runTestsByPath', ...union]), '--maxWorkers=2'], { inBand: false, timeoutMs: 20 * 60 * 1000 });
    if (classifyJest(baseline.result) === 'survived') console.log(`baseline green: ${baseline.result.numPassedTests} tests, ${(baseline.ms / 1000).toFixed(1)}s`);
  };
  const ran = await runPool(dirs, torun, full, torun.length ? runBaseline : null);
  if (classifyJest(baseline.result) !== 'survived') {
    console.error(`baseline is not green (${classifyJest(baseline.result)}): a kill could not be attributed to a mutant`);
    console.error(failingTitles(baseline.result).join('\n') || baseline.stderr.slice(-4000));
    return 1;
  }
  const rows = specs.map((spec) => (reused.has(spec.id) ? { id: spec.id, ...reused.get(spec.id), cached: true } : ran.get(spec.id)));
  const bad = rows.filter((row) => row.verdict !== 'killed');
  const report = { at: new Date().toISOString(), scope: full ? 'full' : 'named', workers, wallMs: Date.now() - started, baseline: { tests: baseline.result.numPassedTests, ms: baseline.ms }, mutants: rows.length, killed: rows.length - bad.length, reused: reused.size, rows };
  const out = arg('--out');
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  if (!full && !only) {
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, `${JSON.stringify(nextCache({ hashes, specs, rows }))}\n`, 'utf-8');
  }
  console.log(`\ndefect replay: ${report.killed} of ${report.mutants} killed${reused.size ? ` (${reused.size} reused from the cache)` : ''} in ${(report.wallMs / 1000).toFixed(1)}s${bad.length ? `; NOT killed: ${bad.map((row) => `${row.id} (${row.verdict})`).join(', ')}` : ''}`);
  return bad.length ? 1 : 0;
}

// --discover: run every test related to the mutated file and name the files that failed, which is
// how a spec's `tests` list is chosen (and how a mutant nothing kills is found).
function discover(dir, specs) {
  for (const spec of specs) {
    const applied = applyMutant(readFileSync(join(dir, spec.file), 'utf-8'), spec);
    if (!applied.ok) { console.log(`${spec.id}: DID NOT APPLY (${applied.reason})`); continue; }
    const run = withMutated(dir, spec.file, applied.mutated, () => runJest(dir, ['--findRelatedTests', spec.file]));
    const failedFiles = (run.result?.testResults ?? []).filter((suite) => (suite.assertionResults ?? []).some((test) => test.status === 'failed')).map((suite) => suite.name.slice(dir.length + 1).replace(/\\/g, '/'));
    console.log(`${spec.id}: ${classifyJest(run.result)} over ${run.result?.numTotalTestSuites ?? '?'} related suites (${(run.ms / 1000).toFixed(1)}s)${failedFiles.length ? `\n  killers: ${failedFiles.join(', ')}` : ''}`);
  }
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, '/').toLowerCase() : '';
if (fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === invoked) process.exitCode = await main();
