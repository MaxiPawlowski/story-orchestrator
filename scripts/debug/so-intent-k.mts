import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';

const USAGE = `Usage: node scripts/debug/so-intent-k.mts measure --corpus <id> <file.json...> [--write]

v2.6 plan 06 B: K for the intent lapse. Reads persisted runtime dumps or chat_metadata JSON of the D1 corpus,
takes every scene_summary derived record per memory store, measures the boundaries between consecutive scene
summaries, and prints the median and K = 3 x median. --write sets MEDIAN_BOUNDARIES_PER_SCENE in
src/memory/innerVoice.ts, flips INTENT_LAPSE_K_PROVISIONAL to false and records the measurement in
test/measurements/v2.6-06/k-intent-lapse.json. Refuses below the recipe's minScenes.`;

export const SOURCE_PATH = 'src/memory/innerVoice.ts';
export const RECIPE_PATH = 'test/measurements/v2.6-06/k-intent-lapse.json';
export const K_FACTOR = 3;

interface DerivedLike { kind?: unknown; boundary?: unknown }

export function collectSceneGaps(root: unknown): { stores: number; gaps: number[] } {
  const gaps: number[] = [];
  let stores = 0;
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const derived = (node as { derived?: unknown }).derived;
    if (Array.isArray(derived)) {
      const boundaries = (derived as DerivedLike[])
        .filter((record) => record && record.kind === 'scene_summary' && Number.isFinite(record.boundary))
        .map((record) => Number(record.boundary))
        .sort((a, b) => a - b);
      if (boundaries.length) stores += 1;
      for (let index = 1; index < boundaries.length; index += 1) {
        const gap = boundaries[index] - boundaries[index - 1];
        if (gap > 0) gaps.push(gap);
      }
    }
    for (const value of Object.values(node as Record<string, unknown>)) walk(value);
  };
  walk(root);
  return { stores, gaps };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type KMeasurement =
  | { ok: true; median: number; k: number; scenes: number; chats: number }
  | { ok: false; reason: string; scenes: number; chats: number };

export function measureK(roots: unknown[], minScenes: number): KMeasurement {
  const collected = roots.map(collectSceneGaps);
  const gaps = collected.flatMap((entry) => entry.gaps);
  const chats = collected.reduce((sum, entry) => sum + entry.stores, 0);
  if (gaps.length < minScenes) return { ok: false, reason: `${gaps.length} scene gap(s) measured, the recipe needs at least ${minScenes}`, scenes: gaps.length, chats };
  const value = Math.round(median(gaps) as number);
  if (value < 1) return { ok: false, reason: 'median boundaries per scene is below 1', scenes: gaps.length, chats };
  return { ok: true, median: value, k: K_FACTOR * value, scenes: gaps.length, chats };
}

export function rewriteSource(source: string, medianValue: number): string {
  const medianLine = /export const MEDIAN_BOUNDARIES_PER_SCENE = \d+;/;
  const flagLine = /export const INTENT_LAPSE_K_PROVISIONAL = (true|false);/;
  if (!medianLine.test(source) || !flagLine.test(source)) throw new Error(`${SOURCE_PATH} no longer declares MEDIAN_BOUNDARIES_PER_SCENE and INTENT_LAPSE_K_PROVISIONAL as single constants`);
  return source
    .replace(medianLine, `export const MEDIAN_BOUNDARIES_PER_SCENE = ${medianValue};`)
    .replace(flagLine, 'export const INTENT_LAPSE_K_PROVISIONAL = false;');
}

export function rewriteRecipe(recipe: Record<string, any>, measured: { corpus: string; median: number; k: number; scenes: number; chats: number; at: string }): Record<string, any> {
  return {
    ...recipe,
    constants: { ...recipe.constants, MEDIAN_BOUNDARIES_PER_SCENE: measured.median, INTENT_LAPSE_BOUNDARIES: measured.k },
    provisional: false,
    measured,
  };
}

const eol = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');
const withEol = (text: string, ending: string): string => text.replace(/\r?\n/g, ending);

async function main(args: string[]): Promise<number> {
  if (args[0] !== 'measure') { console.log(USAGE); return 1; }
  const corpusIndex = args.indexOf('--corpus');
  const corpus = corpusIndex >= 0 ? args[corpusIndex + 1] : '';
  if (!corpus) { console.log('--corpus <id> is required: the measurement names the corpus it came from'); return 1; }
  const files = args.slice(1).filter((arg, index, list) => arg !== '--write' && arg !== '--corpus' && list[index - 1] !== '--corpus');
  if (!files.length) { console.log(USAGE); return 1; }
  const recipeText = await readFile(join(PROJECT_ROOT, RECIPE_PATH), 'utf-8');
  const recipe = JSON.parse(recipeText);
  const roots = await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, 'utf-8'))));
  const result = measureK(roots, Number(recipe.minScenes ?? 20));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) return 1;
  if (!args.includes('--write')) return 0;
  const sourceText = await readFile(join(PROJECT_ROOT, SOURCE_PATH), 'utf-8');
  await writeFile(join(PROJECT_ROOT, SOURCE_PATH), rewriteSource(sourceText, result.median));
  const next = rewriteRecipe(recipe, { corpus, median: result.median, k: result.k, scenes: result.scenes, chats: result.chats, at: new Date().toISOString() });
  await writeFile(join(PROJECT_ROOT, RECIPE_PATH), withEol(`${JSON.stringify(next, null, 2)}\n`, eol(recipeText)));
  console.log(`wrote ${SOURCE_PATH} and ${RECIPE_PATH}: K = ${result.k}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
