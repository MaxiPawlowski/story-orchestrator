export type Precondition = { step: number; path: string; atLeast: number };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function preconditionProblems(value: unknown, index: number, at: string): string[] {
  if (!isRecord(value)) return [`${at}.precondition: expected {step, path, atLeast}`];
  const extra = Object.keys(value).filter((key) => !['step', 'path', 'atLeast'].includes(key));
  const problems: string[] = extra.length ? [`${at}.precondition: unknown key(s) ${extra.join(', ')}`] : [];
  if (!Number.isSafeInteger(value.step) || (value.step as number) < 1 || (value.step as number) > index) problems.push(`${at}.precondition.step: must name an earlier step of this list (1-based, 1..${index})`);
  if (typeof value.path !== 'string' || !value.path.trim()) problems.push(`${at}.precondition.path: expected a dot path into that step's output`);
  if (typeof value.atLeast !== 'number' || !Number.isFinite(value.atLeast)) problems.push(`${at}.precondition.atLeast: expected a number`);
  return problems;
}

const valueAt = (output: unknown, path: string): unknown => path.split('.').reduce<unknown>((value, key) => (isRecord(value) || Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined), output);

export function vacuousReason(precondition: Precondition, outputs: readonly unknown[]): string | null {
  const ran = precondition.step - 1 in outputs;
  const value = ran ? valueAt(outputs[precondition.step - 1], precondition.path) : undefined;
  const count = typeof value === 'number' ? value : Array.isArray(value) ? value.length : typeof value === 'boolean' ? Number(value) : null;
  if (count !== null && count >= precondition.atLeast) return null;
  return `vacuous: precondition step ${precondition.step} ${precondition.path}=${ran ? JSON.stringify(value ?? null) : '(step did not run)'} needs >= ${precondition.atLeast}; this leg measured nothing`;
}
