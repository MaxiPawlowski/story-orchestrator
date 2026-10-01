// V20c (plan 01 §D, T4 + F3). Two rules about what a journey run may stand for.
//
// T4: `--only` marks its record `partial`, and nothing read the mark: a subset run could be archived
// under a gate directory and cited as the gate. `archiveRefusal` is the one reader, used by
// `so-journey.mts archive` and by the release suite over every record the attestation cites.
//
// F3: a check run alone under `--only` starts in a fresh chat, so a check that relied on an earlier
// check's import reaches its first generation step with no story loaded and "passes" over nothing
// (J11.9/J11.10 seeded 0 of 10). Under `--only` the step engine now refuses such a step instead.

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const fixtureSha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export const STORY_BOUND_VERBS = new Set(['send', 'send_generate', 'extract', 'expand']);

export interface JourneyRecordShape {
  id?: unknown;
  partial?: unknown;
  only?: unknown;
  results?: unknown;
  runnerError?: unknown;
  engineHistory?: unknown;
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

export function engineHistoryFileOf(record: { engineHistory?: unknown } | null | undefined): string | null {
  const named = record && typeof record.engineHistory === 'object' && record.engineHistory ? (record.engineHistory as { file?: unknown }).file : null;
  return typeof named === 'string' && named.trim() ? basename(named.replace(/\\/g, '/')) : null;
}

export const storylessStepError =(key: string): string =>
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
  const exists = (path: string) => stat(path).then(() => true, () => false);
  const history = engineHistoryFileOf(record);
  const historySource = history ? join(dirname(recordPath), history) : null;
  if (historySource && !(await exists(historySource))) return { ok: false, reason: `${String(record.id)} names engine history ${history}, which is not beside the record: the run cannot be replayed` };
  await mkdir(gateDir, { recursive: true });
  const wrote = [join(gateDir, basename(recordPath))];
  await copyFile(recordPath, wrote[0]);
  const matrix = join(dirname(recordPath), `journey-${String(record.id)}.md`);
  if (await exists(matrix)) {
    const target = join(gateDir, basename(recordPath).replace(/\.json$/, '.md'));
    await copyFile(matrix, target);
    wrote.push(target);
  }
  if (historySource && history) {
    const target = join(gateDir, history);
    await copyFile(historySource, target);
    wrote.push(target);
  }
  return { ok: true, wrote };
}

// F3, the rest of it (2026-09-23): running every J11 check alone found four that need STATE an earlier
// check leaves — a judge usage switched on, speaker direction enabled, a decision count — not only its
// story. They are scenarios in sequence, and are honest about it by declaring `dependsOn`: under
// --only, a check whose dependency was not selected is `blocked` naming it, never a misleading fail.
export const unselectedDependencies = (check: { id?: string; dependsOn?: unknown }, only: string[] | null): string[] =>
  only && Array.isArray(check.dependsOn) ? check.dependsOn.map(String).filter((id) => !only.includes(id)) : [];

export function dependencyProblems(checks: Array<{ id: string; dependsOn?: unknown }>): string[] {
  const problems: string[] = [];
  checks.forEach((check, index) => {
    if (check.dependsOn === undefined) return;
    if (!Array.isArray(check.dependsOn) || !check.dependsOn.length) { problems.push(`${check.id}: dependsOn must be a non-empty list of check ids`); return; }
    for (const id of check.dependsOn.map(String)) {
      const at = checks.findIndex((candidate) => candidate.id === id);
      if (at < 0) problems.push(`${check.id}: dependsOn names ${id}, which is not a check in this journey`);
      else if (at >= index) problems.push(`${check.id}: dependsOn names ${id}, which runs after it`);
    }
  });
  return problems;
}
