import { scriptModule } from "./modules";

export const DEFAULT_VECTOR_SOURCE = "transformers";

export interface VectorItem {
  hash: number;
  text: string;
  index: number;
}

export interface VectorMatch {
  index: number;
  text: string;
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: scriptModule.getRequestHeaders(),
    body: JSON.stringify(body),
  });
}

export async function vectorInsert(collectionId: string, items: VectorItem[], source: string = DEFAULT_VECTOR_SOURCE): Promise<void> {
  if (!items.length) return;
  const response = await post("/api/vector/insert", { collectionId, items, source });
  if (!response.ok) throw new Error(`vector insert failed: ${response.status}`);
}

export async function vectorQuery(collectionId: string, searchText: string, topK: number, threshold: number, source: string = DEFAULT_VECTOR_SOURCE): Promise<VectorMatch[]> {
  const response = await post("/api/vector/query", { collectionId, searchText, topK, threshold, source });
  if (!response.ok) throw new Error(`vector query failed: ${response.status}`);
  const data = await response.json() as { metadata?: Array<{ index?: unknown; text?: unknown }> };
  const matches: VectorMatch[] = [];
  for (const entry of data.metadata ?? []) {
    if (typeof entry.index === "number" && typeof entry.text === "string") matches.push({ index: entry.index, text: entry.text });
  }
  return matches;
}

export async function vectorPurge(collectionId: string): Promise<void> {
  const response = await post("/api/vector/purge", { collectionId });
  if (!response.ok) throw new Error(`vector purge failed: ${response.status}`);
}
