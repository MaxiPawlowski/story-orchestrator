import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Page } from 'playwright';
import { ARM_EVAL, DISARM_EVAL, drainRecorder, installRecorder, setRecorderPlan, type RecorderPlan, type RecorderState } from './promptBatchRecorder.mts';

type Step = Record<string, unknown>;
export interface Scenario { requires?: Record<string, unknown>; steps: Step[]; [key: string]: unknown }

export interface VariantPlan {
  armBefore: (step: Step, index: number) => boolean;
  contextAfter: (step: Step, index: number) => boolean;
  contextEval: string;
  truncate?: boolean;
  edits?: Array<{ step: (step: Step, index: number) => boolean; from: string; to: string }>;
  note: string;
  sourceDir?: string;
}

const findIndex = (steps: Step[], test: (step: Step, index: number) => boolean, what: string): number => {
  const found = steps.map((step, index) => (test(step, index) ? index : -1)).filter((index) => index >= 0);
  if (found.length !== 1) throw new Error(`capture variant: expected exactly one ${what} step, found ${found.length}`);
  return found[0];
};

export function captureVariant(scenario: Scenario, plan: VariantPlan): Scenario {
  const rebase = (step: Step): Step => {
    const value = step.import_story as { file?: unknown } | undefined;
    return plan.sourceDir && value && typeof value.file === 'string' && !isAbsolute(value.file) ? { ...step, import_story: { ...value, file: resolve(plan.sourceDir, value.file) } } : step;
  };
  const steps = scenario.steps.map((step) => rebase({ ...step }));
  for (const edit of plan.edits ?? []) {
    const at = findIndex(steps, edit.step, `edit "${edit.from}"`);
    const code = steps[at].eval;
    if (typeof code !== 'string' || !code.includes(edit.from)) throw new Error(`capture variant: step ${at} has no "${edit.from}" to replace`);
    steps[at] = { ...steps[at], eval: code.replace(edit.from, edit.to) };
  }
  const arm = findIndex(steps, plan.armBefore, 'arm');
  const after = findIndex(steps, plan.contextAfter, 'context');
  if (after < arm) throw new Error('capture variant: the context step comes before the armed window');
  const kept = plan.truncate ? steps.slice(0, after + 1) : steps;
  const out = [
    ...kept.slice(0, arm), { eval: ARM_EVAL }, ...kept.slice(arm, after + 1), { log: true, eval: plan.contextEval }, { eval: DISARM_EVAL }, ...kept.slice(after + 1),
  ];
  return { ...scenario, _note: `${plan.note} ${String(scenario._note ?? '')}`.trim(), requires: { ...(scenario.requires ?? {}), lane: 'no-model' }, steps: out };
}

export interface ScenarioRun extends RecorderState {
  ok: boolean;
  stepsOk: boolean;
  notRunnable: boolean;
  error?: string;
  steps: unknown[];
}

export const SETTLE_MS = 3000;

export async function freshPage(page: Page, timeout = 60_000): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await page.reload({ waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => Boolean((globalThis as { storyOrchestratorRuntime?: unknown }).storyOrchestratorRuntime), null, { timeout });
  const { ensureSTReady } = await import('./st-ready.mts');
  await ensureSTReady(page);
  await page.waitForTimeout(1500);
  await installRecorder(page);
}

export async function runScenarioItem(page: Page, file: string, variant: Scenario, plan: RecorderPlan, { reload = false }: { reload?: boolean } = {}): Promise<ScenarioRun> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(variant, null, 2)}\n`, 'utf-8');
  const { runScenario } = await import('../so-scenario.mts');
  if (reload) await freshPage(page);
  else await page.waitForTimeout(SETTLE_MS);
  await setRecorderPlan(page, plan);
  let result: Record<string, unknown> = {};
  let error: string | undefined;
  try {
    result = await runScenario(page, file, { sandbox: true });
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown);
  }
  const state = await drainRecorder(page);
  const steps = (result.steps as Array<{ ok?: boolean; error?: string }> | undefined) ?? [];
  const failed = steps.find((step) => step?.ok === false);
  const stepsOk = !error && !failed && result.notRunnable !== true && steps.length >= variant.steps.length;
  return {
    ...state, ok: !error && result.ok === true, stepsOk, notRunnable: result.notRunnable === true, steps,
    ...(error || result.ok !== true ? { error: error ?? String(result.error ?? failed?.error ?? 'the scenario did not pass') } : {}),
  };
}

export async function pinMemoryProfile(page: Page, profileId: string | null): Promise<string | null> {
  return page.evaluate((id: string | null) => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const before = rt.getGlobalSettings().extraction.profileId ?? null;
    rt.setExtractionSettings({ profileId: id });
    if ((rt.getGlobalSettings().extraction.profileId ?? null) !== id) throw new Error(`the memory model did not take profile ${id}`);
    return before;
  }, profileId);
}
