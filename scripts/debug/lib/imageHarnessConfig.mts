import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export interface EditModels { diffusion: string; encoder: string; vae: string }

export interface ImageHarnessConfig {
  allowComfy?: boolean;
  editModels?: EditModels;
  backgroundRemoval?: string;
  raterProfile?: string;
  controllerUrl?: string;
  localProfiles?: { main: string; memory: string };
  why?: string;
}

export const IMAGE_HARNESS_FILE = 'image-harness.json';
export const IMAGE_HARNESS_EXAMPLE = 'scripts/debug/image-harness.example.json';
export const IMAGE_HARNESS_KEYS = new Set(['allowComfy', 'editModels', 'backgroundRemoval', 'raterProfile', 'controllerUrl', 'localProfiles', 'why']);
export const IMAGE_NEEDS = ['editModels', 'backgroundRemoval', 'rater', 'controller', 'localProfiles'] as const;
export type ImageNeed = typeof IMAGE_NEEDS[number];
export const DISCOVERY_NEEDS = new Set<ImageNeed>(['editModels', 'backgroundRemoval']);
export const EVIDENCE_V27 = 'test/sessions/evidence/measurements-v2.7';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function validateImageHarness(doc: unknown, where = IMAGE_HARNESS_FILE): string[] {
  if (!isRecord(doc)) return [`${where}: expected an object`];
  const problems: string[] = [];
  for (const key of Object.keys(doc)) if (!IMAGE_HARNESS_KEYS.has(key)) problems.push(`${where}: unknown key "${key}" (known: ${[...IMAGE_HARNESS_KEYS].join(', ')})`);
  if ('allowComfy' in doc && typeof doc.allowComfy !== 'boolean') problems.push(`${where}.allowComfy: expected true or false`);
  if ('editModels' in doc && (!isRecord(doc.editModels) || !['diffusion', 'encoder', 'vae'].every((key) => text((doc.editModels as Record<string, unknown>)[key])))) {
    problems.push(`${where}.editModels: expected {diffusion, encoder, vae} file names as ComfyUI lists them`);
  }
  for (const key of ['backgroundRemoval', 'raterProfile', 'why']) if (key in doc && !text(doc[key])) problems.push(`${where}.${key}: expected a non-empty string`);
  if ('controllerUrl' in doc) {
    try {
      if (!/^https?:$/.test(new URL(String(doc.controllerUrl)).protocol)) throw new Error('protocol');
    } catch { problems.push(`${where}.controllerUrl: expected an http(s) URL`); }
  }
  if ('localProfiles' in doc && (!isRecord(doc.localProfiles) || !text(doc.localProfiles.main) || !text(doc.localProfiles.memory))) {
    problems.push(`${where}.localProfiles: expected {main, memory} Connection Manager profile names`);
  }
  return problems;
}

export function imageHarnessPath(env: NodeJS.ProcessEnv, debugDir: string, root: string): string {
  const configured = String(env.SO_IMAGE_HARNESS ?? '').trim();
  if (configured) return isAbsolute(configured) ? configured : resolve(root, configured);
  return resolve(dirname(debugDir), IMAGE_HARNESS_FILE);
}

export interface LoadedHarness { path: string; config: ImageHarnessConfig | null; problems: string[] }

export function loadImageHarness(path: string, read: (path: string) => string | null = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null)): LoadedHarness {
  const raw = read(path);
  if (raw === null) return { path, config: null, problems: [] };
  let doc: unknown;
  try { doc = JSON.parse(raw.replace(/^﻿/, '')); } catch (error) { return { path, config: null, problems: [`${path}: not JSON (${error instanceof Error ? error.message : String(error)})`] }; }
  const problems = validateImageHarness(doc, path);
  return { path, config: problems.length ? null : doc as ImageHarnessConfig, problems };
}

export const comfyCleared = (env: NodeJS.ProcessEnv, config: ImageHarnessConfig | null) => env.SO_ALLOW_COMFY === '1' || config?.allowComfy === true;

export function harnessGaps(loaded: LoadedHarness, needs: readonly ImageNeed[]): string[] {
  if (loaded.problems.length) return loaded.problems;
  if (!loaded.config) return needs.length ? [`needs the lane image-harness config at ${loaded.path} (copy ${IMAGE_HARNESS_EXAMPLE}; set SO_IMAGE_HARNESS to use another file)`] : [];
  const config = loaded.config;
  const missing: Record<ImageNeed, boolean> = {
    editModels: !config.editModels,
    backgroundRemoval: !config.backgroundRemoval,
    rater: !config.raterProfile,
    controller: !config.controllerUrl,
    localProfiles: !config.localProfiles,
  };
  const key: Record<ImageNeed, string> = { editModels: 'editModels', backgroundRemoval: 'backgroundRemoval', rater: 'raterProfile', controller: 'controllerUrl', localProfiles: 'localProfiles' };
  return needs.filter((need) => missing[need]).map((need) => `needs ${key[need]} in ${loaded.path}`);
}

export class NotRunnableError extends Error {
  readonly notRunnable = true;
  constructor(problems: string[]) {
    super(`not-runnable: ${problems.join('; ')}`);
  }
}

export function requireIsolatedLane(env: NodeJS.ProcessEnv, what: string): number {
  const lane = Number(env.SO_LANE);
  if (!Number.isInteger(lane) || lane < 1) throw new NotRunnableError([`${what} runs on an isolated lane: st-lanes.mts run <n> -- ... with n >= 1 (SO_LANE is ${env.SO_LANE ?? 'unset'})`]);
  return lane;
}

export function sameUrl(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.trim() || !b.trim()) return false;
  const norm = (value: string) => {
    try {
      const url = new URL(value.trim());
      return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
    } catch { return value.trim().replace(/\/+$/, '').toLowerCase(); }
  };
  return norm(a) === norm(b);
}

export function parseBox(value: string | null | undefined): [number, number, number, number] | null {
  if (!value) return null;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0)) throw new Error(`--box expects x,y,width,height integers, got "${value}"`);
  return parts as [number, number, number, number];
}

export const slugName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const setSlug = (value: string) => slugName(value).replace(/-/g, '_');
