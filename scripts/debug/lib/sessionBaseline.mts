import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { settingsPatch, type Card, type CardDoc, type CardSettings, type MediaKind } from './sessionCharters.mts';

export const BASELINE_PATH = resolve(REPO_ROOT, 'test', 'sessions', 'baseline-settings.json');
export const BASELINE_FORMAT = 1;

export interface Baseline { version: number; about?: string; installOwned: string[]; settings: Record<string, any> }

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const loadBaseline = async (path = BASELINE_PATH): Promise<Baseline> => JSON.parse(await readFile(path, 'utf-8'));

export function baselineProblems(baseline: unknown): string[] {
  if (!isRecord(baseline)) return ['the baseline is not an object'];
  const problems: string[] = [];
  if (baseline.version !== BASELINE_FORMAT) problems.push(`baseline version must be ${BASELINE_FORMAT}`);
  if (!Array.isArray(baseline.installOwned) || !baseline.installOwned.every((path) => typeof path === 'string' && path)) problems.push('baseline installOwned must list setting paths');
  if (!isRecord(baseline.settings)) problems.push('baseline settings must be an object');
  else {
    if (baseline.settings.judge?.enabled !== true) problems.push('the baseline keeps the judge on (user decision 2026-09-30)');
    if (baseline.settings.image?.enabled !== false) problems.push('the baseline keeps images off: no lane may reach the shared ComfyUI');
    if (baseline.settings.sprites?.enabled !== false || baseline.settings.sprites?.explicit !== true) problems.push('the baseline switches sprites off explicitly');
  }
  return problems;
}

export const deepMerge = (base: Record<string, any>, patch: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = isRecord(value) && isRecord(base[key]) ? deepMerge(base[key], value) : value;
  return out;
};

export const pathGet = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), value);

const pathSet = (target: Record<string, any>, path: string, value: unknown) => {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = (node[key] = isRecord(node[key]) ? { ...node[key] } : {});
  node[keys[keys.length - 1]] = value;
};

export const leafPaths = (value: unknown, prefix = ''): string[] => {
  if (!isRecord(value) || !Object.keys(value).length) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
};

const owned = (installOwned: readonly string[], path: string) => installOwned.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));

export function overrideChain(doc: CardDoc, card: Card): Array<{ card: string; settings: CardSettings }> {
  const chain: Array<{ card: string; settings: CardSettings }> = [];
  const seen = new Set<string>();
  let current: Card | undefined = card;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift({ card: current.id, settings: current.setup.settings ?? {} });
    current = current.setup.chat === 'continue' ? doc.cards.find((candidate) => candidate.id === current!.setup.continues) : undefined;
  }
  return chain;
}

export interface MediaPlan { variant: 'full' | 'no-media' | 'none'; images: boolean; sprites: boolean; unexercised: MediaKind[]; prerenderedSprites: number }

export function mediaPlan(settings: CardSettings, media: 'on' | 'off', prerenderedSprites = 0): MediaPlan {
  const askedImages = settings.images === true;
  const askedSprites = settings.sprites === true;
  if (media === 'on') return { variant: askedImages || askedSprites ? 'full' : 'none', images: askedImages, sprites: askedSprites, unexercised: [], prerenderedSprites };
  const sprites = askedSprites && prerenderedSprites > 0;
  const unexercised: MediaKind[] = [...(askedImages ? ['images' as const] : []), ...(askedSprites && !sprites ? ['sprites' as const] : [])];
  return { variant: askedImages || askedSprites ? 'no-media' : 'none', images: false, sprites, unexercised, prerenderedSprites };
}

export function effectiveSettings(baseline: Baseline, chain: Array<{ settings: CardSettings }>, media: MediaPlan): Record<string, any> {
  let out = deepMerge({}, baseline.settings);
  for (const step of chain) out = deepMerge(out, settingsPatch(step.settings));
  return deepMerge(out, { image: { enabled: media.images }, sprites: { enabled: media.sprites, explicit: true } });
}

export function applyOverBaseline(current: unknown, effective: Record<string, any>, installOwned: readonly string[]): Record<string, any> {
  const out = deepMerge({}, effective);
  for (const path of installOwned) {
    const kept = pathGet(current, path);
    if (kept !== undefined) pathSet(out, path, kept);
  }
  return out;
}

export function hostSwipesProblems(host: { swipes?: unknown } | null | undefined): string[] {
  if (host?.swipes === true) return [];
  return [`SillyTavern swipes read back ${JSON.stringify(host?.swipes ?? null)} on the lane, expected true: swipe-new cannot run (re-seed with adolion-fresh, which switches them on)`];
}

export function hostImageGenerationProblems(host: { imageGenerationDisabled?: unknown } | null | undefined): string[] {
  if (host?.imageGenerationDisabled === true) return [];
  return [`SillyTavern's Image Generation extension (stable-diffusion) is enabled on the lane page (disabledExtensions read back ${JSON.stringify(host?.imageGenerationDisabled ?? null)}): it contacts ComfyUI at 127.0.0.1:8188 on every page load (re-seed with adolion-fresh, which disables it)`];
}

const OPTIONAL_FLAGS = new Set(['memory.harvestReasoning', 'memory.innerBeat']);

export function effectiveProblems(expected: Record<string, any>, actual: unknown, installOwned: readonly string[]): string[] {
  const problems: string[] = [];
  for (const path of leafPaths(expected)) {
    if (owned(installOwned, path)) continue;
    const want = pathGet(expected, path);
    const got = pathGet(actual, path);
    if (OPTIONAL_FLAGS.has(path) && want === false && got === undefined) continue;
    if (JSON.stringify(want) !== JSON.stringify(got)) problems.push(`setting ${path} is ${JSON.stringify(got)} after the reload, expected ${JSON.stringify(want)}`);
  }
  return problems;
}
