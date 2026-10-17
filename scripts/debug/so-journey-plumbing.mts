import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_DIR } from './lib/connection.mts';
import { plumbingJourney } from './lib/journeyPlumbing.mts';
import { validateFixture } from './lib/scenarioSchema.mts';

const USAGE = `Usage: node scripts/debug/so-journey-plumbing.mts <journey.json> [--out <file>]

Writes a PLUMBING copy of a journey for a no-model lane (ST hides Send while no backend answers, so
send_generate cannot run there): every send_generate becomes a posted player line (send) plus a canned
/sendas reply by the story's omniscient narrator (else the first enabled member). The copy is never
evidence. Default out: <debug dir>/<id>-plumbing.journey.json; run it with so-journey.mts run <file>.`;

async function main() {
  const args = process.argv.slice(2);
  if (!args[0] || args.includes('--help')) { console.log(USAGE); return; }
  const source = JSON.parse(await readFile(resolve(args[0]), 'utf-8'));
  const { journey, replaced } = plumbingJourney(source);
  const problems = validateFixture(journey, journey.id);
  if (problems.length) throw new Error(problems.join('\n'));
  const index = args.indexOf('--out');
  const out = resolve(index >= 0 && args[index + 1] ? args[index + 1] : resolve(DEBUG_DIR, `${journey.id}.journey.json`));
  await writeFile(out, `${JSON.stringify(journey, null, 2)}\n`, 'utf-8');
  console.log(JSON.stringify({ out, replaced, checks: journey.checks.length }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
