#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneQueues, plan, planTable } from '../lib/podSchedule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE = `Usage: node scripts/suite/pod-schedule.mjs [--pods 1,2,3,4] [--no-snapshot] [--no-split] [--shares] [--branches all|none] [--queues <n>]

Plans the Phase C rows that need the RunPod pod (test/phase-c/manifest.json, tier RP, reset not offline) over
N pods x 2 model lanes, from the lane-minute estimates in test/phase-c/pod-estimates.json. Two pod sessions:
B1 (measurements, before B2/B3 and the freeze) and C (C4, C5, the C6 rows with replies, C7, after the freeze).
Each row (or each unit of a split row) runs twice in a row on one lane with its reset before each run.
--shares takes the proposed shared runs in pod-estimates.json \`shares\` off the pod (each needs a plan 39 record line).
--queues <n> prints the lane queues for n pods.`;

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

function main() {
  if (process.argv.includes('--help')) { console.log(USAGE); return; }
  const manifest = JSON.parse(readFileSync(join(ROOT, 'test', 'phase-c', 'manifest.json'), 'utf-8'));
  const estimates = JSON.parse(readFileSync(join(ROOT, 'test', 'phase-c', 'pod-estimates.json'), 'utf-8'));
  const options = { snapshot: !process.argv.includes('--no-snapshot'), split: !process.argv.includes('--no-split'), shares: process.argv.includes('--shares'), branches: arg('--branches', 'all') };
  const plans = String(arg('--pods', '1,2,3,4')).split(',').map(Number).filter((n) => n > 0).map((pods) => plan(manifest, estimates, { ...options, pods }));
  const problems = [...new Set(plans.flatMap((p) => p.problems))];
  console.log(`snapshot resets: ${options.snapshot}; split units: ${options.split}; shared runs: ${options.shares}; branch rows: ${options.branches}; lane-hours on the pod: ${(plans[0].sessions.reduce((sum, s) => sum + s.laneMin, 0) / 60).toFixed(1)}`);
  console.log(planTable(plans));
  console.log(`off the pod (RP rows scored from other runs, or shared): ${plans[0].offPod.join(', ') || 'none'}`);
  const queues = arg('--queues', null);
  if (queues) {
    const chosen = plans.find((p) => p.pods === Number(queues)) ?? plan(manifest, estimates, { ...options, pods: Number(queues) });
    console.log(laneQueues(chosen));
  }
  for (const problem of problems) console.log(`problem: ${problem}`);
  process.exitCode = problems.length ? 1 : 0;
}

main();
