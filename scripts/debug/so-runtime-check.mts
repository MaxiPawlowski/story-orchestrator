import { fileURLToPath } from 'node:url';
import { runCli } from './lib/cli.mts';
import { runScenario } from './so-scenario.mts';

export async function runRuntimeCheck(page) {
  return runScenario(page, 'test/scenarios/plan02-runtime.json', { sandbox: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli((page) => runRuntimeCheck(page));
}
