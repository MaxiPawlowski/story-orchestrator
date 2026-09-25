import { evaluateInST } from './evaluate.mts';

export const WORLD_INFO_MODULE_URL = '/scripts/world-info.js';

export interface LorebookDeleteReport {
  lorebooks: string[];
  viaHost: string[];
  unlisted: string[];
  evicted: string[];
  staleCache: string[];
  errors: string[];
}

// v2.4 plan 05 (seed D): ST's own `deleteWorldInfo` evicts `worldInfoCache`, deselects the book and
// unbinds character/persona slots (world-info.js:4346-4393, host-facts 05-H12), but only for a name
// in `world_names` (:4347), so the list is refreshed first. A book ST does not list falls back to the
// raw delete plus an explicit eviction. The module URL is a parameter so node:test can hand in a fake.
export async function deleteLorebooksInPage(page, names: string[], { moduleUrl = WORLD_INFO_MODULE_URL } = {}): Promise<LorebookDeleteReport> {
  return evaluateInST(page, async ({ names, moduleUrl }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const wi = await import(/* webpackIgnore: true */ moduleUrl) as {
      updateWorldInfoList: () => Promise<void>;
      deleteWorldInfo: (name: string) => Promise<boolean>;
      worldInfoCache: { delete: (name: string) => boolean; has: (name: string) => boolean };
    };
    const report = { lorebooks: [] as string[], viaHost: [] as string[], unlisted: [] as string[], evicted: [] as string[], staleCache: [] as string[], errors: [] as string[] };
    if (!names.length) return report;
    await wi.updateWorldInfoList();
    const listed = new Set((ctx.getWorldInfoNames?.() ?? []) as string[]);
    for (const name of names) {
      if (listed.has(name)) {
        if (await wi.deleteWorldInfo(name)) {
          report.lorebooks.push(name);
          report.viaHost.push(name);
        } else {
          report.errors.push(`lorebook ${name}: deleteWorldInfo refused`);
        }
        continue;
      }
      const response = await fetch('/api/worldinfo/delete', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name }) });
      if (!response.ok) {
        report.errors.push(`lorebook ${name}: ${response.status}`);
        continue;
      }
      report.lorebooks.push(name);
      report.unlisted.push(name);
      if (wi.worldInfoCache.delete(name)) report.evicted.push(name);
    }
    await wi.updateWorldInfoList();
    report.staleCache = report.lorebooks.filter((name) => wi.worldInfoCache.has(name));
    return report;
  }, { names, moduleUrl });
}
