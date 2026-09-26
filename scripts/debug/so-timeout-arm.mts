import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { A11_CONTROL_KEY, A11_FULL_PASS_KIND, A11_SCALE_KEY, A11_TARGET_KEY, baseRunFromLog, forcedTimeoutScale, setScaleCommand, type ArmMode } from './lib/timeoutArm.mts';

const USAGE = `Usage: node scripts/debug/so-timeout-arm.mts scale <base-run.log> [--mode targeted|whole]

Reads a base run of test/scenarios/live-v24-03-memorize.json (its stdout log, whose last step prints
the measured passes) and prints the budget scale for the forced-timeout arm
(test/scenarios/live-v25-05-memorize-timeout.json): the whole-chat pass times out on its first ask
early enough for llama to keep its cache, and answers on its 2x retry. A retry after a deep abort is
modelled at the measured 1.85x of a cold ask (no cache reuse), never as a cold ask.

--mode targeted (default): the scale reaches only the whole-chat pass ("${A11_TARGET_KEY}" =
"${A11_FULL_PASS_KIND}"), so every window keeps its unscaled budget.
--mode whole: one scale for every pass; every other pass must answer on its FIRST ask. Usually
infeasible: the windows are as slow as the whole-chat pass. Exits 1 and says why.

Offline: it never touches ST. Set the scale in the lane's page with the printed st-eval command
(localStorage "${A11_SCALE_KEY}"); "${A11_CONTROL_KEY}" = "1" turns the arm into its negative control.`;

export async function scaleFromLogFile(path: string, mode: ArmMode = 'targeted') {
  const run = baseRunFromLog(await readFile(path, 'utf-8'));
  const verdict = forcedTimeoutScale(run, mode);
  return verdict.ok ? { ...verdict, passes: run.passes, maxTokens: run.maxTokens, set: setScaleCommand(verdict.scale, mode) } : { ...verdict, passes: run.passes, maxTokens: run.maxTokens };
}

const readMode = (args: string[]): ArmMode | null => {
  const index = args.indexOf('--mode');
  if (index === -1) return 'targeted';
  const value = args[index + 1];
  return value === 'targeted' || value === 'whole' ? value : null;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const [verb, file] = args;
  const mode = readMode(args);
  if (verb !== 'scale' || !file || file.startsWith('--') || !mode) {
    console.log(USAGE);
    process.exit(verb ? 1 : 0);
  }
  const result = await scaleFromLogFile(file, mode);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
