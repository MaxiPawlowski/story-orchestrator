import type { VectorHost } from "./hostPorts";

export const VECTOR_INSERT_CHUNK = 4;
export const VECTOR_YIELD_MAX_MS = 15_000;

export type VectorQuiet = () => Promise<unknown>;

export function yieldingVectorHost(base: VectorHost, quiet: () => VectorQuiet | null, chunk = VECTOR_INSERT_CHUNK): VectorHost {
  const settle = async () => {
    await quiet()?.();
  };
  return {
    ...base,
    async vectorInsert(collectionId, items, source) {
      for (let start = 0; start < items.length; start += chunk) {
        await settle();
        await base.vectorInsert(collectionId, items.slice(start, start + chunk), source);
      }
    },
    async vectorQuery(collectionId, searchText, topK, threshold, source) {
      await settle();
      return base.vectorQuery(collectionId, searchText, topK, threshold, source);
    },
  };
}
