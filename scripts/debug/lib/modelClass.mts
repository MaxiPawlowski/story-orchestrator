export const MODEL_CLASSES = ['judged', 'any', 'none'] as const;
export type ModelClass = (typeof MODEL_CLASSES)[number];
export const MODEL_FLAG = '--model';

type Check = { id: string; model?: unknown; dependsOn?: unknown };

export const isModelClass = (value: unknown): value is ModelClass => typeof value === 'string' && (MODEL_CLASSES as readonly string[]).includes(value);

export function modelClassProblems(value: unknown, where: string, required = false): string[] {
  if (value === undefined) return required ? [`${where}.model: missing; declare "judged", "any" or "none"`] : [];
  return isModelClass(value) ? [] : [`${where}.model: ${JSON.stringify(value)} is not one of ${MODEL_CLASSES.join(', ')}`];
}

export function parseModelFilter(raw: string | null | undefined): ModelClass[] | null {
  if (raw === null || raw === undefined) return null;
  const list = String(raw).split(',').map((part) => part.trim()).filter(Boolean);
  const bad = list.filter((part) => !isModelClass(part));
  if (!list.length || bad.length) throw new Error(`${MODEL_FLAG} takes a comma list of ${MODEL_CLASSES.join(', ')}; got ${JSON.stringify(raw)}`);
  return [...new Set(list)] as ModelClass[];
}

export const classOf = (item: { model?: unknown }): ModelClass | null => (isModelClass(item.model) ? item.model : null);

const depsOf = (check: Check): string[] => (Array.isArray(check.dependsOn) ? check.dependsOn.map(String) : []);

export function dependencyClosure(checks: Check[], ids: string[]): string[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const out = new Set<string>();
  const visit = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    const check = byId.get(id);
    if (check) depsOf(check).forEach(visit);
  };
  ids.forEach(visit);
  return checks.map((check) => check.id).filter((id) => out.has(id));
}

export interface ModelSelection {
  filter: ModelClass[];
  selected: string[];
  pulled: string[];
  only: string[];
  deselected: Record<string, ModelClass | null>;
}

export function modelSelection(checks: Check[], filter: ModelClass[], only: string[] | null = null): ModelSelection {
  const pool = only ? checks.filter((check) => only.includes(check.id)) : checks;
  const noModel = filter.every((entry) => entry === 'none');
  const runnable = noModel ? new Set(noModelRunnable(checks, true)) : null;
  const selected = pool.filter((check) => {
    const found = classOf(check);
    return found !== null && filter.includes(found) && (!runnable || runnable.has(check.id));
  }).map((check) => check.id);
  const run = dependencyClosure(checks, selected);
  const pulled = run.filter((id) => !selected.includes(id));
  const deselected: Record<string, ModelClass | null> = {};
  for (const check of pool) if (!run.includes(check.id)) deselected[check.id] = classOf(check);
  return { filter, selected, pulled, only: run, deselected };
}

export function noModelRunnable(checks: Array<Check & { mode?: string }>, withHuman = false): string[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const clean = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return true;
    seen.add(id);
    const check = byId.get(id);
    if (!check || classOf(check) !== 'none') return false;
    return depsOf(check).every((dep) => clean(dep, seen));
  };
  return checks.filter((check) => (withHuman || check.mode !== 'human') && clean(check.id)).map((check) => check.id);
}

export interface CensusEntry {
  where: string;
  model: unknown;
  needsLlm: boolean;
  lane?: string | null;
}

export function censusProblems(entries: CensusEntry[]): string[] {
  const problems: string[] = [];
  for (const entry of entries) {
    const missing = modelClassProblems(entry.model, entry.where, true);
    if (missing.length) { problems.push(...missing); continue; }
    if (entry.lane === 'no-model' && entry.model !== 'none') problems.push(`${entry.where}: requires.lane no-model but model is ${String(entry.model)}`);
    if (entry.lane === 'model' && entry.model === 'none') problems.push(`${entry.where}: requires.lane model but model is none`);
    if (entry.needsLlm && entry.model === 'none') problems.push(`${entry.where}: its steps call a model (send_generate, an unmocked pass or a model ui action) but model is none`);
  }
  return problems;
}

export function scenarioModelSkip(doc: unknown, filter: ModelClass[]): string | null {
  const found = doc && typeof doc === 'object' && !Array.isArray(doc) ? classOf(doc as { model?: unknown }) : null;
  return found !== null && filter.includes(found) ? null : deselectedDetail(found, filter);
}

export function deselectedDetail(found: ModelClass | null, filter: ModelClass[]): string {
  return `model class ${found ?? 'undeclared'} not selected by ${MODEL_FLAG} ${filter.join(',')}`;
}
