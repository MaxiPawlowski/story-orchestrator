#!/usr/bin/env node
// v2.6 plan 13 R2: a sampled mutation score over the pure modules. Each mutant is applied in its own
// staged copy of the tree and judged by `jest --findRelatedTests <file> --bail`: killed when an
// assertion fails, survived when every related test passes. Crashes and timeouts are reported, never
// scored. Same --seed and --sample = the same mutants, so a post-prune run is comparable.
//
//   node scripts/suite/mutation-baseline.mjs [--sample 300] [--seed 20260930] [--workers 4] [--out file.json] [--dirs engine,memory]
//   node scripts/suite/mutation-baseline.mjs --count          (enumerate only, no runs)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { classifyRun, mutationScore, stratifiedSample } from '../lib/suiteMutants.mjs';
import { applyAt, mutantsOf } from '../lib/suiteMutantGen.mjs';
import { runJestAsync, stageCopy } from '../lib/suiteStage.mjs';

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

async function main() {
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
  const copies = Array.from({ length: workers }, (_, index) => stageCopy(ROOT, `mutation-${index}`));
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
        const run = await runJestAsync(dir, ['--findRelatedTests', mutant.file, '--bail'], { timeoutMs });
        const verdict = classifyRun(run);
        const note = verdict === 'crashed' ? (run.result ? `suites failed ${run.result.numFailedTestSuites}, runtime errors ${run.result.numRuntimeErrorTestSuites}: ${(run.result.testResults ?? []).find((suite) => suite.status === 'failed')?.message?.slice(0, 300) ?? ''}` : `no result: ${run.stderr.slice(-300)}`) : undefined;
        outcomes.push({ file: mutant.file, line: mutant.line, operator: mutant.operator, original: mutant.original, replacement: mutant.replacement, start: mutant.start, verdict, ms: run.ms, ...(note ? { note } : {}) });
        const done = outcomes.length;
        if (done % 10 === 0 || verdict === 'survived') console.log(`[${done}/${picked.length} ${Math.round((Date.now() - started) / 1000)}s] ${verdict.padEnd(8)} ${mutant.file}:${mutant.line} ${mutant.operator}`);
      } finally {
        writeFileSync(path, original, 'utf-8');
      }
    }
  }));
  const perDir = Object.fromEntries(dirs.map((dir) => [dir, mutationScore(outcomes.filter((row) => row.file.split('/')[1] === dir).map((row) => row.verdict))]));
  const total = mutationScore(outcomes.map((row) => row.verdict));
  const report = { at: new Date().toISOString(), seed, sample, population: all.length, populationByDir: Object.fromEntries(counts), files: files.length, wallSeconds: Math.round((Date.now() - started) / 1000), total, perDir, outcomes: outcomes.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start) };
  const out = arg('--out');
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`\nmutation score ${(total.score * 100).toFixed(1)}% (${total.killed} killed / ${total.scored} scored; ${total.crashed} crashed, ${total.timeout} timeout, ${total['no-tests']} no related tests) in ${report.wallSeconds}s`);
  for (const [dir, score] of Object.entries(perDir)) console.log(`  ${dir.padEnd(11)} ${score.score === null ? '—' : `${(score.score * 100).toFixed(1)}%`} (${score.killed}/${score.scored})`);
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, '/').toLowerCase() : '';
if (fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === invoked) main().then((code) => { process.exitCode = code; });
