import { seededRandom } from './ratingPack.mts';

export const LORE_ARMS = ['on', 'off'] as const;
export type LoreArm = typeof LORE_ARMS[number];

export interface LoreTask { id: string; kind: string; subject: string }
export interface LoreStep { status: string; call: { tool: string; args: Record<string, unknown> } }
export interface LoreEntry { title: string; keys: string[]; content: string }
export interface LoreRunTask { id: string; kind: string; arm: LoreArm; entry: LoreEntry | null }
export interface LorePackEntry { id: string; kind: string; title: string; keys: string[]; content: string }
export interface LorePack { format: 1; rubric: string; entries: LorePackEntry[] }
export interface LoreKey { format: 1; seed: string; entries: Record<string, { arm: LoreArm; task: string; run: string }> }
export type RaterScores = Record<string, { score: number; why?: string | null }>;

const SENT = new Set(['pending', 'accepted', 'applied', 'review', 'rejected']);
const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((word) => word.length > 3);

const entryOf = (step: LoreStep): LoreEntry => ({
  title: String(step.call.args.comment ?? ''),
  keys: Array.isArray(step.call.args.keys) ? step.call.args.keys.map(String) : [],
  content: String(step.call.args.content ?? ''),
});

export function pickLoreEntry(task: Pick<LoreTask, 'subject'>, steps: LoreStep[]): LoreEntry | null {
  const sent = steps.filter((step) => step.call.tool === 'upsertLorebookEntry' && SENT.has(step.status) && String(step.call.args.content ?? '').trim()).map(entryOf);
  const subject = words(task.subject);
  const names = (entry: LoreEntry) => words([entry.title, ...entry.keys].join(' ')).some((word) => subject.includes(word));
  return sent.find(names) ?? sent[0] ?? null;
}

export function buildLorePack(input: { seed: string; rubric: string; runs: Array<{ run: string; tasks: LoreRunTask[] }> }): { pack: LorePack; key: LoreKey; missing: Array<{ run: string; arm: LoreArm; task: string }> } {
  const random = seededRandom(input.seed);
  const rows = input.runs.flatMap((run) => run.tasks.map((task) => ({ run: run.run, task })));
  const order = rows.filter((row) => row.task.entry).map((row) => ({ row, sort: random() })).sort((a, b) => a.sort - b.sort).map((item) => item.row);
  const width = Math.max(2, String(order.length).length);
  const entries: LorePackEntry[] = [];
  const key: LoreKey = { format: 1, seed: input.seed, entries: {} };
  order.forEach(({ run, task }, at) => {
    const id = `E${String(at + 1).padStart(width, '0')}`;
    const entry = task.entry as LoreEntry;
    entries.push({ id, kind: task.kind, title: entry.title, keys: entry.keys, content: entry.content });
    key.entries[id] = { arm: task.arm, task: task.id, run };
  });
  const missing = rows.filter((row) => !row.task.entry).map((row) => ({ run: row.run, arm: row.task.arm, task: row.task.id }));
  return { pack: { format: 1, rubric: input.rubric, entries }, key, missing };
}

export function lorePackLeaks(pack: LorePack, key: LoreKey, markers: string[] = []): string[] {
  const leaks: string[] = [];
  const text = JSON.stringify(pack);
  for (const field of ['"arm"', '"task"', '"run"', '"rule"']) if (text.includes(field)) leaks.push(`the pack carries the field ${field}`);
  for (const marker of markers) if (marker && text.includes(marker)) leaks.push(`the pack names ${marker}`);
  for (const [id, row] of Object.entries(key.entries)) if (!pack.entries.some((entry) => entry.id === id)) leaks.push(`the key names ${id} (${row.task}), which the pack lacks`);
  if (pack.entries.length !== Object.keys(key.entries).length) leaks.push('the pack and the key differ in size');
  return leaks;
}

export const RATER_SYSTEM = 'You are a careful, impartial reader of lorebook entries for interactive fiction. You answer with exactly one JSON object.';

export function raterPrompt(entry: LorePackEntry, rubric: string): string {
  return [
    `A lorebook entry for ${/^[aeiou]/.test(entry.kind) ? 'an' : 'a'} ${entry.kind}. When one of its keys comes up in play, a narrator model receives the entry's content and must play the scene from it.`,
    '',
    `Title: ${entry.title}`,
    `Keys: ${entry.keys.join(', ') || '(none)'}`,
    'Content:',
    '"""',
    entry.content,
    '"""',
    '',
    `Rubric: ${rubric}`,
    '',
    'Answer with exactly one JSON object: {"score": <integer 1-5>, "why": "<one sentence>"}',
  ].join('\n');
}

export function parseRating(text: string): { score: number; why: string | null } | { problem: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return { problem: 'no JSON object in the reply' };
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return { problem: 'the JSON object does not parse' }; }
  const score = (parsed as { score?: unknown }).score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) return { problem: `score is not an integer 1-5: ${JSON.stringify(score)}` };
  const why = (parsed as { why?: unknown }).why;
  return { score, why: typeof why === 'string' ? why.slice(0, 400) : null };
}

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export interface ArmSummary { arm: LoreArm; entries: number; median: number | null; raters: Record<string, number | null> }
export interface LoreRunSummary { run: string; arms: ArmSummary[]; delta: number | null; raterDelta: Record<string, number | null> }

export function aggregateLore(scores: Record<string, RaterScores>, key: LoreKey): { complete: boolean; unrated: string[]; runs: LoreRunSummary[] } {
  const raters = Object.keys(scores).sort();
  const ids = Object.keys(key.entries).sort();
  const unrated = ids.filter((id) => raters.length < 2 || raters.some((rater) => typeof scores[rater][id]?.score !== 'number'));
  const runIds = [...new Set(Object.values(key.entries).map((row) => row.run))].sort();
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  const runs = runIds.map((run): LoreRunSummary => {
    const arms = LORE_ARMS.map((arm): ArmSummary => {
      const mine = ids.filter((id) => key.entries[id].run === run && key.entries[id].arm === arm && !unrated.includes(id));
      const means = mine.map((id) => raters.reduce((sum, rater) => sum + scores[rater][id].score, 0) / raters.length);
      return { arm, entries: mine.length, median: median(means), raters: Object.fromEntries(raters.map((rater) => [rater, median(mine.map((id) => scores[rater][id].score))])) };
    });
    const [on, off] = arms;
    return { run, arms, delta: diff(on.median, off.median), raterDelta: Object.fromEntries(raters.map((rater) => [rater, diff(on.raters[rater], off.raters[rater])])) };
  });
  return { complete: unrated.length === 0, unrated, runs };
}
