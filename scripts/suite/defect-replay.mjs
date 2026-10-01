#!/usr/bin/env node
// v2.6 plan 13 R2: re-introduce every historical defect in test/findings/defect-replay/ and require
// the suite to fail on each. This is the gate that makes pruning safe: a retired test is safe only
// while every replayed defect is still killed.
//
//   node scripts/suite/defect-replay.mjs [--only id,id] [--out report.json] [--list] [--full]
//
// Exit 0 only when the unmutated baseline passes and every mutant is killed by a failed assertion.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMutant, classifyJest, specProblems } from '../lib/suiteMutants.mjs';
import { failingTitles, runJest, stageCopy, withMutated } from '../lib/suiteStage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPECS = join(ROOT, 'test', 'findings', 'defect-replay');

export const replayScope = (spec, full) => (full ? [] : ['--runTestsByPath', ...spec.tests]);

export const loadSpecs = (dir = SPECS) => readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => ({ source: name, ...JSON.parse(readFileSync(join(dir, name), 'utf-8')) }));

const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

function main() {
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
  const dir = stageCopy(ROOT, 'defect-replay');
  if (process.argv.includes('--discover')) return discover(dir, specs);
  const full = process.argv.includes('--full');
  const union = [...new Set(specs.flatMap((spec) => spec.tests))].sort();
  console.log(`staged ${dir}; baseline over ${full ? 'the whole jest suite (--full)' : `${union.length} test file(s)`}`);
  const baseline = runJest(dir, full ? [] : ['--runTestsByPath', ...union]);
  if (classifyJest(baseline.result) !== 'survived') {
    console.error(`baseline is not green (${classifyJest(baseline.result)}): a kill could not be attributed to a mutant`);
    console.error(failingTitles(baseline.result).join('\n') || baseline.stderr.slice(-4000));
    return 1;
  }
  console.log(`baseline green: ${baseline.result.numPassedTests} tests, ${(baseline.ms / 1000).toFixed(1)}s`);
  const rows = [];
  for (const spec of specs) {
    const original = readFileSync(join(dir, spec.file), 'utf-8');
    const applied = applyMutant(original, spec);
    if (!applied.ok) {
      rows.push({ id: spec.id, verdict: 'did-not-apply', detail: applied.reason, ms: 0 });
      console.log(`${spec.id}: DID NOT APPLY (${applied.reason})`);
      continue;
    }
    const run = withMutated(dir, spec.file, applied.mutated, () => runJest(dir, replayScope(spec, full)));
    const verdict = run.timedOut ? 'timeout' : classifyJest(run.result);
    const killers = failingTitles(run.result);
    rows.push({ id: spec.id, verdict, ms: run.ms, killedBy: killers.slice(0, 10), killedCount: killers.length });
    console.log(`${spec.id}: ${verdict.toUpperCase()} (${killers.length} failing, ${(run.ms / 1000).toFixed(1)}s)${verdict === 'killed' ? `  e.g. ${killers[0]}` : ''}`);
  }
  const bad = rows.filter((row) => row.verdict !== 'killed');
  const report = { at: new Date().toISOString(), scope: full ? 'full' : 'named', baseline: { tests: baseline.result.numPassedTests, ms: baseline.ms }, mutants: rows.length, killed: rows.length - bad.length, rows };
  const out = arg('--out');
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`\ndefect replay: ${report.killed} of ${report.mutants} killed${bad.length ? `; NOT killed: ${bad.map((row) => `${row.id} (${row.verdict})`).join(', ')}` : ''}`);
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
if (fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === invoked) process.exitCode = main();
