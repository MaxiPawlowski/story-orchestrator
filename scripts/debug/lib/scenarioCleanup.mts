type Step = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// A fixture's own cleanup runs in the runner's `finally`, so a run that fails midway still removes
// what its steps created. Same shape the journey runner takes: `cleanup: { steps: [...] }`.
export function fixtureCleanupSteps(scenario: unknown): Step[] {
  if (!isRecord(scenario) || !isRecord(scenario.cleanup)) return [];
  const steps = scenario.cleanup.steps;
  return Array.isArray(steps) ? steps.filter(isRecord) : [];
}

export function removesMarkedAssets(steps: Step[], marker: string): boolean {
  return steps.some((step) => isRecord(step.assets) && step.assets.action === 'remove' && step.assets.marker === marker);
}
