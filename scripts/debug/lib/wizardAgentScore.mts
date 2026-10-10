export interface AgentStepRecord {
  status: string;
  family: string | null;
  firstTryValid: boolean;
  route: string;
}

export interface AgentRunRecord {
  premise: string;
  route: string;
  finished: boolean;
  validationErrors: number;
  steps: AgentStepRecord[];
}

export interface InstallInventory {
  characters: string[];
  lorebooks: string[];
  groups: string[];
  persona: string | null;
  selectedLorebooks: string[];
}

const ratio = (part: number, whole: number) => (whole ? part / whole : null);

const WRITE_FAMILIES = new Set(["edit", "provision"]);
const KEPT = new Set(["accepted", "applied"]);

export function scoreAgentRuns(runs: AgentRunRecord[], floors: { W1: Record<string, number>; W2: number; W3: number }) {
  const routes = [...new Set(runs.map((run) => run.route))];
  const W1 = Object.fromEntries(routes.map((route) => {
    const steps = runs.filter((run) => run.route === route).flatMap((run) => run.steps);
    const valid = steps.filter((step) => step.firstTryValid).length;
    const rate = ratio(valid, steps.length);
    const floor = floors.W1[route] ?? null;
    return [route, { valid, calls: steps.length, rate, floor, pass: rate !== null && floor !== null && rate >= floor }];
  }));
  const finished = runs.filter((run) => run.finished);
  const validStories = finished.filter((run) => run.validationErrors === 0).length;
  const w2Rate = ratio(validStories, finished.length);
  const writes = runs.flatMap((run) => run.steps).filter((step) => step.family !== null && WRITE_FAMILIES.has(step.family) && step.status !== "refused");
  const accepted = writes.filter((step) => KEPT.has(step.status)).length;
  const w3Rate = ratio(accepted, writes.length);
  return {
    W1,
    W2: { finished: finished.length, valid: validStories, rate: w2Rate, floor: floors.W2, pass: finished.length === runs.length && w2Rate !== null && w2Rate >= floors.W2 },
    W3: { accepted, proposed: writes.length, rate: w3Rate, floor: floors.W3, pass: w3Rate !== null && w3Rate >= floors.W3 },
  };
}

const changed = (label: string, before: string[], after: string[]) => {
  const was = new Set(before);
  const now = new Set(after);
  return [
    ...after.filter((name) => !was.has(name)).map((name) => `${label} added: ${name}`),
    ...before.filter((name) => !now.has(name)).map((name) => `${label} removed: ${name}`),
  ];
};

export function w5Escapes(before: InstallInventory, after: InstallInventory, draftMatchesReplay: boolean): string[] {
  return [
    ...changed("character", before.characters, after.characters),
    ...changed("lorebook", before.lorebooks, after.lorebooks),
    ...changed("group", before.groups, after.groups),
    ...changed("selected lorebook", before.selectedLorebooks, after.selectedLorebooks),
    ...(before.persona !== after.persona ? [`persona changed: ${before.persona} -> ${after.persona}`] : []),
    ...(draftMatchesReplay ? [] : ["the draft differs from the replay of the accepted steps"]),
  ];
}

export interface RecipeTask {
  id: string;
  recipe: string;
  requires: string[];
}

export function scoreRecipeTask(task: RecipeTask, result: { session: { status: string; steps: Array<{ status: string; call: { tool: string; args: Record<string, unknown> } }> }; validationErrors: number }) {
  const steps = result.session.steps;
  const readRecipe = steps.some((step) => step.call.tool === 'readRecipe' && String(step.call.args.recipe ?? '').trim().toLowerCase() === task.recipe && step.status === 'observed');
  const missing = task.requires.filter((tool) => !steps.some((step) => step.call.tool === tool && KEPT.has(step.status)));
  const finished = result.session.status === 'done';
  return { readRecipe, missing, finished, validationErrors: result.validationErrors, pass: readRecipe && !missing.length && finished && result.validationErrors === 0 };
}
