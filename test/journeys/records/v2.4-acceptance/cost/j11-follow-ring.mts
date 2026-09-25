// v2.4 plan 09 CL, J11 source. J11's checks set the judge themselves, so its records carry no judge METER and
// `so-judge cost-report` lists them under unmeteredRing only (cost-report-J11.log). Their cleanup ring also holds only the
// last chat's calls. This reads every judge event the live `so-journal follow` tail saw across each whole run (same event
// shape as the ring), dedupes re-reads, and runs them through the SAME per-use aggregation as cost-report.
// It is a RING reading: per-call latency / fallback / model / ring tokens only. No totals, no $, no calls per boundary.
// usage: node test/journeys/records/v2.4-acceptance/cost/j11-follow-ring.mts <run dir>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { costReportAcross, ringTotals, type CostRecordInput } from '../../../../../scripts/debug/lib/judgeHarness.mts';

const dirs = process.argv.slice(2);
const zero = { calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
const perRun = dirs.map((dir) => {
  const seen = new Set<string>();
  const events = readFileSync(join(dir, 'journal-follow.jsonl'), 'utf-8').split(/\r?\n/).filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((event) => event && event.kind === 'judge')
    .filter((event) => { const key = `${event.chatId}|${event.at}|${event.summary}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return { dir, events };
});
const inputs: CostRecordInput[] = perRun.map(({ dir, events }) => ({ file: dir, meter: zero, events, boundaries: null }));
const across = costReportAcross(inputs);
const ring = ringTotals(perRun.flatMap(({ events }) => events));
console.log(JSON.stringify({
  source: 'J11 journal-follow judge events (ring shape), deduped; NOT the meter',
  runs: perRun.map(({ dir, events }) => ({ dir, judgeEvents: events.length, chats: [...new Set(events.map((event) => event.chatId))].length })),
  ringTotals: { calls: ring.calls, cachedCalls: ring.cachedCalls, inputTokens: ring.inputTokens, outputTokens: ring.outputTokens, fallbacks: ring.fallbacks },
  perUse: across.perUse.map(({ callsPerBoundary, ...rest }) => rest),
}, null, 2));
