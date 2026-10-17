import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEntry } from './bundleEntry.mts';

type Report = { verdict: 'pass' | 'fail' | 'insufficient' } & Record<string, unknown>;
type Fixture = { set: string; synthetic: boolean; pool: string };

interface RecallModule {
  RECALL_FLOORS: Record<string, number>;
  RECALL_MINIMUMS: Record<string, number>;
  RECALL_POOL_SIZE: number;
  RECALL_TOP_K: number;
  RECALL_TOKEN_CAP: number;
  RECALL_TOKEN_ESTIMATE: string;
  checkRecallFixture(raw: unknown): Fixture;
  scoreRecallFixture(fixture: Fixture): Report;
}

export const loadRecall = () => loadEntry<RecallModule>('scripts/debug/lib/recallEntry.ts');

export async function replayFixture(dir: string) {
  const recall = await loadRecall();
  const fixture = recall.checkRecallFixture(JSON.parse(await readFile(join(dir, 'fixture.json'), 'utf-8')));
  const report = recall.scoreRecallFixture(fixture);
  return {
    plan: 'v2.8 43 (offline replay, no model, no vectors)',
    set: fixture.set,
    synthetic: fixture.synthetic,
    pool: fixture.pool,
    rank: 'pool order (the E0 winner plugs in later)',
    limits: { poolSize: recall.RECALL_POOL_SIZE, topK: recall.RECALL_TOP_K, tokenCap: recall.RECALL_TOKEN_CAP, tokenEstimate: recall.RECALL_TOKEN_ESTIMATE },
    thresholds: recall.RECALL_FLOORS,
    minimumShape: recall.RECALL_MINIMUMS,
    ...report,
  };
}
