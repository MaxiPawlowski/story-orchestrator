#!/usr/bin/env node
// v2.6 plan 13 R2: a sampled mutation score over the pure modules. Each mutant is applied in its own
// staged copy of the tree and judged by `jest --findRelatedTests <file> --bail`: killed when an
// assertion fails, survived when every related test passes. Crashes and timeouts are reported, never
// scored. Same --seed and --sample = the same mutants, so a post-prune run is comparable.
//
//   node scripts/suite/mutation-baseline.mjs [--sample 300] [--seed 20260930] [--workers 4] [--out file.json] [--dirs engine,memory]
//   node scripts/suite/mutation-baseline.mjs --count          (enumerate only, no runs)
//   node scripts/suite/mutation-baseline.mjs --attribute ...  (no --bail: records each mutant's related and killing test files)
//   node scripts/suite/mutation-baseline.mjs --review <report.json> [--min-faced 3]   (offline: tests that killed no mutant, survivors)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { classifyRun, importsModule, mutationScore, noKillTests, relativeTest, stratifiedSample, testAttribution } from '../lib/suiteMutants.mjs';
import { applyAt, mutantsOf } from '../lib/suiteMutantGen.mjs';
import { jestCacheDir, runJestAsync, stageCopy } from '../lib/suiteStage.mjs';
import { withStages } from './defect-replay.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PURE_TIER = ['engine', 'memory', 'extraction', 'judge', 'talk', 'pacing'];
const HOST = /@services\/|services\/STAPI|stHost\//;

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

export function pureFiles(root, dirs = PURE_TIER) {
  const listed = spawnSync('git', ['ls-files', ...dirs.map((dir) => `src/${dir}`)], { cwd: root, encoding: 'utf-8' }).stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  return listed.filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts') && !path.endsWith('.stories.tsx') && !HOST.test(readFileSync(join(root, path), 'utf-8')));
}

export function reviewReport(report, minFaced = 3, readSource = (file) => readFileSync(join(ROOT, file), 'utf-8')) {
  const normal = (list) => (list ?? []).map((file) => relativeTest(file, ''));
  const attributed = report.outcomes.filter((row) => Array.isArray(row.related)).map((row) => ({ ...row, related: normal(row.related), killers: normal(row.killers) }));
  const sources = new Map();
  const source = (file) => {
    if (!sources.has(file)) { try { sources.set(file, readSource(file)); } catch { sources.set(file, ''); } }
    return sources.get(file);
  };
  const survivors = report.outcomes.filter((row) => row.verdict === 'survived').map((row) => `${row.file}:${row.line} ${row.operator} ${JSON.stringify(row.original)} -> ${JSON.stringify(row.replacement)}`);
  return { attributed: attributed.length, of: report.outcomes.length, ...noKillTests(attributed, minFaced, (test, mutated) => importsModule(source(test), test, mutated)), survivors };
}

function review(file, minFaced) {
  const result = reviewReport(JSON.parse(readFileSync(file, 'utf-8')), minFaced);
  if (!result.attributed) { console.log(`${file} has no attributed outcome; re-run with --attribute`); return 1; }
  console.log(`${result.attributed} of ${result.of} mutants attributed; ${result.tests} test files import a mutated module directly, ${result.killing} of them killed at least one`);
  console.log(`no kill while facing >= ${minFaced} scored mutants of a module they import (${result.noKill.length}):`);
  for (const row of result.noKill) console.log(`  ${row.file} (faced ${row.faced})`);
  console.log(`${result.thin} more killed none but faced fewer than ${minFaced}: not enough evidence to cut`);
  console.log(`survivors (${result.survivors.length}):`);
  for (const line of result.survivors) console.log(`  ${line}`);
  return 0;
}

async function main() {
  if (process.argv.includes('--review')) return review(arg('--review'), Number(arg('--min-faced', '3')));
  const attribute = process.argv.includes('--attribute');
  const dirs = arg('--dirs', PURE_TIER.join(',')).split(',');
  const sample = Number(arg('--sample', '300'));
  const seed = Number(arg('--seed', '20260930'));
  const workers = Number(arg('--workers', '4'));
  const timeoutMs = Number(arg('--timeout', '240000'));
  const files = pureFiles(ROOT, dirs);
  const all = files.flatMap((file) => mutantsOf(readFileSync(join(ROOT, file), 'utf-8'), file).map((mutant) => ({ file, ...mutant })));
  const byDir = (mutant) => mutant.file.split('/')[1];
  const counts = all.reduce((map, mutant) => map.set(byDir(mutant), (map.get(byDir(mutant)) ?? 0) + 1), new Map());
  console.log(`${files.length} pure files, ${all.length} mutants: ${[...counts].map(([dir, count]) => `${dir} ${count}`).join(', ')}`);
  if (process.argv.includes('--count')) return 0;
  const picked = stratifiedSample(all, byDir, sample, seed);
  console.log(`sampled ${picked.length} (seed ${seed}); staging ${workers} copies`);
  process.env.SO_JEST_CACHE ??= jestCacheDir(ROOT);
  const copies = Array.from({ length: workers }, (_, index) => stageCopy(ROOT, `mutation-${index}`));
  return withStages(copies, () => mutate({ copies, picked, attribute, timeoutMs, dirs, counts, all, files, seed, sample }));
}

async function mutate({ copies, picked, attribute, timeoutMs, dirs, counts, all, files, seed, sample }) {
  const outcomes = [];
  let next = 0;
  const started = Date.now();
  await Promise.all(copies.map(async (dir) => {
    while (next < picked.length) {
      const mutant = picked[next++];
      const path = join(dir, mutant.file);
      const original = readFileSync(path, 'utf-8');
      if (original.slice(mutant.start, mutant.end) !== mutant.original) {
        outcomes.push({ ...mutant, verdict: 'crashed', note: 'staged text differs' });
        continue;
      }
      writeFileSync(path, applyAt(original, mutant), 'utf-8');
      try {
        const run = await runJestAsync(dir, ['--findRelatedTests', mutant.file, ...(attribute ? [] : ['--bail'])], { timeoutMs });
        const verdict = classifyRun(run);
        const attribution = attribute && run.result ? testAttribution(run.result, dir) : null;
        const note = verdict === 'crashed' ? (run.result ? `suites failed ${run.result.numFailedTestSuites}, runtime errors ${run.result.numRuntimeErrorTestSuites}: ${(run.result.testResults ?? []).find((suite) => suite.status === 'failed')?.message?.slice(0, 300) ?? ''}` : `no result: ${run.stderr.slice(-300)}`) : undefined;
        outcomes.push({ file: mutant.file, line: mutant.line, operator: mutant.operator, original: mutant.original, replacement: mutant.replacement, start: mutant.start, verdict, ms: run.ms, ...(note ? { note } : {}), ...(attribution ?? {}) });
        const done = outcomes.length;
        if (done % 10 === 0 || verdict === 'survived') console.log(`[${done}/${picked.length} ${Math.round((Date.now() - started) / 1000)}s] ${verdict.padEnd(8)} ${mutant.file}:${mutant.line} ${mutant.operator}`);
      } finally {
        writeFileSync(path, original, 'utf-8');
      }
    }
  }));
  const perDir = Object.fromEntries(dirs.map((dir) => [dir, mutationScore(outcomes.filter((row) => row.file.split('/')[1] === dir).map((row) => row.verdict))]));
  const total = mutationScore(outcomes.map((row) => row.verdict));
  const report = { at: new Date().toISOString(), seed, sample, attribute, population: all.length, populationByDir: Object.fromEntries(counts), files: files.length, wallSeconds: Math.round((Date.now() - started) / 1000), total, perDir, outcomes: outcomes.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start) };
  const out = arg('--out');
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`\nmutation score ${(total.score * 100).toFixed(1)}% (${total.killed} killed / ${total.scored} scored; ${total.crashed} crashed, ${total.timeout} timeout, ${total['no-tests']} no related tests) in ${report.wallSeconds}s`);
  for (const [dir, score] of Object.entries(perDir)) console.log(`  ${dir.padEnd(11)} ${score.score === null ? '—' : `${(score.score * 100).toFixed(1)}%`} (${score.killed}/${score.scored})`);
  if (attribute && out) return review(out, Number(arg('--min-faced', '3')));
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, '/').toLowerCase() : '';
if (fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === invoked) main().then((code) => { process.exitCode = code; });
