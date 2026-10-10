import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './lib/client.mts';
import { CALIBRATION_USES, FAMILY_USES, isCalibrationUse, runUse, USE_TIERS, type CalibrationUse } from './lib/uses.mts';
import {
  auroc, costPer1k, decisionBrier, expectedCalibrationError, flipRate, linkConfidence, percentile, preregIssues, questionsPerRequest, rotateRequest, twinAgreement, unrotateResponse,
  type MatrixRequest, type MatrixResponse, type MatrixRow,
} from '../../debug/lib/judgeMatrixMetrics.mts';

register('./lib/loader.mts', import.meta.url);

const ARMS = ['typesafe', 'systemone-local', 'off'] as const;
type Arm = (typeof ARMS)[number];

const BUDGET_MS: Record<CalibrationUse, number> = {
  director: 1500, 'memory-verify': 3000, 'memory-pairs': 3000, scene: 2500, lore: 1500, 'curator-filter': 4000, continuity: 4000,
  backgrounds: 2500, typed: 5000, stall: 4000, critic: 2500, variants: 2500, agency: 4000, 'house-rules': 4000,
};

const TYPESAFE_TARIFF = { inputPerMillion: 0, outputPerMillion: 0 };

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/matrix.mts --arm typesafe|systemone-local|off[,...]
  --use all|tier1|tier2|tier3|<use>[,<use>...] [--runs 2] [--rotate] [--holdout] [--prereg <note.json>] [--out <dir>] [--dry]

The provider matrix runner (v2.8 plan 14, P2): every fixture under test/fixtures/judge/ × every arm, through the
production judge code (src/judge) and the real plugin handler, serially (one call in flight) for a local arm.
Per run it writes calls.jsonl (request, raw answer, latency), rows.jsonl (each calibration row with the confidence of
its request) and summary.json: the floor result, p50/p95 against the use's budget, decision Brier, ECE, AUROC,
option-rotation flips (--rotate), trigger-only twin agreement, questions per request and $/1k decisions.

Arms: typesafe (key from env or ~/.typesafe/api-key/.env), systemone-local (SO_JUDGE_LOCAL_URL + SO_JUDGE_MODELS_DIR,
the server from scripts/local/judge.mjs start), off (no judge: every use takes its fallback).
A run that asks a model needs --prereg: a JSON note naming arm, model, uses, runs, thresholds, budget and the commit it
was written at, committed before the run. Gold labels only; no answer becomes a label (MCA 2.3).
Uses: ${CALIBRATION_USES.join(', ')}.`;

const argv = process.argv.slice(2);
const option = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
if (argv.includes('--help') || !option('--arm')) {
  console.log(USAGE);
  process.exit(option('--arm') || argv.includes('--help') ? 0 : 1);
}

const arms = (option('--arm') ?? '').split(',').map((arm) => arm.trim()).filter(Boolean);
const badArm = arms.find((arm) => !(ARMS as readonly string[]).includes(arm));
if (badArm) throw new Error(`unknown arm ${badArm} (known: ${ARMS.join(', ')})`);
const useArg = option('--use') ?? 'all';
const uses: CalibrationUse[] = useArg === 'all' ? [...CALIBRATION_USES] : useArg in USE_TIERS ? [...USE_TIERS[useArg as keyof typeof USE_TIERS]] : useArg.split(',').map((use) => use.trim());
const badUse = uses.find((use) => !isCalibrationUse(use));
if (badUse) throw new Error(`unknown use ${badUse}`);
const runs = Number(option('--runs') ?? 2);
const rotate = argv.includes('--rotate');
const holdout = argv.includes('--holdout');
const dry = argv.includes('--dry');

const fixtureFile = (name: string) => join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${name}.json`);
const fixturesFor = (use: CalibrationUse) => [use, ...(holdout && existsSync(fixtureFile(`${use}-holdout`)) ? [`${use}-holdout`] : [])];

const modelArms = arms.filter((arm) => arm !== 'off') as Arm[];
const prereg = option('--prereg');
const note = prereg ? JSON.parse(readFileSync(resolve(prereg), 'utf-8')) : null;
for (const arm of modelArms) {
  if (!note) throw new Error(`arm ${arm} asks a model: pass --prereg <note.json>, committed before the run`);
  const notes = Array.isArray(note) ? note : [note];
  const mine = notes.find((entry: any) => entry?.arm === arm) ?? notes[0];
  const issues = preregIssues(mine, { arm, uses });
  if (issues.length) throw new Error(`preregistration note for ${arm}: ${issues.join('; ')}`);
}

const head = (() => {
  try { return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim(); } catch { return null; }
})();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const debugRoot = process.env.SO_DEBUG_DIR ?? 'C:/dev/so-lanes/0/debug';
const out = resolve(option('--out') ?? join(debugRoot, 'judge-matrix', stamp));

console.log(`matrix: arms ${arms.join(', ')}; uses ${uses.join(', ')}; runs ${runs}${rotate ? ' + rotated' : ''}${holdout ? '; holdouts' : ''}; out ${out}`);
for (const use of uses) for (const fixture of fixturesFor(use)) if (!existsSync(fixtureFile(fixture))) throw new Error(`no fixture ${fixture}.json`);
if (dry) {
  console.log('dry run: plan checked, nothing asked');
  process.exit(0);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'run.json'), `${JSON.stringify({ startedAt: new Date().toISOString(), head, arms, uses, runs, rotate, holdout, prereg: note }, null, 2)}\n`);

const judge = { ...(await import('@judge/index')), ...(await import('@judge/calibration')) } as any;
const plugin = await import(pathToFileURL(resolve(PROJECT_ROOT, 'server-plugin', 'story-orchestrator-judge', 'index.mjs')).href);
const handlers = plugin.createHandlers({ accountsEnabled: false, log: () => undefined });

const viaPlugin = (handler: (request: unknown, response: unknown) => Promise<unknown>) => async (request: unknown) => {
  const reply: { status: number; body: any } = { status: 200, body: null };
  const res = {
    status(code: number) { reply.status = code; return res; },
    type() { return res; },
    set() { return res; },
    json(value: unknown) { reply.body = value; return res; },
    send(value: string) { reply.body = JSON.parse(value); return res; },
  };
  await handler({ body: request, headers: {} }, res);
  if (reply.status !== 200) throw Object.assign(new Error(`plugin ${reply.status}: ${JSON.stringify(reply.body)}`), { status: reply.status });
  return reply.body;
};

const transports: Record<Arm, (request: unknown) => Promise<unknown>> = {
  typesafe: viaPlugin(handlers.systemone),
  'systemone-local': viaPlugin(handlers.localSystemone),
  off: async () => { throw Object.assign(new Error('judge off'), { status: 409 }); },
};

const serial = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(run: () => Promise<T>): Promise<T> => {
    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  };
};

function ownFloor(use: CalibrationUse, fixture: any, rows: MatrixRow[], rate: number): boolean | null {
  if (use === 'memory-pairs' && typeof fixture.floors?.rightAction === 'number') return rate >= fixture.floors.rightAction;
  if (use !== 'memory-verify' || !fixture.floors) return null;
  const supported = new Map<string, boolean>(fixture.rows.map((entry: any) => [entry.id, entry.supported === true]));
  const share = (want: boolean, dropped: boolean) => {
    const group = rows.filter((row) => supported.get(row.id) === want);
    return group.length ? group.filter((row) => (want ? !row.right : row.right) === dropped).length / group.length : 0;
  };
  return share(false, true) >= fixture.floors.unsupportedDropped && share(true, true) <= fixture.floors.supportedDropped;
}

const summaries: unknown[] = [];
for (const arm of arms as Arm[]) {
  const queue = serial();
  for (const use of uses) {
    for (const fixtureName of fixturesFor(use)) {
      const fixture = JSON.parse(readFileSync(fixtureFile(fixtureName), 'utf-8'));
      const passes = [...Array.from({ length: runs }, (_, run) => ({ run: run + 1, rotated: false })), ...(rotate ? [{ run: 1, rotated: true }] : [])];
      const byPass: Record<string, MatrixRow[]> = {};
      for (const pass of passes) {
        const requests: MatrixRequest[] = [];
        const responses: Array<MatrixResponse | null> = [];
        const latencies: number[] = [];
        const ask = (request: MatrixRequest) => queue(async () => {
          const slot = requests.length;
          requests.push(request);
          responses.push(null);
          const outgoing = pass.rotated ? rotateRequest(request) : request;
          const transport = async (sent: unknown) => {
            const answer = await transports[arm](sent) as MatrixResponse;
            return pass.rotated ? unrotateResponse(answer, request) : answer;
          };
          const result = await judge.askJudge(transport, arm === 'typesafe' ? { ...outgoing, model: judge.JUDGE_DEFAULT_MODEL } : outgoing, { timeoutMs: Number(option('--ask-timeout') ?? (arm === 'typesafe' ? 10_000 : 30_000)) });
          responses[slot] = result.answers ? { model: result.model ?? undefined, answers: result.answers, usage: result.usage } : null;
          if (!result.fallback) latencies.push(result.latencyMs);
          appendFileSync(join(out, 'calls.jsonl'), `${JSON.stringify({ arm, use, fixture: fixtureName, run: pass.run, rotated: pass.rotated, slot, request, answers: result.answers ?? null, model: result.model ?? null, fallback: result.fallback ?? null, latencyMs: result.latencyMs, usage: result.usage ?? null })}\n`);
          return result;
        });
        const report = await runUse(judge, use, ask, fixture);
        const { rows, linked } = linkConfidence(report.rows as MatrixRow[], responses);
        byPass[`${pass.run}:${pass.rotated}`] = rows;
        for (const entry of rows) appendFileSync(join(out, 'rows.jsonl'), `${JSON.stringify({ arm, use, fixture: fixtureName, run: pass.run, rotated: pass.rotated, ...entry })}\n`);
        const families = FAMILY_USES.includes(use) ? judge.judgeFamilyScores(report, fixture.floors ?? {}) : [];
        const floor = typeof fixture.floor === 'number' ? fixture.floor : null;
        const rate = report.total ? report.right / report.total : 0;
        const floorOk = families.length ? families.every((family: any) => family.ok) : floor !== null ? rate >= floor : ownFloor(use, fixture, rows, rate);
        const p95 = percentile(latencies, 95);
        const fallbacks = rows.filter((row) => row.fallback).length;
        const summary = {
          arm, use, fixture: fixtureName, run: pass.run, rotated: pass.rotated, model: report.model ?? null,
          right: report.right, total: report.total, rate: Number(rate.toFixed(4)), families, floor, floorOk,
          p50LatencyMs: percentile(latencies, 50), p95LatencyMs: p95, budgetMs: BUDGET_MS[use], withinBudget: p95 === null ? null : p95 <= BUDGET_MS[use],
          fallbacks, requests: requests.length, questionsPerRequest: questionsPerRequest(requests),
          linked, brier: decisionBrier(rows), ece: expectedCalibrationError(rows), auroc: auroc(rows), twins: twinAgreement(rows),
          costPer1kDecisions: costPer1k(responses, report.total, arm === 'typesafe' ? TYPESAFE_TARIFF : null),
          ...(pass.rotated ? { rotation: flipRate(byPass['1:false'] ?? [], rows) } : {}),
        };
        summaries.push(summary);
        console.log(`${arm.padEnd(16)} ${fixtureName.padEnd(24)} run ${pass.run}${pass.rotated ? 'r' : ' '} ${report.right}/${report.total} floor ${floorOk === null ? '?' : floorOk ? 'ok' : 'MISS'} p95 ${p95 ?? '-'}/${BUDGET_MS[use]} ms fallbacks ${fallbacks}${pass.rotated && 'rotation' in summary ? ` flips ${(summary as any).rotation.flips}/${(summary as any).rotation.compared}` : ''}`);
      }
    }
  }
}
writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ finishedAt: new Date().toISOString(), head, summaries }, null, 2)}\n`);
console.log(`\nwrote ${join(out, 'summary.json')}`);
