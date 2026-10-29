import { createHash } from 'node:crypto';
import { SCORER_VERSION } from './liveSuiteScore.mts';
import { evaluateInST } from './evaluate.mts';

export interface MeasurementFingerprints {
  prompt: string | null;
  scorer: number;
  model: string | null;
  config: string | null;
}

export const FINGERPRINT_FIELDS = ['prompt', 'scorer', 'model', 'config'] as const;
export type FingerprintField = typeof FINGERPRINT_FIELDS[number];

export const CONFIG_FIELDS = ['host.mainApi', 'profiles', 'judge', 'stagecraft', 'extraction', 'spikes', 'sampler', 'prompt'] as const;

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
};

const at = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), value);

export const promptFingerprint = (prompts: readonly string[]): string | null =>
  (prompts.length ? sha(prompts.map(sha).sort().join('\n')).slice(0, 16) : null);

export const configFingerprint = (header: unknown): string | null =>
  (header && typeof header === 'object' ? sha(stable(Object.fromEntries(CONFIG_FIELDS.map((path) => [path, at(header, path) ?? null])))).slice(0, 16) : null);

export const fingerprintsOf = (input: { prompts: readonly string[]; model: string | null; header: unknown }): MeasurementFingerprints => ({
  prompt: promptFingerprint(input.prompts),
  scorer: SCORER_VERSION,
  model: input.model,
  config: configFingerprint(input.header),
});

export function compareFingerprints(
  left: Partial<MeasurementFingerprints> | null | undefined,
  right: Partial<MeasurementFingerprints> | null | undefined,
  declared: readonly string[] = [],
): { comparable: boolean; differs: FingerprintField[]; missing: boolean } {
  if (!left || !right) return { comparable: false, differs: [], missing: true };
  const differs = FINGERPRINT_FIELDS.filter((field) => (left[field] ?? null) !== (right[field] ?? null) && !declared.includes(field));
  return { comparable: differs.length === 0, differs, missing: false };
}

export const readRoleModel = (page, role: string): Promise<string | null> => evaluateInST(page, async (passRole) => {
  const ctx = (globalThis as any).SillyTavern.getContext();
  const rt = (globalThis as any).storyOrchestratorRuntime;
  const route = rt?.getGlobalSettings?.()?.extraction?.routes?.[passRole]?.route;
  if (route?.kind === 'harness' && route.model) return `${route.harness}:${route.model}`;
  const measured = await (globalThis as any).storyOrchestratorLiveSuite?.measureBudget?.('x', passRole).catch(() => null);
  const profile = (ctx.extensionSettings?.connectionManager?.profiles ?? []).find((entry) => entry?.id === measured?.profileId);
  return profile ? String(profile.model ?? profile.name ?? profile.id) : null;
}, role);
