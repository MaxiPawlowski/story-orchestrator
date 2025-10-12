import { JSON_RUNTIME_MAX_FILES, JSON_RUNTIME_STOP_AFTER_MISSES } from "@constants/defaults";

const NUMERIC_JSON_RE = /(\d+)\.json$/;

export type JsonModule = { default?: unknown } | unknown;
export type JsonModuleMap = Record<string, JsonModule>;

export interface NumericJsonBundleOptions {
  cacheKey?: string;
  forceReload?: boolean;
  requireContextRequest?: string;
  requireContextPattern?: RegExp;
  globPattern?: string;
  manifestPath?: string;
  runtimeDirectory?: string;
  runtimeMax?: number;
  runtimeStopAfterMisses?: number;
  filenameFilter?: (filename: string) => boolean;
  fetchImpl?: typeof fetch;
}

const DEFAULT_CACHE_KEY = 'numeric-json-bundle';
const DEFAULT_REQUIRE_CONTEXT_PATTERN = /^\d+\.json$/;
const DEFAULT_GLOB_PATTERN = '../checkpoints/*.json';
const DEFAULT_MANIFEST_PATH = './checkpoints/manifest.json';
const DEFAULT_RUNTIME_DIRECTORY = './checkpoints';

const moduleCache = new Map<string, Promise<JsonModuleMap | null>>();

export const isNumericJsonFile = (filename: string): boolean => NUMERIC_JSON_RE.test(filename);

export const numericKey = (filename: string): number => {
  const match = filename.match(NUMERIC_JSON_RE);
  return match ? parseInt(match[1], 10) : Number.NaN;
};

export const getModuleValue = <T>(entry: JsonModule): T => {
  if (entry && typeof entry === 'object' && 'default' in (entry as Record<string, unknown>)) {
    const mod = entry as Record<string, unknown> & { default?: unknown };
    return mod.default as T;
  }
  return entry as T;
};

let cachedBaseUrl: string | null = null;

export const getBundleBaseUrl = (): string => {
  if (cachedBaseUrl) return cachedBaseUrl;
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).url) {
      cachedBaseUrl = new URL('.', (import.meta as any).url).toString();
      return cachedBaseUrl;
    }
  } catch {
    // ignore
  }
  try {
    const script = (typeof document !== 'undefined' ? document.currentScript : null) as HTMLScriptElement | null;
    if (script?.src) {
      cachedBaseUrl = new URL('.', script.src).toString();
      return cachedBaseUrl;
    }
  } catch {
    // ignore
  }
  cachedBaseUrl = './';
  return cachedBaseUrl;
};

function normalizeKey(key: string): string {
  return key.replace(/^\.\/+/, '').replace(/^\//, '');
}

function assignNormalized(target: JsonModuleMap, key: string, value: JsonModule): void {
  target[normalizeKey(key)] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function tryWebpackRequireContext(request: string, pattern: RegExp): JsonModuleMap | null {
  try {
    const maybeRequire = (typeof require !== 'undefined' ? require : (globalThis as any)?.require) as any;
    if (!maybeRequire || typeof maybeRequire.context !== 'function') return null;
    const ctx = maybeRequire.context(request, false, pattern);
    if (!ctx || typeof ctx !== 'function' || typeof ctx.keys !== 'function') return null;
    const out: JsonModuleMap = {};
    ctx.keys().forEach((key: string) => {
      assignNormalized(out, key, { default: ctx(key) });
    });
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function tryImportMetaGlob(globPattern: string): Promise<JsonModuleMap | null> {
  if (!globPattern) return null;
  try {
    if (typeof import.meta === 'undefined') return null;
  } catch {
    return null;
  }
  try {
    const globFn = (import.meta as any)?.glob;
    if (typeof globFn !== 'function') return null;

    const eagerResult = globFn(globPattern, { eager: true });
    if (isRecord(eagerResult) && Object.keys(eagerResult).length) {
      const out: JsonModuleMap = {};
      for (const [key, value] of Object.entries(eagerResult)) {
        assignNormalized(out, key, value as JsonModule);
      }
      if (Object.keys(out).length) return out;
    }

    const lazyResult = globFn(globPattern);
    if (isRecord(lazyResult)) {
      const out: JsonModuleMap = {};
      await Promise.all(
        Object.entries(lazyResult).map(async ([key, importer]) => {
          if (typeof importer !== 'function') return;
          try {
            const mod = await importer();
            assignNormalized(out, key, mod as JsonModule);
          } catch {
            // ignore single failure
          }
        }),
      );
      if (Object.keys(out).length) return out;
    }
  } catch {
    // ignore
  }
  return null;
}

function toFetchImpl(candidate?: typeof fetch): typeof fetch | undefined {
  if (candidate) return candidate;
  if (typeof fetch === 'function') return fetch.bind(globalThis);
  return undefined;
}

async function fetchManifestModules(
  manifestPath: string,
  filter: (filename: string) => boolean,
  fetchImpl?: typeof fetch,
): Promise<JsonModuleMap | null> {
  const fetchFn = toFetchImpl(fetchImpl);
  if (!manifestPath || !fetchFn) return null;
  try {
    const baseUrl = getBundleBaseUrl();
    const manifestUrl = new URL(manifestPath, baseUrl);
    const res = await fetchFn(manifestUrl.toString(), { cache: 'no-cache' });
    if (!res.ok) return null;
    const list = (await res.json()) as unknown;
    if (!Array.isArray(list)) return null;
    const dirUrl = new URL('.', manifestUrl);
    const out: JsonModuleMap = {};
    for (const item of list) {
      const entryName = normalizeKey(String(item));
      if (!filter(entryName)) continue;
      try {
        const fileUrl = new URL(entryName, dirUrl);
        const jr = await fetchFn(fileUrl.toString(), { cache: 'no-cache' });
        if (!jr.ok) continue;
        const data = await jr.json();
        assignNormalized(out, entryName, { default: data });
      } catch {
        // ignore single failure
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function fetchRuntimeModules(
  runtimeDirectory: string,
  controls: { max: number; stopAfterMisses: number },
  filter: (filename: string) => boolean,
  fetchImpl?: typeof fetch,
): Promise<JsonModuleMap | null> {
  const fetchFn = toFetchImpl(fetchImpl);
  if (!runtimeDirectory || !fetchFn) return null;
  try {
    const baseUrl = getBundleBaseUrl();
    const dirUrl = new URL(runtimeDirectory.replace(/\/?$/, '/'), baseUrl);
    const out: JsonModuleMap = {};
    let misses = 0;
    for (let i = 0; i < controls.max && misses < controls.stopAfterMisses; i++) {
      const fileName = `${i}.json`;
      if (!filter(fileName)) continue;
      try {
        const fileUrl = new URL(fileName, dirUrl);
        const res = await fetchFn(fileUrl.toString(), { cache: 'no-cache' });
        if (!res.ok) {
          misses++;
          continue;
        }
        const data = await res.json();
        assignNormalized(out, fileName, { default: data });
        misses = 0;
      } catch {
        misses++;
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export async function loadNumericJsonBundle(options: NumericJsonBundleOptions = {}): Promise<JsonModuleMap | null> {
  const {
    cacheKey = DEFAULT_CACHE_KEY,
    forceReload = false,
    requireContextRequest = '@checkpoints',
    requireContextPattern = DEFAULT_REQUIRE_CONTEXT_PATTERN,
    globPattern = DEFAULT_GLOB_PATTERN,
    manifestPath = DEFAULT_MANIFEST_PATH,
    runtimeDirectory = DEFAULT_RUNTIME_DIRECTORY,
    runtimeMax = JSON_RUNTIME_MAX_FILES,
    runtimeStopAfterMisses = JSON_RUNTIME_STOP_AFTER_MISSES,
    filenameFilter = isNumericJsonFile,
    fetchImpl,
  } = options;

  if (!forceReload && moduleCache.has(cacheKey)) {
    return moduleCache.get(cacheKey)!;
  }

  const loadPromise = (async () => {
    let modules = tryWebpackRequireContext(requireContextRequest, requireContextPattern);

    if (!modules && globPattern) {
      modules = await tryImportMetaGlob(globPattern);
    }

    if (!modules && manifestPath) {
      modules = await fetchManifestModules(manifestPath, filenameFilter, fetchImpl);
    }

    if (!modules && runtimeDirectory) {
      modules = await fetchRuntimeModules(
        runtimeDirectory,
        { max: runtimeMax, stopAfterMisses: runtimeStopAfterMisses },
        filenameFilter,
        fetchImpl,
      );
    }

    if (!modules) return null;

    const filteredEntries = Object.entries(modules).filter(([name]) => filenameFilter(name));
    if (!filteredEntries.length) return null;

    const normalized: JsonModuleMap = {};
    for (const [name, value] of filteredEntries) {
      assignNormalized(normalized, name, value);
    }
    return normalized;
  })();

  moduleCache.set(cacheKey, loadPromise);

  const resolved = await loadPromise;
  if (!resolved) {
    moduleCache.delete(cacheKey);
  }
  return resolved;
}

export function clearNumericJsonBundleCache(cacheKey?: string): void {
  if (cacheKey) {
    moduleCache.delete(cacheKey);
    return;
  }
  moduleCache.clear();
}
