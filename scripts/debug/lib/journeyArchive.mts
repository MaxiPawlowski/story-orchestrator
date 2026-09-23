// V20c (plan 01 §D, T4 + F3). Two rules about what a journey run may stand for.
//
// T4: `--only` marks its record `partial`, and nothing read the mark: a subset run could be archived
// under a gate directory and cited as the gate. `archiveRefusal` is the one reader, used by
// `so-journey.mts archive` and by the release suite over every record the attestation cites.
//
// F3: a check run alone under `--only` starts in a fresh chat, so a check that relied on an earlier
// check's import reaches its first generation step with no story loaded and "passes" over nothing
// (J11.9/J11.10 seeded 0 of 10). Under `--only` the step engine now refuses such a step instead.

import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const STORY_BOUND_VERBS = new Set(['send', 'send_generate', 'extract', 'expand']);

export interface JourneyRecordShape {
  id?: unknown;
  partial?: unknown;
  only?: unknown;
  results?: unknown;
  runnerError?: unknown;
}

export function archiveRefusal(record: JourneyRecordShape | null | undefined): string | null {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !Array.isArray(record.results)) {
    return 'not a journey record (no id or results): nothing to archive';
  }
  if (record.partial === true) {
    const only = Array.isArray(record.only) ? record.only.join(', ') : 'a subset';
    return `${record.id} ran with --only (${only}): a partial record cannot stand for a gate`;
  }
  if (record.runnerError) return `${record.id} ended in a runner error (${String(record.runnerError).slice(0, 200)}): the matrix is incomplete`;
  return null;
}

export const storylessStepError = (key: string): string =>
  `F3: --only reached "${key}" with no story loaded — this check relied on an earlier check's import; give it its own import_story`;

// Copies a finished run's record (and its matrix, when it sits beside it) under a gate directory,
// refusing whatever `archiveRefusal` refuses. `.debug` rotates; this is the step that keeps a claim.
export async function archiveJourneyRecord(recordPath: string, gateDir: string): Promise<{ ok: true; wrote: string[] } | { ok: false; reason: string }> {
  let record: JourneyRecordShape;
  try {
    record = JSON.parse(await readFile(recordPath, 'utf-8'));
  } catch (err) {
    return { ok: false, reason: `could not read ${recordPath}: ${err instanceof Error ? err.message : String(err)}` };
  }
  const refused = archiveRefusal(record);
  if (refused) return { ok: false, reason: refused };
  await mkdir(gateDir, { recursive: true });
  const wrote = [join(gateDir, basename(recordPath))];
  await copyFile(recordPath, wrote[0]);
  const matrix = join(dirname(recordPath), `journey-${String(record.id)}.md`);
  const hasMatrix = await stat(matrix).then(() => true, () => false);
  if (hasMatrix) {
    wrote.push(join(gateDir, basename(recordPath).replace(/\.json$/, '.md')));
    await copyFile(matrix, wrote[1]);
  }
  return { ok: true, wrote };
}
