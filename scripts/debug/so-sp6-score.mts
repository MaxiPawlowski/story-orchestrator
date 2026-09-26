import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readSp6Runs, scoreSp6 } from './lib/sp6Score.mts';

const USAGE = `Usage: node scripts/debug/so-sp6-score.mts <sp6-records.json>

v2.5 plan 09 SP6 K3/K4/K5. Reads the JSON array the SP6 journey appends to localStorage "so-sp6-records"
(export it from the lane with: node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts
"localStorage.getItem('so-sp6-records')"), applies the predeclared bars and prints the verdicts.
Offline: it never touches ST. Exits 1 unless every condition is PASS.`;

export async function scoreFile(path: string) {
  const text = (await readFile(path, 'utf-8')).trim();
  const parsed = JSON.parse(text);
  return scoreSp6(readSp6Runs(typeof parsed === 'string' ? JSON.parse(parsed) : parsed));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = process.argv[2];
  if (!path || path === '--help') {
    console.log(USAGE);
    process.exitCode = path ? 0 : 1;
  } else {
    const result = await scoreFile(path);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.overall === 'PASS' ? 0 : 1;
  }
}
