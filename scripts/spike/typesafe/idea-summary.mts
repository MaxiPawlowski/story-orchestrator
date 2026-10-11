import { register } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/client.mts';

register('./lib/loader.mts', import.meta.url);
const { hotPhrases } = await import('@judge/repetition') as any;
const names = ['scene-confirm', 'canon-verify', 'epistemic', 'cast-balance', 'hop2', 'attention', 'picture', 'n3', 'scene-kind', 'n5', 'tone'];
const ideas = Object.fromEntries(names.map((name) => [name, [1, 2].map((run) => {
  const record = JSON.parse(readFileSync(join(PROJECT_ROOT, `test/goldens/judge/spike-${name}.run${run}.json`), 'utf8'));
  const latency = record.calls.map((call: any) => call.latencyMs).sort((left: number, right: number) => left - right);
  return { run, passed: record.verdict.passed, metrics: record.verdict.metrics, fixtureRevision: record.fixtureRevision, model: record.model, calls: record.calls.length, p50: record.latencyP50Ms, p95: latency[Math.ceil(latency.length * 0.95) - 1] };
})]));
const fixture = JSON.parse(readFileSync(join(PROJECT_ROOT, 'test/fixtures/judge/spike-repetition.json'), 'utf8'));
const loops = fixture.rows.filter((row: any) => row.label === 'loops');
const fresh = fixture.rows.filter((row: any) => row.label === 'fresh');
const miner = { loops: loops.length, fresh: fresh.length, loopRecall: loops.filter((row: any) => hotPhrases(row.replies).length).length / loops.length, freshSpecificity: fresh.filter((row: any) => !hotPhrases(row.replies).length).length / fresh.length, calls: 0 };
const attempts = readFileSync(join(PROJECT_ROOT, 'test/measurements/v2.8/13-phase-a/b4-attempts.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).length;
const report = { ideas, miner, upstreamCallsThisTask: attempts, priorRecordedCalls: 214, recordedTotal: 214 + attempts, blocked: { J76: 'Plan 12 residual-read replay and per-kind heldout labels have not run; no floors changed.', N8: 'Relationship M1 comparative model arms remain owed; existing typed-first path unchanged.' }, conditional: { N5: 'Judge-only columns passed twice; extractor comparison and deterministic quiet baseline owed.' }, caveats: ['Cast/hop fixtures are template families (10 pairs), not 20 independent archived sessions.', 'Tone fixture exercises extreme match/opposition, not intermediate levels.', 'Private replay covers 20 of 49 windows in one archived session; distribution only, not full corpus or labelled accuracy.'] };
writeFileSync(join(PROJECT_ROOT, 'test/measurements/v2.8/13-phase-a/b4-summary.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
