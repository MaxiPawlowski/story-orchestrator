// v2.6 plan 05 R3: pin one role's reasoning effort for a measurement run (extraction.routes[role].route.options.effort),
// read back what the connection actually did with it, and put the role map back afterwards.
import type { Page } from 'playwright';
import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';

export const EFFORT_ARMS = ['default', 'off', 'low', 'medium', 'high'] as const;

export type EffortArm = typeof EFFORT_ARMS[number];

export function parseEffortArm(raw: string | null | undefined): EffortArm | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (!(EFFORT_ARMS as readonly string[]).includes(raw)) throw new Error(`--effort must be one of ${EFFORT_ARMS.join(', ')}; got "${raw}"`);
  return raw as EffortArm;
}

export const effortArmLabel = (base: string, effort: EffortArm | null): string => (effort ? `${base}-effort-${effort}` : base);

export function nextRoutes(before: Record<string, unknown>, role: string, effort: EffortArm): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(before).filter(([key]) => key !== role));
  return effort === 'default' ? rest : { ...rest, [role]: { route: { options: { effort } } } };
}

export async function pinRoleEffort(page: Page, role: string, effort: EffortArm): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> {
  const routes = await evaluateInST(page, () => ({ ...(globalThis.storyOrchestratorRuntime.getGlobalSettings().extraction.routes ?? {}) }));
  const next = nextRoutes(routes, role, effort);
  const after = await evaluateInST(page, (next) => {
    const rt = globalThis.storyOrchestratorRuntime;
    rt.setExtractionSettings({ routes: next });
    return rt.getGlobalSettings().extraction.routes ?? {};
  }, next);
  return { before: routes, after };
}

export async function restoreRoleEfforts(page: Page, before: Record<string, unknown>): Promise<Record<string, unknown>> {
  const after = await evaluateInST(page, (before) => {
    const rt = globalThis.storyOrchestratorRuntime;
    rt.setExtractionSettings({ routes: before });
    return rt.getGlobalSettings().extraction.routes ?? {};
  }, before);
  await saveSettingsNow(page);
  return after;
}

export async function readRoleReasoning(page: Page, role: string): Promise<unknown> {
  return evaluateInST(page, (role) => {
    const route = (globalThis.storyOrchestratorRuntime.getSnapshot().roleRoutes ?? []).find((entry) => entry.role === role) ?? null;
    return route ? { effort: route.effort, state: route.state, reasoning: route.reasoning ?? null, detail: route.detail } : null;
  }, role);
}

export function latencyPercentiles(samples: number[]): { p50: number | null; p95: number | null; n: number } {
  const sorted = samples.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : null);
  return { p50: at(0.5), p95: at(0.95), n: sorted.length };
}

export function nextProfiles(before: Record<string, string>, role: string, profileId: string): Record<string, string> {
  return { ...before, [role]: profileId };
}

export async function pinRoleProfile(page: Page, role: string, profile: string): Promise<{ before: Record<string, string>; profile: { id: string; name: string } }> {
  return evaluateInST(page, ({ role, profile }) => {
    const rt = globalThis.storyOrchestratorRuntime;
    const profiles = SillyTavern.getContext().extensionSettings?.connectionManager?.profiles ?? [];
    const chosen = profiles.find((entry) => entry.id === profile || entry.name === profile);
    if (!chosen) throw new Error(`no Connection Manager profile named or id'd "${profile}"`);
    const before = { ...(rt.getGlobalSettings().extraction.profiles ?? {}) };
    rt.setExtractionSettings({ profiles: { ...before, [role]: chosen.id } });
    const after = rt.getGlobalSettings().extraction.profiles ?? {};
    if (after[role] !== chosen.id) throw new Error(`the ${role} role did not take profile "${chosen.name}"`);
    return { before, profile: { id: chosen.id, name: chosen.name } };
  }, { role, profile });
}

export async function restoreRoleProfiles(page: Page, before: Record<string, string>): Promise<Record<string, string>> {
  const after = await evaluateInST(page, (before) => {
    const rt = globalThis.storyOrchestratorRuntime;
    rt.setExtractionSettings({ profiles: before });
    return rt.getGlobalSettings().extraction.profiles ?? {};
  }, before);
  await saveSettingsNow(page);
  return after;
}
