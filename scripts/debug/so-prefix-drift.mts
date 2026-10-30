import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/so-prefix-drift.mts summary [--out <file>]

v3.0 A0 real-generation row (plan 13 gate record "owed"): reads the in-page prefix-drift recorder
(globalThis.storyOrchestratorPrefixDrift) right after a played journey on the SAME page (no reload between:
the recorder lives in the page). Run it through st-lanes.mts run <n> -- after the GS1 batch row.

Exit 1 when a reply key's last prompt pair diverged above the per-turn boundary (a finding, never a retune),
or when no reply key holds a pair (nothing measured: the page reloaded, or no real generation ran).
Side keys are reported, never gate (plan 13 deviations).`;

export interface DriftKeySummary { key: string; kind: 'reply' | 'side'; pairs: number; aboveBoundary: number; noBoundary: number; worstLost: number; last: string }

export interface DriftVerdict { ok: boolean; reason: string; replyKeys: number; replyPairs: number; sideKeys: number; failing: DriftKeySummary[] }

export function driftVerdict(summary: DriftKeySummary[] | null): DriftVerdict {
  if (!Array.isArray(summary)) return { ok: false, reason: 'no recorder on the page (storyOrchestratorPrefixDrift missing: stale bundle or no runtime)', replyKeys: 0, replyPairs: 0, sideKeys: 0, failing: [] };
  const reply = summary.filter((row) => row.kind === 'reply');
  const side = summary.filter((row) => row.kind === 'side');
  const replyPairs = reply.reduce((sum, row) => sum + row.pairs, 0);
  const failing = reply.filter((row) => row.aboveBoundary > 0 || row.noBoundary > 0);
  const base = { replyKeys: reply.length, replyPairs, sideKeys: side.length, failing };
  if (!replyPairs) return { ok: false, reason: 'no reply key holds a pair: nothing measured (reload after the row, or no real generation)', ...base };
  if (failing.length) return { ok: false, reason: `${failing.length} reply key(s) diverged above the per-turn boundary: ${failing.map((row) => row.key).join(', ')}`, ...base };
  return { ok: true, reason: `${reply.length} reply key(s), ${replyPairs} pair(s), none above the boundary`, ...base };
}

export async function readDrift(page) {
  return evaluateInST(page, () => {
    const handle = (globalThis as any).storyOrchestratorPrefixDrift;
    if (!handle || typeof handle.summary !== 'function') return { summary: null, records: [], chatId: null };
    return { summary: handle.summary(), records: handle.records(), chatId: (globalThis as any).SillyTavern?.getContext?.()?.chatId ?? null };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  if (args[0] !== 'summary' || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 2);
  }
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : null;
  runCli(async (page) => {
    const read = await readDrift(page);
    const verdict = driftVerdict(read.summary);
    const report = { at: new Date().toISOString(), lane: process.env.SO_LANE ?? null, chatId: read.chatId, verdict, summary: read.summary, records: read.records };
    let path: string;
    if (out) {
      path = resolve(PROJECT_ROOT, out);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    } else {
      path = await writeJSON(report, 'prefix-drift');
    }
    console.log(JSON.stringify({ ...verdict, wrote: path }, null, 2));
    return { ok: verdict.ok };
  });
}
