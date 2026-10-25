#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { collect } from './inventory.mjs';
import { decideAsset, noLlmPartition } from '../lib/suiteDecisions.mjs';
import { LIBRARY_INDEX_FILE, laneProblems, NOMODEL_LANES, noModelJourneys, noModelScenarios, PREPARE_PROBE, prepareLaneSettings, prepareProblems, stretchGroupFile, summarizeBatch } from '../debug/lib/nomodelSuite.mts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANES_SCRIPT = join('scripts', 'debug', 'st-lanes.mts');
const USAGE = `Usage: npm run suite:nomodel [-- --lanes 30,31,32,34] [--list] [--no-prepare] [--prepare-only]

v2.9 plan 11 B5. Runs the no-LLM scenario list (scripts/suite/decisions.mjs rules: kept, no model call by shape,
requires.lane no-model, no prior step, model "none") and every journey's "none" checks whose dependencies are "none"
too (so-journey --model none), through st-lanes.mts batch --strict --model none on no-model lanes. Refuses a lane
that is not seeded, not up, or has a model. Prints a summary; exits 1 on any row that is not GREEN (red, incomplete
or not-runnable). --list prints the list and runs nothing. Writes no docs.

Before the batch each lane is prepared from scratch (v2.9 13 C8), one lane at a time: stopped, re-seeded with
SO_LANE_OFFLINE=1 (st-lanes seed --fresh --slim: keys removed, every other loopback URL on the closed port 18079,
judge, images, sprites and ST Image Generation off, server plugins off, so no judge, harness, GPU or media plugin can
reach a cloud model, the controller or ComfyUI), its Story Orchestrator settings reset to the defaults (judge, images
and sprites off, the memory model a configured profile on the closed port), a keyless DeepSeek Chat Completion profile
added, ST Summarize enabled with automatic summaries off, the group SO-Open-Stretch-Curve written, started, the SOIMG
test cast seeded (so-image-cast seed --no-art) and the page probed. The copied library index
(user/files/so-library-index.json) is removed and ST's side panels are unpinned (a pinned panel covers the phone-width
launcher). --no-prepare runs on the lanes as they are;
--prepare-only prepares and stops. The default lanes leave out 33, which another agent drives (2026-10-25: its page
navigations made every "sandbox escaped" row of the first run).`;

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf-8'));

export function buildList() {
  const config = readJson('test/findings/suite-decisions.json');
  const data = collect({ replayPath: null });
  const rows = data.scenarios.filter((row) => row.shape).map((row) => ({ ...row, ...decideAsset('scenario', row, config) }));
  const modelOf = (path) => (existsSync(join(ROOT, path)) ? readJson(path).model : undefined);
  const scenarios = noModelScenarios(rows, modelOf, (list) => noLlmPartition(list).noModel);
  const journeyDir = join(ROOT, 'test', 'journeys');
  const journeys = noModelJourneys(readdirSync(journeyDir).filter((file) => file.endsWith('.journey.json')).map((file) => JSON.parse(readFileSync(join(journeyDir, file), 'utf-8'))));
  return { ...scenarios, journeys, group: config.defaultGroup };
}

function laneStatus() {
  const out = spawnSync(process.execPath, [LANES_SCRIPT, 'status'], { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`st-lanes status failed: ${out.stderr || out.stdout}`);
  return JSON.parse(out.stdout.slice(out.stdout.indexOf('[')));
}

function stLanes(args, env = {}) {
  const out = spawnSync(process.execPath, [LANES_SCRIPT, ...args], { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
  if (out.status !== 0) throw new Error(`st-lanes ${args.join(' ')} failed (${out.status}): ${(out.stderr || out.stdout).slice(-1500)}`);
  return out.stdout;
}

function laneRoot(n) {
  const debug = stLanes(['env', String(n)]).match(/SO_DEBUG_DIR=(\S+)/)?.[1];
  if (!debug) throw new Error(`st-lanes env ${n} named no debug dir`);
  return dirname(debug);
}

function prepareLane(n) {
  const user = join(laneRoot(n), 'data', 'default-user');
  stLanes(['stop', String(n)]);
  stLanes(['seed', String(n), '--fresh', '--slim'], { SO_LANE_OFFLINE: '1' });
  const settingsPath = join(user, 'settings.json');
  const { next, profileId, changes } = prepareLaneSettings(JSON.parse(readFileSync(settingsPath, 'utf-8')));
  if (!profileId) throw new Error(`lane ${n}: the install has no profile to select as the memory model`);
  writeFileSync(settingsPath, JSON.stringify(next, null, 4), 'utf-8');
  const libraryIndex = join(user, ...LIBRARY_INDEX_FILE);
  if (existsSync(libraryIndex)) { rmSync(libraryIndex); changes.push('removed the copied library index (its tombstones read as a library lost to another tab)'); }
  const now = Date.now();
  writeFileSync(join(user, 'groups', `${now}.json`), JSON.stringify(stretchGroupFile(now, `${now}-stretch`), null, 4), 'utf-8');
  stLanes(['start', String(n)]);
  stLanes(['run', String(n), '--', 'scripts/debug/so-image-cast.mts', 'seed', '--no-art']);
  const probeOut = stLanes(['run', String(n), '--', 'scripts/debug/st-eval.mts', PREPARE_PROBE]);
  const written = probeOut.match(/Wrote JSON: (.+\.json)/)?.[1]?.trim();
  const probe = written && existsSync(written) ? JSON.parse(readFileSync(written, 'utf-8')) : null;
  const problems = prepareProblems(probe?.value ?? null);
  if (problems.length) throw new Error(`lane ${n} is not prepared: ${problems.join('; ')}`);
  return { lane: n, changes, probe: probe.value };
}

function runBatch(args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [LANES_SCRIPT, 'batch', ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.on('close', (code) => resolveRun({ code: code ?? 1, output }));
  });
}

async function main() {
  if (process.argv.includes('--help')) { console.log(USAGE); return 0; }
  const lanes = String(arg('--lanes', NOMODEL_LANES.join(','))).split(',').map(Number).filter(Boolean);
  const list = buildList();
  console.log(`suite:nomodel: ${list.scenarios.length} scenarios, ${list.journeys.length} journeys (${list.journeys.reduce((sum, journey) => sum + journey.checks.length, 0)} none checks) on lanes ${lanes.join(',')}`);
  for (const journey of list.journeys) console.log(`  ${journey.id}: ${journey.checks.join(', ')}`);
  for (const line of list.left) console.log(`  not listed: ${line}`);
  if (list.problems.length) {
    for (const problem of list.problems) console.error(`suite:nomodel: ${problem}`);
    return 1;
  }
  if (process.argv.includes('--list')) {
    for (const path of list.scenarios) console.log(`  ${path}`);
    return 0;
  }
  if (!process.argv.includes('--no-prepare')) {
    for (const n of lanes) {
      const prepared = prepareLane(n);
      console.log(`suite:nomodel: lane ${n} prepared: ${prepared.changes.join('; ')}`);
    }
    if (process.argv.includes('--prepare-only')) return 0;
  }
  const refused = laneProblems(laneStatus(), lanes);
  if (refused.length) {
    for (const problem of refused) console.error(`suite:nomodel refused: ${problem}`);
    return 2;
  }
  const items = [...list.journeys.map((journey) => journey.id), ...list.scenarios];
  const { output } = await runBatch(['--lanes', lanes.join(','), '--strict', '--model', 'none', '--group', list.group, ...items]);
  const summaryPath = output.match(/"summary":\s*"((?:[^"\\]|\\.)*)"/)?.[1]?.replace(/\\\\/g, '\\');
  if (!summaryPath || !existsSync(summaryPath)) {
    console.error('suite:nomodel: st-lanes batch wrote no summary');
    return 1;
  }
  const summary = summarizeBatch(JSON.parse(readFileSync(summaryPath, 'utf-8')).results ?? []);
  console.log(`\nsuite:nomodel summary (${summaryPath})`);
  console.log(Object.entries(summary.counts).map(([status, count]) => `${status} ${count}`).join(', '));
  for (const line of summary.lines) console.log(`  ${line}`);
  return summary.ok ? 0 : 1;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, '/').toLowerCase() : '';
if (fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === invoked) main().then((code) => { process.exitCode = code; }, (error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
