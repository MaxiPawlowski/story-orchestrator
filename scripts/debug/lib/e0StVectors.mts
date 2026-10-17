import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type VectorItem = { id: number; text: string };
export type VectorAnswer = { status: number; json: unknown; ms: number };
export type VectorPost = (path: string, body: Record<string, unknown>) => Promise<VectorAnswer>;
export type InsertRecord = { collectionId: string; items: number; ms: number; reused: boolean };

export const E0_COLLECTION_PREFIX = 'so-e0';
export const HASH_OFFSET = 1;

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export function embeddingModelOf(stRoot: string): string {
  try {
    const config = readFileSync(join(stRoot, 'config.yaml'), 'utf-8');
    return /^\s*embedding:\s*(\S+)\s*$/m.exec(config)?.[1] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const idsOf = (answer: unknown, threshold: number): number[] => {
  const body = (answer ?? {}) as { hashes?: unknown[]; metadata?: Array<{ hash?: unknown }> };
  const raw = threshold > 0 ? (body.metadata ?? []).map((row) => row?.hash) : body.hashes ?? [];
  return raw.map((hash) => Number(hash) - HASH_OFFSET);
};

export function createStVectorsProvider({ post, source = 'transformers', model, prefix = E0_COLLECTION_PREFIX }: { post: VectorPost; source?: string; model: string; prefix?: string }) {
  const ready = new Map<string, Promise<string>>();
  const inserts: InsertRecord[] = [];
  const insert = async (collection: readonly VectorItem[]): Promise<string> => {
    const collectionId = `${prefix}-${sha(JSON.stringify(collection.map((item) => [item.id, item.text]))).slice(0, 20)}`;
    const items = collection.map((item) => ({ hash: item.id + HASH_OFFSET, text: item.text, index: item.id }));
    const listed = await post('/api/vector/list', { collectionId, source });
    const saved = listed.status === 200 && Array.isArray(listed.json) ? new Set((listed.json as unknown[]).map(Number)) : new Set<number>();
    if (saved.size === items.length && items.every((item) => saved.has(item.hash))) {
      inserts.push({ collectionId, items: items.length, ms: 0, reused: true });
      return collectionId;
    }
    const purged = await post('/api/vector/purge', { collectionId });
    if (purged.status !== 200) throw new Error(`vector purge ${collectionId}: HTTP ${purged.status}`);
    const done = await post('/api/vector/insert', { collectionId, source, items });
    if (done.status !== 200) throw new Error(`vector insert ${collectionId}: HTTP ${done.status}`);
    inserts.push({ collectionId, items: items.length, ms: done.ms, reused: false });
    return collectionId;
  };
  const collectionFor = (collection: readonly VectorItem[]) => {
    const key = sha(JSON.stringify(collection.map((item) => [item.id, item.text])));
    let pending = ready.get(key);
    if (!pending) {
      pending = insert(collection);
      ready.set(key, pending);
    }
    return pending;
  };
  return {
    id: `st-vectors:${source}:${model}`,
    async query(collection: readonly VectorItem[], text: string, topK: number, threshold: number) {
      const collectionId = await collectionFor(collection);
      const answer = await post('/api/vector/query', { collectionId, searchText: text, topK, source, threshold });
      if (answer.status !== 200) throw new Error(`vector query ${collectionId}: HTTP ${answer.status}`);
      return { ids: idsOf(answer.json, threshold), latencyMs: answer.ms };
    },
    inserts: () => [...inserts],
    async purgeAll() {
      const ids = await Promise.all(ready.values());
      for (const collectionId of ids) await post('/api/vector/purge', { collectionId });
      ready.clear();
      return ids.length;
    },
  };
}

export function insertSummary(all: readonly InsertRecord[]) {
  const inserts = all.filter((row) => !row.reused);
  const sorted = inserts.map((row) => row.ms).sort((left, right) => left - right);
  const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : null);
  return { reused: all.length - inserts.length, collections: inserts.length, items: inserts.reduce((sum, row) => sum + row.items, 0), insertMsTotal: inserts.reduce((sum, row) => sum + row.ms, 0), insertMsP50: at(0.5), insertMsP95: at(0.95) };
}

type PageLike = { evaluate: (fn: (arg: { path: string; body: Record<string, unknown> }) => Promise<VectorAnswer>, arg: { path: string; body: Record<string, unknown> }) => Promise<VectorAnswer> };

export const pageVectorPost = (page: PageLike): VectorPost => (path, body) => page.evaluate(async ({ path: target, body: payload }) => {
  const headers = (globalThis as unknown as { SillyTavern: { getContext(): { getRequestHeaders(): Record<string, string> } } }).SillyTavern.getContext().getRequestHeaders();
  const started = performance.now();
  const response = await fetch(target, { method: 'POST', headers, body: JSON.stringify(payload) });
  const json = (target.endsWith('/query') || target.endsWith('/list')) && response.ok ? await response.json() : null;
  return { status: response.status, json, ms: performance.now() - started };
}, { path, body });
