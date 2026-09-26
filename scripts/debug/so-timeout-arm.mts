import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { A11_CONTROL_KEY, A11_SCALE_KEY, baseRunFromLog, forcedTimeoutScale, setScaleCommand } from './lib/timeoutArm.mts';

const USAGE = `Usage: node scripts/debug/so-timeout-arm.mts scale <base-run.log>

Reads a base run of test/scenarios/live-v24-03-memorize.json (its stdout log, whose last step prints
the measured passes) and prints the uniform budget scale for the forced-timeout arm
(test/scenarios/live-v25-05-memorize-timeout.json): the whole-chat pass times out on its first ask
and answers on its 2x retry, and every other pass still answers on its retry. Offline: it never
touches ST. Set the scale in the lane's page with the printed st-eval command
(localStorage "${A11_SCALE_KEY}"); "${A11_CONTROL_KEY}" = "1" turns the arm into its negative control.`;

export async function scaleFromLogFile(path: string) {
  const run = baseRunFromLog(await readFile(path, 'utf-8'));
  const verdict = forcedTimeoutScale(run);
  return verdict.ok ? { ...verdict, passes: run.passes, maxTokens: run.maxTokens, set: setScaleCommand(verdict.scale) } : { ...verdict, passes: run.passes, maxTokens: run.maxTokens };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [verb, file] = process.argv.slice(2);
  if (verb !== 'scale' || !file) {
    console.log(USAGE);
    process.exit(verb ? 1 : 0);
  }
  const result = await scaleFromLogFile(file);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
