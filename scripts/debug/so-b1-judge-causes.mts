import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { argValue, b1Problems, readB1Facts, recordRef, refuse, runNumber, writeB1Record, type RunNumber } from './lib/b1Runs.mts';
import { RECORDER_SOURCE, loreSelectPerTurn, scoreC3, type RecordedCall } from './lib/judgeCauses.mts';
import { readTimeoutSources } from './so-judge.mts';

const USAGE = `Usage: node scripts/debug/so-b1-judge-causes.mts follow --out <calls.jsonl> [--interval-ms 5000]
       node scripts/debug/so-b1-judge-causes.mts score --row B1-C3|B1-C12 --calls <journal-follow.jsonl|records dir,...> [--samples <calls.jsonl>] [--turns <turns.jsonl>] --run 1|2

v2.8 01 C3 / C12 measurements for 39 B1 (rows B1-C3, B1-C12), on the B1-C3 play (adolion-fresh lane, lore story, warden +
judge.uses.wardenLore and loreSelect on, real replies).
  follow  arms an in-page recorder on the judge plugin's /systemone and /providers routes and keeps draining it to --out:
          per call the X-SO-Judge-Use label, start / end, the HTTP status and Retry-After, answered / aborted, and a plugin
          /status sample (adaptive hold, refusals, per-use served count) taken as the call starts and as it settles.
          It re-arms after a page reload (a "rearmed" row). Run it beside so-journal.mts follow for the whole play.
  score   B1-C3: so-judge timeouts' tables per use (warden, wardenLore: <= 1 timeout per 50 calls over >= 100, never retuned),
          each timeout attributed to one cause from the samples: hold (cooling / refused / Retry-After), queue (the plugin had
          not passed it to the provider at the budget), provider (passed, not answered within 4000 ms), else unattributed;
          the client wait vs the 4000 ms budget per timeout; provider latency of the answered calls; the R4 reply latency with
          wardenLore on from --turns (timing.totalMs). B1-C12: lore-select judge requests per loud turn (p50 / p95 / max,
          record only) from the journal's judge events grouped by the turns of --turns.
Writes test/phase-c/records/<row>/run-<n>.json (counts only) and the joined rows to SO_DEBUG_DIR/b1/<row>/.
Refuses (exit 2) without its inputs; follow refuses without the judge plugin configured.`;

const PLUGIN_BASE = '/api/plugins/story-orchestrator-judge';
const SETTLE_GRACE_MS = 10000;

const readJsonl = async (path: string) => (await readFile(path, 'utf-8')).split(/\r?\n/).filter((line) => line.trim()).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });

export function drainRows(rows: RecordedCall[], cursor: number, epoch: number | null): { lines: string[]; cursor: number } {
  const sorted = [...rows].filter((row) => row.seq > cursor).sort((left, right) => left.seq - right.seq);
  if (!sorted.length) return { lines: [], cursor };
  const gap = sorted[0].seq > cursor + 1 ? [JSON.stringify({ kind: 'gap', from: cursor + 1, to: sorted[0].seq - 1, epoch })] : [];
  return { lines: [...gap, ...sorted.map((row) => JSON.stringify({ kind: 'call', ...row }))], cursor: sorted[sorted.length - 1].seq };
}

async function follow(page, out: string, intervalMs: number) {
  const needs = { handles: ['storyOrchestratorRuntime'], judge: true };
  const problems = b1Problems(needs, await readB1Facts(page, needs));
  if (problems.length) return refuse(problems);
  let epoch: number | null = null;
  let cursor = 0;
  for (;;) {
    const armed = await page.evaluate(`(${RECORDER_SOURCE})(${JSON.stringify(PLUGIN_BASE)})`) as { epoch: number; already: boolean };
    if (armed.epoch !== epoch) {
      if (epoch !== null) await appendFile(out, `${JSON.stringify({ kind: 'rearmed', at: new Date().toISOString(), epoch: armed.epoch, previous: epoch })}\n`, 'utf-8');
      epoch = armed.epoch;
      cursor = 0;
    }
    const rows = await evaluateInST(page, ({ cursor, grace }) => {
      const state = globalThis.__soJudgeCauses;
      const now = Date.now();
      const pending = (state?.rows ?? []).filter((row) => row.seq > cursor).sort((left, right) => left.seq - right.seq);
      const open = pending.findIndex((row) => !(row.endedAt !== null && (row.after || now - row.endedAt > grace)));
      return open < 0 ? pending : pending.slice(0, open);
    }, { cursor, grace: SETTLE_GRACE_MS }) as RecordedCall[];
    const drained = drainRows(rows, cursor, epoch);
    cursor = drained.cursor;
    if (drained.lines.length) await appendFile(out, `${drained.lines.join('\n')}\n`, 'utf-8');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function score(row: 'B1-C3' | 'B1-C12', { calls, samples, turns, run }: { calls: string; samples: string | null; turns: string | null; run: RunNumber }) {
  const sources = await readTimeoutSources(calls);
  const turnRows = turns ? await readJsonl(turns) : [];
  const recorded = samples ? (await readJsonl(samples)).filter((entry) => entry.kind === 'call') as RecordedCall[] : [];
  const scored = row === 'B1-C3' ? scoreC3(sources.events, recorded, turnRows) : loreSelectPerTurn(sources.events, turnRows);
  const summary = { source: row === 'B1-C3' ? 'v2.8 01 §B C3; 39 §B1 rows from v2.8 01' : 'v2.8 01 §B C12; 39 §B1 rows from v2.8 01', inputs: { journalFiles: sources.files.length, events: sources.events.length, recordedCalls: recorded.length, turns: turnRows.length }, ...scored };
  const written = await writeB1Record({ rowId: row, run, summary, raw: { scored, recorded }, privateText: [] });
  console.log(JSON.stringify({ row, run, verdict: scored.verdict, incomplete: scored.incomplete, record: recordRef(row, run), raw: written.raw }, null, 2));
  return scored.verdict === 'PASS' || scored.verdict === 'RECORDED';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasHelpFlag(args) || !['follow', 'score'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag(args) ? 0 : 1);
  }
  if (command === 'follow') {
    const out = argValue(args, '--out');
    if (!out) { refuse(['needs --out <calls.jsonl> (private evidence: keep it with the session)']); process.exit(2); }
    runCli((page) => follow(page, out, Number(argValue(args, '--interval-ms', '5000'))), { keepOpen: true });
  } else {
    const row = argValue(args, '--row') as 'B1-C3' | 'B1-C12';
    const calls = argValue(args, '--calls');
    const samples = argValue(args, '--samples');
    const turns = argValue(args, '--turns');
    let run: RunNumber;
    try { run = runNumber(argValue(args, '--run')); } catch (error) { console.error(String((error as Error).message)); process.exit(1); }
    const missing = (path: string | null, what: string) => (path && !path.split(',').every((entry) => existsSync(entry.trim())) ? [`${what} ${path} does not exist`] : []);
    const problems = [
      ...(row === 'B1-C3' || row === 'B1-C12' ? [] : ['--row must be B1-C3 or B1-C12']),
      ...(calls ? missing(calls, '--calls') : ['needs --calls <journal-follow .jsonl or journey records> (the judge call ring of every chat of the run)']),
      ...(row === 'B1-C3' ? (samples ? missing(samples, '--samples') : ['needs --samples <calls.jsonl> from so-b1-judge-causes.mts follow (per-call /status samples)']) : []),
      ...(row === 'B1-C12' && !turns ? ['needs --turns <turns.jsonl> (the loud turns the requests are counted over)'] : []),
      ...missing(turns, '--turns'),
    ];
    if (problems.length) { refuse(problems); process.exit(2); }
    const ok = await score(row, { calls, samples, turns, run });
    process.exit(ok ? 0 : 1);
  }
}
