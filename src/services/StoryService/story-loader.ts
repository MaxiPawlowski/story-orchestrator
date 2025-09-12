import { parseAndNormalizeStory, formatZodError, CheckpointResult } from "@services/SchemaService/story-validator";

const isNumericJson = (p: string) => /(\d+)\.json$/.test(p);
const numericKey = (p: string) => {
  const m = p.match(/(\d+)\.json$/);
  return m ? parseInt(m[1], 10) : NaN;
};


const getBundleBaseUrl = (): string => {
  try {
    if (typeof import.meta !== "undefined" && (import.meta as any).url) {
      // eslint-disable-next-line no-new
      return new URL(".", (import.meta as any).url).toString();
    }
  } catch (_e) { }
  try {
    const script = (document.currentScript as HTMLScriptElement | null);
    if (script?.src) {
      return new URL(".", script.src).toString();
    }
  } catch (_e) { }
  return "./";
};

// Optional: load via a manifest at dist/checkpoints/manifest.json
// manifest format: ["0.json", "1.json", ...]
const fetchManifestModules = async (): Promise<Record<string, any> | null> => {
  const base = getBundleBaseUrl();
  try {
    const manifestUrl = new URL("./checkpoints/manifest.json", base).toString();
    const res = await fetch(manifestUrl, { cache: "no-cache" });
    if (!res.ok) return null;
    const list = (await res.json()) as unknown;
    if (!Array.isArray(list)) return null;
    const out: Record<string, any> = {};
    for (const nameRaw of list) {
      const name = String(nameRaw);
      if (!/(^|\/)\d+\.json$/.test(name)) continue;
      try {
        const url = new URL(`./checkpoints/${name.replace(/^\.\//, "")}`, base).toString();
        const jr = await fetch(url, { cache: "no-cache" });
        if (!jr.ok) continue;
        out[name.replace(/^\.\//, "")] = { default: await jr.json() };
      } catch { }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
};

const fetchRuntimeCheckpoints = async (
  options?: { max?: number; stopAfterMisses?: number }
): Promise<Record<string, any> | null> => {
  const max = options?.max ?? 100;
  const stopAfterMisses = options?.stopAfterMisses ?? 5;
  const base = getBundleBaseUrl();

  let misses = 0;
  const found: Record<string, any> = {};

  for (let i = 0; i < max && misses < stopAfterMisses; i++) {
    const url = new URL(`./checkpoints/${i}.json`, base).toString();
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) { misses++; continue; }
      const json = await res.json();
      found[`${i}.json`] = { default: json };
      misses = 0;
    } catch (_e) {
      misses++;
    }
  }

  return Object.keys(found).length ? found : null;
};

const loadJsons = async () => {
  let modules: Record<string, any> | null = null;

  try {
    // @ts-ignore
    if (typeof (require as any) === "function" && typeof (require as any).context === "function") {
      // @ts-ignore
      const req = (require as any).context("@checkpoints", false, /^\d+\.json$/);
      modules = {};
      req.keys().forEach((k: string) => {
        modules![k] = { default: req(k) };
      });
    }
  } catch (_e) {
  }

  if (!modules) {
    modules = await fetchManifestModules().catch(() => null);
  }
  if (!modules) {
    modules = await fetchRuntimeCheckpoints().catch(() => null);
  }

  if (!modules) {
    throw new Error(
      "Cannot load checkpoint JSON files. Tried: webpack require.context, import.meta.glob, global require.context, and runtime fetch from dist/checkpoints. " +
      "If you use Webpack, keep the files under src/checkpoints so they are bundled, or provide a manifest to fetch at runtime."
    );
  }

  const entries = Object.keys(modules || {}).filter(isNumericJson).sort((a, b) => numericKey(a) - numericKey(b));
  if (entries.length === 0) {
    console.log("No checkpoint JSON files found (expecting 0.json, 1.json, ...).");
    return { results: [], okCount: 0, failCount: 0 };
  }



  const results: CheckpointResult[] = [];

  for (const key of entries) {
    try {
      const json = modules![key].default ?? modules![key];
      const normalized = parseAndNormalizeStory(json);

      console.log(`✓ ${key} validated`, normalized);
      results.push({ file: key, ok: true, json: normalized });
    } catch (e) {
      console.error(`✗ ${key} validation failed:`, formatZodError(e));
      results.push({ file: key, ok: false, error: e });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`Validation summary: ${okCount} passed, ${failCount} failed (${results.length} total).`);
  return { results, okCount, failCount };
};

export default loadJsons;
