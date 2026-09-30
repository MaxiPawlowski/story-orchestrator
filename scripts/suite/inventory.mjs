#!/usr/bin/env node
// v2.6 plan 13 R1: classify every test asset and write docs/plans/v2.6/13-inventory.md.
//
//   node scripts/suite/inventory.mjs [--jest-json <jest --json output>] [--replay <defect-replay report>] [--records-json <out>]
//
// --jest-json refreshes docs/plans/v2.6/13-inventory-timings.json (per-file runtime); without it the
// committed timings are read. --replay marks the jest files that killed a defect-replay mutant.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { citedRecords } from '../release/attestationChecks.mjs';
import { headerBeside } from '../release/attestationRules.mjs';
import { estimateSeconds, fixCommitsByPath, guardOf, isCitedRecord, isVacuousNeedleSpec, jestShape, jestTier, mdCell, stepsShape, testTitles } from '../lib/suiteInventory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'plans', 'v2.6', '13-inventory.md');
const TIMINGS = join(ROOT, 'docs', 'plans', 'v2.6', '13-inventory-timings.json');
const RECORDS = 'test/journeys/records/';

const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 }).stdout;
const read = (path) => readFileSync(join(ROOT, path), 'utf-8');
const posix = (path) => path.replace(/\\/g, '/');

export function recordCitations(files) {
  const citations = new Set();
  const textFiles = files.filter((path) => !path.startsWith(RECORDS) && /\.(md|mjs|mts|ts|json|txt|cjs)$/.test(path) && !path.startsWith('node_modules/'));
  for (const path of textFiles) {
    const text = read(path);
    if (!text.includes('records/')) continue;
    for (const [raw] of text.matchAll(/(?:test\/journeys\/)?records\/[\w.\-/{},]+/g)) {
      const full = raw.startsWith('records/') ? `test/journeys/${raw}` : raw;
      const clean = full.replace(/[.,;)]+$/, '');
      const brace = /\{([^{}]*)\}/.exec(clean);
      const expanded = brace ? brace[1].split(',').map((part) => clean.slice(0, brace.index) + part + clean.slice(brace.index + brace[0].length)) : [clean];
      for (const path of expanded) citations.add(path.replace(/\{.*$/, ''));
    }
  }
  for (const attestationPath of files.filter((path) => /^docs\/release\/[^/]+\/attestation\.json$/.test(path))) {
    const attestation = JSON.parse(read(attestationPath));
    const base = attestation?.evidence?.journeys;
    if (typeof base !== 'string') continue;
    for (const cited of citedRecords(attestation)) citations.add(posix(join(base, cited)).replace(/^\.\//, ''));
    const runs = Object.values(attestation.journeys ?? {}).flatMap((journey) => journey?.runs ?? []);
    for (const run of runs) if (typeof run?.record === 'string' && run.header === undefined) citations.add(posix(join(base, headerBeside(run.record))).replace(/^\.\//, ''));
  }
  return [...citations].filter((path) => path.startsWith(RECORDS) && path.length > RECORDS.length);
}

export function collect({ jestJson = null, replayPath = null } = {}) {
  const files = git(['ls-files']).split('\n').map((line) => line.trim()).filter(Boolean).filter((path) => existsSync(join(ROOT, path)));
  if (jestJson) {
    const results = JSON.parse(readFileSync(jestJson, 'utf-8'));
    const timings = Object.fromEntries(results.testResults.map((suite) => [posix(suite.name).replace(/^.*?\/(src\/)/, '$1'), { ms: (suite.perfStats?.end ?? suite.endTime) - (suite.perfStats?.start ?? suite.startTime), tests: suite.assertionResults.length }]).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(TIMINGS, `${JSON.stringify({ at: new Date(results.startTime).toISOString(), totalTests: results.numTotalTests, files: timings }, null, 2)}\n`, 'utf-8');
  }
  const timings = existsSync(TIMINGS) ? JSON.parse(readFileSync(TIMINGS, 'utf-8')).files : {};
  const replay = replayPath ? JSON.parse(readFileSync(replayPath, 'utf-8')) : null;
  const specs = existsSync(join(ROOT, 'test/findings/defect-replay')) ? files.filter((path) => path.startsWith('test/findings/defect-replay/') && path.endsWith('.json')).map((path) => JSON.parse(read(path))) : [];
  const replayGuards = new Map();
  for (const spec of specs) {
    const verdict = replay?.rows?.find((row) => row.id === spec.id)?.verdict;
    for (const test of spec.tests) replayGuards.set(test, [...(replayGuards.get(test) ?? []), `${spec.id}${verdict ? ` (${verdict})` : ''}`]);
  }
  const fixes = fixCommitsByPath(git(['log', '--no-renames', '--name-only', '--format=@@%h%x09%s']));
  const docs = files.filter((path) => path.endsWith('.md') && !path.startsWith(RECORDS) && path !== posix(OUT.slice(ROOT.length + 1)));
  const docText = docs.map((path) => read(path)).join('\n');
  const citedBy = (stem) => (docText.match(new RegExp(stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;

  const jestFiles = files.filter((path) => /^src\/.*\.test\.tsx?$/.test(path));
  const titleOwners = new Map();
  const jestRows = jestFiles.map((path) => {
    const text = read(path);
    const shape = jestShape(text);
    for (const title of new Set(testTitles(text))) titleOwners.set(title, [...(titleOwners.get(title) ?? []), path]);
    const timing = timings[path];
    return { path, tier: jestTier(path, text), ms: timing?.ms ?? null, tests: timing?.tests ?? shape.tests, guard: guardOf(path, text), replay: replayGuards.get(path) ?? [], fixes: fixes.get(path) ?? 0, vacuous: shape.vacuous, skipped: shape.skipped, text };
  });
  for (const row of jestRows) {
    const titles = new Set(testTitles(row.text));
    row.dupes = [...titles].filter((title) => (titleOwners.get(title) ?? []).length > 1).length;
    delete row.text;
  }

  const stories = files.filter((path) => path.endsWith('.stories.tsx')).map((path) => {
    const text = read(path);
    return { path, stories: (text.match(/^export const \w+/gm) ?? []).length, plays: (text.match(/\bplay\s*:/g) ?? []).length, fixes: fixes.get(path) ?? 0 };
  });

  const harness = files.filter((path) => /\.test\.(mts|mjs)$/.test(path)).map((path) => {
    const text = read(path);
    return { path, tests: (text.match(/(?:^|[^\w.])test\s*\(/gm) ?? []).length, guard: guardOf(path, text), fixes: fixes.get(path) ?? 0, vacuous: !/\bassert[.(]/.test(text) };
  });
  const tools = files.filter((path) => /^scripts\/debug\/[^/]+\.mts$/.test(path) && !path.endsWith('.test.mts')).map((path) => ({ path, tested: files.includes(path.replace(/\.mts$/, '.test.mts')) || files.some((other) => other.startsWith('scripts/debug/') && other.endsWith('.test.mts') && read(other).includes(path.split('/').pop().replace(/\.mts$/, ''))), cited: citedBy(path.split('/').pop()) }));

  const journeyChecks = new Set();
  const journeys = files.filter((path) => /^test\/journeys\/[^/]+\.journey\.json$/.test(path)).flatMap((path) => {
    const journey = JSON.parse(read(path));
    return (journey.checks ?? []).map((check) => {
      journeyChecks.add(check.id);
      const shape = stepsShape(check.steps);
      return { path, journey: journey.id, id: check.id, mode: check.mode, findings: check.findings ?? [], shape, est: estimateSeconds(shape), goal: check.goal ?? '' };
    });
  });

  const scenarios = files.filter((path) => /^test\/scenarios\/[^/]+\.json$/.test(path)).flatMap((path) => {
    let parsed;
    try { parsed = JSON.parse(read(path)); } catch { return [{ path, kind: 'unparseable' }]; }
    if (!Array.isArray(parsed.steps)) return [];
    const shape = stepsShape(parsed.steps);
    const name = path.split('/').pop().replace(/\.json$/, '');
    const note = [parsed.name, parsed.objective, parsed._note].filter(Boolean).join(' ');
    return [{ path, name, shape, est: estimateSeconds(shape), guard: guardOf(path, note), cited: citedBy(name), fixes: fixes.get(path) ?? 0, oneShot: /^live-v2\d|^v2\d-/.test(name) }];
  });
  const storyFixtures = files.filter((path) => /^test\/scenarios\/.*\.story\.json$/.test(path)).length;

  const liveSuite = files.filter((path) => /^test\/fixtures\/extractor\d*\.expected\.json$/.test(path)).map((path) => {
    const expected = JSON.parse(read(path));
    const vacuous = ['facts', 'memory', 'epistemic', 'ledger', 'arcs'].flatMap((tier) => isVacuousNeedleSpec(expected[tier]).map((entry) => `${tier}.${entry}`));
    return { path, name: path.split('/').pop().replace(/\.expected\.json$/, ''), tiers: Object.keys(expected).filter((key) => ['deltas', 'facts', 'rejected', 'memory', 'epistemic', 'ledger', 'arcs'].includes(key)), vacuous };
  });

  const supportFiles = files.filter((path) => /^test\/(fixtures|goldens)\//.test(path) && !/^test\/fixtures\/extractor\d*\./.test(path) && !/^test\/goldens\/extractor\d*\./.test(path));
  const searchable = files.filter((path) => /^(src|scripts|test\/scenarios|test\/journeys\/[^/]+\.json|server-plugin)/.test(path) && /\.(ts|tsx|mts|mjs|json|cjs)$/.test(path) && !path.startsWith(RECORDS)).map((path) => read(path)).join('\n');
  const support = supportFiles.map((path) => {
    const base = path.split('/').pop();
    const stem = base.replace(/\.(story|transcript|expected|hints|response)?\.?(json|txt|js)$/, '');
    const dir = path.split('/').slice(0, -1).join('/');
    const referenced = searchable.includes(base) || searchable.includes(stem) || searchable.includes(dir.replace(/^test\/(fixtures|goldens)\//, ''));
    return { path, tier: path.includes('/spikes/') ? 'spike fixture' : 'fixture/golden', referenced };
  });

  const recordFiles = files.filter((path) => path.startsWith(RECORDS));
  const citations = recordCitations(files);
  const recordDirs = new Map();
  for (const path of recordFiles) {
    const dir = path.slice(RECORDS.length).split('/')[0];
    const entry = recordDirs.get(dir) ?? { dir, files: 0, bytes: 0, cited: 0, citedBytes: 0 };
    const bytes = statSync(join(ROOT, path)).size;
    entry.files += 1;
    entry.bytes += bytes;
    if (isCitedRecord(path, citations)) { entry.cited += 1; entry.citedBytes += bytes; }
    recordDirs.set(dir, entry);
  }
  return { files, jestRows, stories, harness, tools, journeys, scenarios, storyFixtures, liveSuite, support, recordFiles, recordDirs, citations };
}

function main() {
  const { jestRows, stories, harness, tools, journeys, scenarios, storyFixtures, liveSuite, support, recordFiles, recordDirs, citations } = collect({ jestJson: arg('--jest-json'), replayPath: arg('--replay') });
  const recordsJson = arg('--records-json');
  if (recordsJson) writeFileSync(recordsJson, `${JSON.stringify({ citations, cited: recordFiles.filter((path) => isCitedRecord(path, citations)), uncited: recordFiles.filter((path) => !isCitedRecord(path, citations)) }, null, 2)}\n`, 'utf-8');

  const mb = (bytes) => (bytes / 1048576).toFixed(2);
  const sec = (ms) => (ms === null || ms === undefined ? '?' : (ms / 1000).toFixed(1));
  const byTier = (rows, key) => rows.reduce((map, row) => map.set(row[key], (map.get(row[key]) ?? 0) + 1), new Map());
  const count = (rows, predicate) => rows.filter(predicate).length;
  const L = [];
  L.push('# v2.6 plan 13 — test asset inventory (generated)');
  L.push('');
  L.push('Generated by `node scripts/suite/inventory.mjs` — do not edit by hand; re-run it. Runtimes for jest come from `docs/plans/v2.6/13-inventory-timings.json` (one full `jest --json` run on this box); scenario and journey runtimes are estimates (`scripts/lib/suiteInventory.mjs` `estimateSeconds`: 45 s per real generation, 20 s per unmocked model pass, 2 s per step).');
  L.push('');
  L.push('Column heuristics (all read from the asset text; `scripts/lib/suiteInventory.mjs`, tested in `scripts/lib/suiteInventory.test.mjs`):');
  L.push('- **guards**: `invariant` (a guard/census file, or cites `architecture.md`) > `defect` (a `.review.test`, a finding id such as `V4:`/`T1)`, "used to", "regression", "mutant") > `contract` (a plan/spec/§ reference) > `nothing named`.');
  L.push('- **replay**: defect-replay mutants (`test/findings/defect-replay/`) this file is the named killer for.');
  L.push('- **fix commits**: commits touching the file whose subject reads as a fix — the proxy for "has failed on master".');
  L.push('- **dup titles**: test titles that appear verbatim in another jest file.');
  L.push('- **vacuous**: jest — test blocks and no assertion at all; scenario/journey — steps and no `expect`/`expect_ui`/`wait`/throwing eval; live suite — an empty needle. Static: the blank-fixture run the plan names is replaced by this read (no LLM runs in v2.6 before plan 10).');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Tier | Assets | Tests / checks | Needs LLM | Guards nothing named | Vacuous | Runtime |');
  L.push('|---|---|---|---|---|---|---|');
  const jestMs = jestRows.reduce((sum, row) => sum + (row.ms ?? 0), 0);
  for (const tier of ['pure unit', 'unit (host faked)']) {
    const rows = jestRows.filter((row) => row.tier === tier);
    L.push(`| jest: ${tier} | ${rows.length} | ${rows.reduce((sum, row) => sum + row.tests, 0)} | 0 | ${count(rows, (row) => row.guard === 'nothing named')} | ${count(rows, (row) => row.vacuous)} | ${sec(rows.reduce((sum, row) => sum + (row.ms ?? 0), 0))} s |`);
  }
  L.push(`| Storybook | ${stories.length} | ${stories.reduce((sum, row) => sum + row.stories, 0)} stories, ${stories.reduce((sum, row) => sum + row.plays, 0)} plays | 0 | — | ${count(stories, (row) => row.plays === 0)} files without a play | build + run, minutes |`);
  L.push(`| harness (node --test) | ${harness.length} | ${harness.reduce((sum, row) => sum + row.tests, 0)} | 0 | ${count(harness, (row) => row.guard === 'nothing named')} | ${count(harness, (row) => row.vacuous)} | seconds |`);
  L.push(`| debug tools (not tests) | ${tools.length} | — | — | — | ${count(tools, (row) => !row.tested)} without a harness test | — |`);
  const noLlm = scenarios.filter((row) => row.shape && !row.shape.needsLlm);
  const llm = scenarios.filter((row) => row.shape?.needsLlm);
  L.push(`| no-LLM scenario | ${noLlm.length} | ${noLlm.reduce((sum, row) => sum + row.shape.steps, 0)} steps | 0 | ${count(noLlm, (row) => row.guard === 'nothing named')} | ${count(noLlm, (row) => row.shape.vacuous)} | ~${Math.round(noLlm.reduce((sum, row) => sum + row.est, 0) / 60)} min est. |`);
  L.push(`| LLM scenario | ${llm.length} | ${llm.reduce((sum, row) => sum + row.shape.steps, 0)} steps | ${llm.length} | ${count(llm, (row) => row.guard === 'nothing named')} | ${count(llm, (row) => row.shape.vacuous)} | ~${Math.round(llm.reduce((sum, row) => sum + row.est, 0) / 60)} min est. |`);
  L.push(`| journey check | ${new Set(journeys.map((row) => row.path)).size} journeys | ${journeys.length} checks (${count(journeys, (row) => row.mode === 'human')} human) | ${count(journeys, (row) => row.shape.needsLlm)} | ${count(journeys, (row) => !row.findings.length)} with no finding id | ${count(journeys, (row) => row.shape.vacuous && row.mode !== 'human')} | ~${Math.round(journeys.reduce((sum, row) => sum + row.est, 0) / 60)} min est. |`);
  L.push(`| live suite (extractor fixtures) | ${liveSuite.length} | ${liveSuite.reduce((sum, row) => sum + row.tiers.length, 0)} tiers | ${liveSuite.length} (live); goldens replay in jest | — | ${count(liveSuite, (row) => row.vacuous.length)} | ~${Math.round(liveSuite.length * 25 / 60)} min est. |`);
  L.push(`| fixtures / goldens (support) | ${count(support, (row) => row.tier === 'fixture/golden')} | — | — | — | ${count(support, (row) => !row.referenced)} unreferenced | — |`);
  L.push(`| spike fixture | ${count(support, (row) => row.tier === 'spike fixture')} | — | — | — | ${count(support, (row) => row.tier === 'spike fixture' && !row.referenced)} unreferenced | — |`);
  L.push(`| story fixtures in test/scenarios | ${storyFixtures} | — | — | — | — | — |`);
  const recordBytes = [...recordDirs.values()].reduce((sum, row) => sum + row.bytes, 0);
  const citedBytes = [...recordDirs.values()].reduce((sum, row) => sum + row.citedBytes, 0);
  L.push(`| archived run records | ${recordFiles.length} files in ${recordDirs.size} dirs | ${count(recordFiles, (path) => isCitedRecord(path, citations))} cited | — | — | — | ${mb(recordBytes)} MB (${mb(citedBytes)} MB cited) |`);
  L.push('');
  L.push(`jest total: ${jestRows.length} files, ${jestRows.reduce((sum, row) => sum + row.tests, 0)} tests, ${sec(jestMs)} s summed per-file runtime.`);
  L.push('');
  L.push('## jest files');
  L.push('');
  L.push('| File | Tier | Tests | Runtime s | Guards | Replay kills | Fix commits | Dup titles | Vacuous |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const row of [...jestRows].sort((a, b) => a.path.localeCompare(b.path))) L.push(`| \`${row.path}\` | ${row.tier} | ${row.tests} | ${sec(row.ms)} | ${row.guard} | ${mdCell(row.replay.join(', '))} | ${row.fixes} | ${row.dupes || ''} | ${row.vacuous ? 'YES' : ''}${row.skipped ? ` (${row.skipped} skipped)` : ''} |`);
  L.push('');
  L.push('## Storybook');
  L.push('');
  L.push('| File | Stories | Plays | Fix commits |');
  L.push('|---|---|---|---|');
  for (const row of stories) L.push(`| \`${row.path}\` | ${row.stories} | ${row.plays} | ${row.fixes} |`);
  L.push('');
  L.push('## Harness tests (node --test)');
  L.push('');
  L.push('| File | Tests | Guards | Fix commits | Vacuous |');
  L.push('|---|---|---|---|---|');
  for (const row of harness) L.push(`| \`${row.path}\` | ${row.tests} | ${row.guard} | ${row.fixes} | ${row.vacuous ? 'YES' : ''} |`);
  L.push('');
  L.push('## Scenarios');
  L.push('');
  L.push('| Scenario | Tier | Steps | Generations | Est. s | Guards | Doc citations | Fix commits | One-shot plan fixture | Vacuous |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const row of scenarios) {
    if (!row.shape) { L.push(`| \`${row.path}\` | unparseable | | | | | | | | |`); continue; }
    L.push(`| \`${row.path}\` | ${row.shape.needsLlm ? 'LLM scenario' : 'no-LLM scenario'} | ${row.shape.steps} | ${row.shape.generates} | ${row.est} | ${row.guard} | ${row.cited} | ${row.fixes} | ${row.oneShot ? 'yes' : ''} | ${row.shape.vacuous ? 'YES' : ''} |`);
  }
  L.push('');
  L.push('## Journey checks');
  L.push('');
  L.push('| Check | Journey | Mode | Needs LLM | Steps | Est. s | Findings | Vacuous |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const row of journeys) L.push(`| ${row.id} | \`${row.path.split('/').pop()}\` | ${row.mode} | ${row.shape.needsLlm ? 'yes' : ''} | ${row.shape.steps} | ${row.est} | ${mdCell(row.findings.join(', '))} | ${row.shape.vacuous && row.mode !== 'human' ? 'YES' : ''} |`);
  L.push('');
  L.push('## Live suite (extractor fixtures)');
  L.push('');
  L.push('| Fixture | Tiers stated | Vacuous needles |');
  L.push('|---|---|---|');
  for (const row of liveSuite) L.push(`| ${row.name} | ${row.tiers.join(', ')} | ${mdCell(row.vacuous.join(', '))} |`);
  L.push('');
  L.push('## Unreferenced fixtures and goldens');
  L.push('');
  L.push('Support files whose name, stem or directory no test, scenario, journey or script mentions.');
  L.push('');
  for (const row of support.filter((entry) => !entry.referenced)) L.push(`- \`${row.path}\` (${row.tier})`);
  if (!support.some((entry) => !entry.referenced)) L.push('- none');
  L.push('');
  L.push('## Debug tools without a harness test');
  L.push('');
  L.push(tools.filter((row) => !row.tested).map((row) => `\`${row.path.split('/').pop()}\``).join(', ') || 'none');
  L.push('');
  L.push('## Archived run records');
  L.push('');
  L.push('| Dir | Files | MB | Cited files | Cited MB |');
  L.push('|---|---|---|---|---|');
  for (const row of [...recordDirs.values()].sort((a, b) => a.dir.localeCompare(b.dir))) L.push(`| \`${row.dir}\` | ${row.files} | ${mb(row.bytes)} | ${row.cited} | ${mb(row.citedBytes)} |`);
  L.push('');
  writeFileSync(OUT, `${L.join('\n')}`, 'utf-8');
  console.log(`wrote ${OUT}: ${jestRows.length} jest, ${stories.length} stories, ${harness.length} harness, ${scenarios.length} scenarios, ${journeys.length} journey checks, ${liveSuite.length} live-suite fixtures, ${recordFiles.length} record files`);
  return 0;
}

if (process.argv[1] && posix(fileURLToPath(import.meta.url)).toLowerCase() === posix(process.argv[1]).toLowerCase()) process.exitCode = main();
