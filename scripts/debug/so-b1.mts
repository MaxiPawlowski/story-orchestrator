import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { B1_RUNNERS, runnerFor } from './lib/b1Registry.mts';
import { combineRuns, readJsonFile, recordPath, recordRef } from './lib/b1Runs.mts';

const USAGE = `Usage: node scripts/debug/so-b1.mts status | combine <row>

The v2.7 39 stage-B1 measurement runners (offline, no ST).
  status          every runner-backed B1 row: its runner, the command, and which of run-1 / run-2 has a record
  combine <row>   both records of a row: PASS only when both runs PASS (rule 4: x2), INCOMPLETE when one is missing or
                  incomplete, RECORDED for a record-only row; exit 0 on PASS or RECORDED`;

export async function combine(row: string, root?: string) {
  const paths = [1, 2].map((run) => recordPath(row, run as 1 | 2, root));
  const records = await Promise.all(paths.map(async (path) => (existsSync(path) ? readJsonFile(path) : null)));
  const verdicts = records.map((record) => record?.verdict ?? null);
  return { row, runs: verdicts, verdict: combineRuns(verdicts), records: [1, 2].map((run, index) => (records[index] ? recordRef(row, run as 1 | 2) : null)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, row] = process.argv.slice(2);
  if (command === 'status') {
    console.log(JSON.stringify(B1_RUNNERS.map((entry) => ({ ...entry, records: [1, 2].map((run) => (existsSync(recordPath(entry.row, run as 1 | 2)) ? recordRef(entry.row, run as 1 | 2) : null)) })), null, 2));
  } else if (command === 'combine' && row && runnerFor(row)) {
    const result = await combine(row);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verdict === 'PASS' || result.verdict === 'RECORDED' ? 0 : 1);
  } else {
    console.log(USAGE);
    process.exit(command === '--help' ? 0 : 1);
  }
}
