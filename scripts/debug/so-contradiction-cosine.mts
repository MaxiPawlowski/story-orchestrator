import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/so-contradiction-cosine.mts capture [--record]

v2.5 plan 04 K0 cosine brackets. For every row of test/fixtures/memory/contradictions.json, inserts the
established text and the claim into a throwaway ST vectors collection (source transformers), bisects the
query threshold 14 times in each direction (the v2.4 pair-cosine-probe method), purges the collection,
and prints the bracket. --record writes test/fixtures/memory/contradictions.cosine.<bundle>.json, which
jest replays as the vectors-present mode. Run it on a LANE, once per bundle, before any vectors-mode arm.`;

export const FIXTURE_PATH = 'test/fixtures/memory/contradictions.json';
export const BISECT_STEPS = 14;

export interface CosineRow {
  id: string;
  established: string;
  claim: string;
}

export interface CosineProbe {
  id: string;
  claimToEstablished: number;
  establishedToClaim: number;
  error?: string;
}

export async function probeCosines(arg: { rows: CosineRow[]; steps: number }): Promise<{ vectors: string | null; probes: CosineProbe[] }> {
  const ctx = (globalThis as any).SillyTavern.getContext();
  const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
  const snapshot = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.();
  const probes: CosineProbe[] = [];
  for (const row of arg.rows) {
    const collectionId = `so_k0_cosine_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const inserted = await post('/api/vector/insert', { collectionId, items: [{ hash: 0, text: row.established, index: 0 }, { hash: 1, text: row.claim, index: 1 }], source: 'transformers' });
    if (!inserted.ok) {
      probes.push({ id: row.id, claimToEstablished: Number.NaN, establishedToClaim: Number.NaN, error: `insert ${inserted.status}` });
      continue;
    }
    try {
      const hits = async (text: string, target: number, threshold: number) => {
        const response = await post('/api/vector/query', { collectionId, searchText: text, topK: 2, threshold, source: 'transformers' });
        const data = await response.json();
        return (data.metadata ?? []).some((match: { index: number }) => match.index === target);
      };
      const bisect = async (text: string, target: number) => {
        let lo = 0;
        let hi = 1;
        for (let step = 0; step < arg.steps; step += 1) {
          const mid = (lo + hi) / 2;
          if (await hits(text, target, mid)) lo = mid;
          else hi = mid;
        }
        return Number(lo.toFixed(4));
      };
      probes.push({ id: row.id, claimToEstablished: await bisect(row.claim, 0), establishedToClaim: await bisect(row.established, 1) });
    } finally {
      await post('/api/vector/purge', { collectionId });
    }
  }
  return { vectors: snapshot?.capabilities?.vectors ?? null, probes };
}

export function bracketFile(bundle: string, capturedAt: string, vectors: string | null, probes: CosineProbe[], expectedIds: string[]) {
  const failed = probes.filter((probe) => probe.error || !Number.isFinite(probe.claimToEstablished)).map((probe) => probe.id);
  const missing = expectedIds.filter((id) => !probes.some((probe) => probe.id === id));
  if (failed.length || missing.length) return { ok: false as const, failed, missing };
  const rows = Object.fromEntries(probes.map((probe) => [probe.id, Math.min(probe.claimToEstablished, probe.establishedToClaim)]));
  return { ok: true as const, file: { bundle, capturedAt, vectors, method: `bisection ${BISECT_STEPS} steps, min of both directions`, rows, probes } };
}

async function capture(page: Page, record: boolean) {
  const fixture = JSON.parse(await readFile(join(PROJECT_ROOT, FIXTURE_PATH), 'utf-8'));
  const manifest = JSON.parse(await readFile(join(PROJECT_ROOT, 'dist/manifest.json'), 'utf-8'));
  const bundle = String(manifest.bundle?.sha256 ?? '').slice(0, 12);
  const rows: CosineRow[] = fixture.rows.map((row: CosineRow) => ({ id: row.id, established: row.established, claim: row.claim }));
  const { vectors, probes } = await evaluateInST(page, probeCosines, { rows, steps: BISECT_STEPS });
  for (const probe of probes) console.log(`${probe.id} ${probe.error ?? `${probe.claimToEstablished} / ${probe.establishedToClaim}`}`);
  const built = bracketFile(bundle, new Date().toISOString(), vectors, probes, rows.map((row) => row.id));
  if (!built.ok) {
    console.log(`NOT RECORDED: failed [${built.failed.join(', ')}] missing [${built.missing.join(', ')}]`);
    return { ok: false };
  }
  if (record) {
    const path = `test/fixtures/memory/contradictions.cosine.${bundle}.json`;
    await writeFile(join(PROJECT_ROOT, path), `${JSON.stringify(built.file, null, 2)}\n`);
    console.log(`recorded ${path}`);
  }
  return { ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'capture' || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => capture(page, process.argv.includes('--record')));
}
