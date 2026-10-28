import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isModelClass, parseModelFilter, type ModelClass } from './modelClass.mts';

export const BATCH_LISTS_FORMAT = 'so-batch-lists/1';
export const BATCH_LISTS_DIR = join('test', 'batches');
export const ROW_KINDS = ['journey', 'scenario', 'script'] as const;
export type RowKind = (typeof ROW_KINDS)[number];

export interface BatchRow {
  id: string;
  kind: RowKind;
  target: string;
  model: ModelClass;
  controller: boolean;
  gpu?: boolean;
  repeat?: number;
  new?: boolean;
  missing?: boolean;
  branch?: string;
  when?: string;
  note?: string;
}

export interface BatchList { why: string; rows: BatchRow[] }
export interface BatchListsFile { format: typeof BATCH_LISTS_FORMAT; title: string; source: string; rules: string[]; lists: Record<string, BatchList> }

export type RowPlan = 'gpu' | 'record-then-replay' | 'replay' | 'no-model' | 'missing' | 'other-branch';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function rowPlan(row: BatchRow): RowPlan {
  if (row.missing) return 'missing';
  if (row.branch) return 'other-branch';
  if (row.kind === 'script') return row.gpu || row.model === 'judged' ? 'gpu' : row.model === 'none' ? 'no-model' : row.controller ? 'record-then-replay' : 'replay';
  if (row.model === 'judged') return 'gpu';
  if (row.model === 'none') return 'no-model';
  return row.controller ? 'record-then-replay' : 'replay';
}

export function parseListSpec(spec: string): { file: string; names: string[] | null } {
  const [file, names] = spec.split(':');
  if (!file || !/^[a-z0-9][a-z0-9-]*$/.test(file)) throw new Error(`--list takes <file>[:list,list], file = a test/batches/<file>.json basename; got ${JSON.stringify(spec)}`);
  return { file, names: names ? names.split(',').map((name) => name.trim()).filter(Boolean) : null };
}

export function loadBatchLists(root: string, file: string): BatchListsFile {
  const path = resolve(root, BATCH_LISTS_DIR, `${file}.json`);
  if (!existsSync(path)) throw new Error(`no batch list file ${path}`);
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as BatchListsFile;
  if (parsed?.format !== BATCH_LISTS_FORMAT) throw new Error(`${path} is not ${BATCH_LISTS_FORMAT}`);
  return parsed;
}

export function journeyIds(root: string): Set<string> {
  const dir = resolve(root, 'test', 'journeys');
  const ids = new Set<string>();
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.journey.json'))) {
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
    if (typeof parsed?.id === 'string') ids.add(parsed.id);
  }
  return ids;
}

export function journeyClasses(root: string, id: string): Set<string> {
  const dir = resolve(root, 'test', 'journeys');
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.journey.json'))) {
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
    if (parsed?.id === id) return new Set((parsed.checks ?? []).map((check: { model?: unknown }) => String(check.model)));
  }
  return new Set();
}

const scriptPath = (target: string): string | null => /^node\s+(\S+\.(?:mts|mjs|js))/.exec(target)?.[1] ?? null;

export function batchListProblems(file: BatchListsFile, root: string): string[] {
  const problems: string[] = [];
  const journeys = journeyIds(root);
  if (!isRecord(file.lists) || !Object.keys(file.lists).length) return ['no lists'];
  const seen = new Set<string>();
  for (const [name, list] of Object.entries(file.lists)) {
    if (!list.why) problems.push(`${name}: missing why`);
    if (!Array.isArray(list.rows) || !list.rows.length) { problems.push(`${name}: no rows`); continue; }
    for (const row of list.rows) {
      const at = `${name}.${row.id ?? '?'}`;
      if (!row.id || !/^[a-z0-9][a-z0-9-]*$/.test(row.id)) problems.push(`${at}: id must be kebab-case`);
      if (seen.has(row.id)) problems.push(`${at}: id used twice in the file`);
      seen.add(row.id);
      if (!(ROW_KINDS as readonly string[]).includes(row.kind)) problems.push(`${at}: kind ${JSON.stringify(row.kind)} is not ${ROW_KINDS.join(', ')}`);
      if (!isModelClass(row.model)) problems.push(`${at}: model ${JSON.stringify(row.model)} is not judged, any or none`);
      if (typeof row.controller !== 'boolean') problems.push(`${at}: controller must be true or false`);
      if (!row.target) problems.push(`${at}: no target`);
      if (row.missing && row.kind !== 'script') problems.push(`${at}: a missing row is a script row (nothing to batch yet)`);
      if (row.model === 'none' && row.controller) problems.push(`${at}: a none row never reaches the controller`);
      if (row.repeat !== undefined && (!Number.isInteger(row.repeat) || row.repeat < 1)) problems.push(`${at}: repeat must be a positive integer`);
      if (row.missing || row.branch) continue;
      if (row.kind === 'journey') {
        if (!journeys.has(row.target)) problems.push(`${at}: no journey ${row.target} in test/journeys`);
        else if (!journeyClasses(root, row.target).has(row.model)) problems.push(`${at}: journey ${row.target} has no ${row.model} check`);
      }
      if (row.kind === 'scenario') {
        const path = resolve(root, row.target);
        if (!existsSync(path)) problems.push(`${at}: ${row.target} does not exist`);
        else {
          const fixture = JSON.parse(readFileSync(path, 'utf-8'));
          if (fixture?.model !== row.model) problems.push(`${at}: ${row.target} declares model ${JSON.stringify(fixture?.model)}, the row says ${row.model}`);
        }
      }
      if (row.kind === 'script') {
        if (typeof row.gpu !== 'boolean') problems.push(`${at}: a script row states gpu true or false`);
        const script = scriptPath(row.target);
        if (script && !existsSync(resolve(root, script))) problems.push(`${at}: ${script} does not exist`);
      }
    }
  }
  return problems;
}

export interface ListSelection {
  spec: string;
  lists: string[];
  filter: ModelClass[] | null;
  items: string[];
  repeat: number;
  rows: Array<BatchRow & { list: string; plan: RowPlan }>;
  scripts: Array<BatchRow & { list: string; plan: RowPlan }>;
  deselected: string[];
  notBatchable: Array<BatchRow & { list: string; plan: RowPlan }>;
}

export function selectList(file: BatchListsFile, spec: string, names: string[] | null, filterRaw: string | null): ListSelection {
  const unknown = (names ?? []).filter((name) => !file.lists[name]);
  if (unknown.length) throw new Error(`unknown list(s) ${unknown.join(', ')}; known: ${Object.keys(file.lists).join(', ')}`);
  const chosen = names ?? Object.keys(file.lists);
  const filter = parseModelFilter(filterRaw);
  const all = chosen.flatMap((list) => file.lists[list].rows.map((row) => ({ ...row, list, plan: rowPlan(row) })));
  const selection: ListSelection = { spec, lists: chosen, filter, items: [], repeat: 1, rows: [], scripts: [], deselected: [], notBatchable: [] };
  for (const row of all) {
    if (row.kind === 'script' || row.missing || row.branch) {
      (row.kind === 'script' && !row.missing && !row.branch ? selection.scripts : selection.notBatchable).push(row);
      continue;
    }
    if (filter && !filter.includes(row.model)) { selection.deselected.push(row.id); continue; }
    selection.rows.push(row);
    if (!selection.items.includes(row.target)) selection.items.push(row.target);
    selection.repeat = Math.max(selection.repeat, row.repeat ?? 1);
  }
  return selection;
}

export function listPlanLines(selection: ListSelection): string[] {
  const lines = [`list ${selection.spec}: ${selection.items.length} batch item(s) from ${selection.rows.length} row(s)${selection.filter ? ` (--model ${selection.filter.join(',')}; ${selection.deselected.length} row(s) of other classes left out)` : ''}`];
  if (selection.repeat > 1) lines.push(`  a selected row asks --repeat ${selection.repeat}`);
  for (const row of selection.scripts) lines.push(`  run separately (${row.plan}${row.new ? ', new' : ''}): ${row.target}`);
  for (const row of selection.notBatchable) lines.push(`  not batchable (${row.plan}${row.branch ? ` on ${row.branch}` : ''}): ${row.id}: ${row.target}`);
  return lines;
}
