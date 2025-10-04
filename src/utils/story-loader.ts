import { parseAndNormalizeStory, formatZodError, type CheckpointResult } from '@utils/story-validator';
import {
  clearNumericJsonBundleCache,
  getModuleValue,
  isNumericJsonFile,
  loadNumericJsonBundle,
  numericKey,
} from './json-bundle-loader';

export interface CheckpointBundle {
  results: CheckpointResult[];
  okCount: number;
  failCount: number;
}

const BUNDLE_CACHE_KEY = 'story-checkpoints';
const LOAD_ERROR_MESSAGE =
  'Cannot load checkpoint JSON files. Tried: webpack require.context/import.meta.glob bundling, manifest fetch (dist/checkpoints/manifest.json), and runtime fetch from dist/checkpoints.' +
  ' If you use Webpack, keep the files under src/checkpoints so they are bundled, or provide a manifest to fetch at runtime.';

let cachedBundle: CheckpointBundle | null = null;
let inflight: Promise<CheckpointBundle> | null = null;

async function loadBundle(forceReload?: boolean): Promise<CheckpointBundle> {
  const modules = await loadNumericJsonBundle({
    cacheKey: BUNDLE_CACHE_KEY,
    forceReload,
    manifestPath: './checkpoints/manifest.json',
    runtimeDirectory: './checkpoints',
  });

  if (!modules) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  const entries = Object.keys(modules)
    .filter(isNumericJsonFile)
    .sort((a, b) => numericKey(a) - numericKey(b));

  if (!entries.length) {
    console.log('[StoryLoader] No checkpoint JSON files found (expecting 0.json, 1.json, ...).');
    return { results: [], okCount: 0, failCount: 0 };
  }

  const results: CheckpointResult[] = [];

  for (const key of entries) {
    try {
      const json = getModuleValue(modules[key]);
      const normalized = parseAndNormalizeStory(json);
      console.log(`[StoryLoader] ${key} validated`, normalized);
      results.push({ file: key, ok: true, json: normalized });
    } catch (error) {
      console.error(`[StoryLoader] ${key} validation failed:`, formatZodError(error));
      results.push({ file: key, ok: false, error });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`[StoryLoader] Validation summary: ${okCount} passed, ${failCount} failed (${results.length} total).`);

  return { results, okCount, failCount };
}

export async function loadCheckpointBundle(options: { force?: boolean } = {}): Promise<CheckpointBundle> {
  if (!options.force && cachedBundle) {
    return cachedBundle;
  }
  if (!options.force && inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const bundle = await loadBundle(options.force);
      cachedBundle = bundle;
      return bundle;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

