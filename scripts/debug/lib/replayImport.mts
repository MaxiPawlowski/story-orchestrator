import { latestOk, readBody, readManifest, readResponses } from './promptBatch.mts';
import { parseJson, promptOf, ReplayStore, requestKind, samplerOf, sha256, type ReplayIdentity } from './replayStore.mts';

export interface ImportResult { store: string; imported: number; skipped: number; already: number; identity: ReplayIdentity }

const modelIn = (raw: string): string | null => {
  const json = parseJson(raw) as Record<string, any> | null | undefined;
  const value = json?.model ?? json?.generation_settings?.model;
  return typeof value === 'string' && value ? value : null;
};

export async function batchIdentity(dir: string): Promise<ReplayIdentity> {
  const manifest = await readManifest(dir);
  const answers = [...latestOk(await readResponses(dir)).values()];
  const model = answers.map((record) => modelIn(record.raw)).find((value) => value !== null) ?? null;
  return { model, build: null, ctx: null, upstream: null, origin: 'prompt-batch', detail: { measurement: manifest.measurement, route: manifest.route.name, preset: manifest.route.preset, bundleSha256: manifest.source.bundleSha256 } };
}

export async function importBatch(batchDir: string, storeDir: string, options: { row?: string | null; normalise?: string } = {}): Promise<ImportResult> {
  const manifest = await readManifest(batchDir);
  const identity = await batchIdentity(batchDir);
  if (identity.model === null) throw new Error(`refused: ${batchDir} has no answer naming its model; a recording without a model identity cannot be replayed honestly`);
  const store = await ReplayStore.openOrCreate(storeDir, identity, options.normalise ?? 'exact');
  const answers = latestOk(await readResponses(batchDir));
  const result: ImportResult = { store: storeDir, imported: 0, skipped: 0, already: 0, identity: store.manifest.identity };
  for (const [index, item] of manifest.items.entries()) {
    const answer = answers.get(item.id);
    if (!answer || !item.sha || !item.path) { result.skipped += 1; continue; }
    const body = await readBody(batchDir, item.sha);
    const request = { method: 'POST', path: item.path, body };
    const key = store.key(request);
    const row = options.row ?? `${manifest.measurement}:${item.id}`;
    if (store.recorded(key).some((entry) => entry.row === row && entry.source === 'prompt-batch')) { result.already += 1; continue; }
    const prompt = promptOf(body);
    await store.append({
      key, method: 'POST', path: item.path, kind: requestKind('POST', item.path), row, step: item.id, ordinal: index + 1, promptSha: prompt === null ? null : sha256(prompt), sampler: samplerOf(body),
      stream: false, status: answer.status ?? 200, contentType: 'application/json', aborted: false, ms: Math.round(answer.ms), at: answer.at, build: manifest.source.bundleSha256, source: 'prompt-batch',
    }, { request: body, response: { body: answer.raw } });
    result.imported += 1;
  }
  await store.flush();
  return result;
}
