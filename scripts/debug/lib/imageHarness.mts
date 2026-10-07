import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEBUG_DIR, PROJECT_ROOT } from './connection.mts';
import { EVIDENCE_V27, harnessGaps, imageHarnessPath, loadImageHarness, NotRunnableError, type ImageHarnessConfig, type ImageNeed, type LoadedHarness } from './imageHarnessConfig.mts';

export const CAST_MANIFEST = resolve(DEBUG_DIR, 'image-cast.json');

export const laneHarness = (env: NodeJS.ProcessEnv = process.env): LoadedHarness => loadImageHarness(imageHarnessPath(env, DEBUG_DIR, PROJECT_ROOT));

export function requireHarness(needs: readonly ImageNeed[], env: NodeJS.ProcessEnv = process.env): ImageHarnessConfig {
  const loaded = laneHarness(env);
  const gaps = harnessGaps(loaded, needs);
  if (gaps.length) throw new NotRunnableError(gaps);
  return loaded.config ?? {};
}

export const evidencePath = (...parts: string[]) => resolve(PROJECT_ROOT, EVIDENCE_V27, ...parts);

export const argValue = (args: string[], name: string, fallback: string | null = null): string | null => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback;
};

export async function builderBox(page, folder: string, given: [number, number, number, number] | null): Promise<[number, number, number, number]> {
  if (given) return given;
  const saved = await page.evaluate((folder) => (globalThis as any).storyOrchestratorRuntime?.getGlobalSettings?.()?.sprites?.builders?.[folder]?.box ?? null, folder);
  const seeded = existsSync(CAST_MANIFEST) ? JSON.parse(readFileSync(CAST_MANIFEST, 'utf8')).members?.find((member) => member.name === folder)?.box ?? null : null;
  const box = saved ?? seeded;
  if (!box) throw new NotRunnableError([`no face box for "${folder}": pass --box x,y,width,height, seed the cast with <art>/<short>/box.json, or save one in the Studio Sprites tab first`]);
  return [box.x, box.y, box.width, box.height];
}
