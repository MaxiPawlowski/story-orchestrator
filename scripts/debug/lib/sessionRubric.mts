import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { RUBRIC_SCORES, USER_REVIEW } from './sessionCharters.mts';

export const SCORER = 'claude';
const IMAGE = /\.(png|jpe?g|webp)$/i;
const WHOLE_FILE = /\.json$/i;

export interface EvidenceRef { raw: string; path: string; line: number | null }

export function parseEvidence(raw: string): EvidenceRef {
  const match = /^(.*?):(\d+)$/.exec(raw.trim());
  if (match && !/^[A-Za-z]$/.test(match[1])) return { raw, path: match[1].replace(/\\/g, '/'), line: Number(match[2]) };
  return { raw, path: raw.trim().replace(/\\/g, '/'), line: null };
}

export function evidenceRefProblems(dir: string, ref: EvidenceRef): string[] {
  if (isAbsolute(ref.path) || ref.path.split('/').includes('..')) return [`${ref.raw}: evidence must be a path inside the session dir`];
  const full = resolve(dir, ref.path);
  if (relative(dir, full).startsWith('..')) return [`${ref.raw}: evidence must be a path inside the session dir`];
  if (!existsSync(full) || !statSync(full).isFile()) return [`${ref.raw}: no such file in the session dir`];
  if (ref.line === null) return IMAGE.test(ref.path) || WHOLE_FILE.test(ref.path) ? [] : [`${ref.raw}: cite a line (path:line), a screenshot or a whole .json file`];
  if (IMAGE.test(ref.path)) return [`${ref.raw}: a screenshot has no lines`];
  const lines = readFileSync(full, 'utf-8').split(/\r?\n/).length;
  return ref.line >= 1 && ref.line <= lines ? [] : [`${ref.raw}: line ${ref.line} is outside the file (${lines} lines)`];
}

export function findRow(rubric: any, rowRef: string): number {
  const rows: any[] = rubric?.rows ?? [];
  if (/^\d+$/.test(rowRef)) {
    const at = Number(rowRef);
    if (at < rows.length) return at;
    throw new Error(`the rubric has ${rows.length} rows; there is no row ${at}`);
  }
  const needle = rowRef.trim().toLowerCase();
  const exact = rows.findIndex((row) => String(row.feature).toLowerCase() === needle);
  if (exact >= 0) return exact;
  const partial = rows.map((row, at) => ({ row, at })).filter(({ row }) => String(row.feature).toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0].at;
  throw new Error(partial.length ? `"${rowRef}" matches ${partial.map(({ row }) => `"${row.feature}"`).join(', ')}: use the row number` : `no rubric row matches "${rowRef}" (rows: ${rows.map((row, at) => `${at} ${row.feature}`).join('; ')})`);
}

export function scoreRow(rubric: any, dir: string, { row, score, note, evidence, record = false, at = new Date().toISOString(), provisional = false }: {
  row: string; score: string | null; note: string; evidence: string[]; record?: boolean; at?: string; provisional?: boolean;
}) {
  const index = findRow(rubric, row);
  const target = rubric.rows[index];
  if (!note.trim()) throw new Error('a score needs a note saying what was seen');
  if (!evidence.length) throw new Error('a score needs at least one --evidence <path:line|screenshot>');
  const refs = evidence.map(parseEvidence);
  const problems = refs.flatMap((ref) => evidenceRefProblems(dir, ref));
  if (problems.length) throw new Error(`evidence refused:\n- ${problems.join('\n- ')}`);
  if (target.reviewer === 'user') {
    if (!record || score !== null) throw new Error(`row "${target.feature}" is ${USER_REVIEW}: pass --record with a note and evidence and no score`);
  } else if (record) throw new Error(`row "${target.feature}" is scored by Claude: give a score instead of --record`);
  else if (!(RUBRIC_SCORES as readonly string[]).includes(String(score))) throw new Error(`score must be one of ${RUBRIC_SCORES.join(', ')}`);
  const next = {
    ...target,
    score: target.reviewer === 'user' ? null : score,
    note,
    evidence: refs.map((ref) => (ref.line === null ? ref.path : `${ref.path}:${ref.line}`)),
    scoredBy: target.reviewer === 'user' ? null : SCORER,
    recordedBy: SCORER,
    scoredAt: at,
    ...(provisional ? { provisional: true } : {}),
  };
  if (!provisional) delete (next as { provisional?: boolean }).provisional;
  const rows = [...rubric.rows];
  rows[index] = next;
  return { rubric: { ...rubric, rows }, row: next, index };
}
