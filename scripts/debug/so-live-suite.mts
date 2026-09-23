import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { DEFAULT_TIER_FLOORS, parseTierFloors, scoreContains, scoreRejected, suiteVerdict, tierTotals } from './lib/liveSuiteScore.mts';

const USAGE = `Usage: node scripts/debug/so-live-suite.mts run [--min 0.9] [--filter <substr>] [--record] [--judge]

Runs every test/fixtures/extractor*.{story,transcript,expected}.json triple through the live
extraction model (globalThis.storyOrchestratorLiveSuite.runFixture) and scores exact-match on
plot deltas {q,v}. tension_current is judged only when the fixture expects it (|live-expected|
<= 0.3, the spec's tension MAE bound) — the contract asks the model to rate tension every read,
so volunteered tension lines on plot fixtures are not errors. Requires a Connection Manager
memory profile selected in the extension settings.

  --min <n>       minimum accuracy for exit 0 (default 0.9)
  --filter <s>    only run fixtures whose name contains <s>
  --record        write each live raw response to test/goldens/live/<name>.response.txt
  --min-tier <s>  per-tier floors over the defaults facts=0.85,rejected=0.9,epistemic=0.8,ledger=0.8,arcs=0.8
                  (a tier below its floor fails; tier=0 switches one off, and the report says so)
  --expect-count <n>  fail unless exactly n fixtures ran — a shrinking denominator cannot raise accuracy
  --judge         v2.2 plan 06: merge test/fixtures/<name>.hints.json (read_as + criteria per quality)
                  into the fixture's story, let the judge read the hinted qualities first and the LLM
                  the rest (the cadence read's split). Needs the judge plugin; recordings go to
                  test/goldens/judge/live/<name>.json. Floor --min 0.85 before miss triage.`;

const FIX_DIR = join(PROJECT_ROOT, 'test/fixtures');
const LIVE_GOLDEN_DIR = join(PROJECT_ROOT, 'test/goldens/live');
const JUDGE_GOLDEN_DIR = join(PROJECT_ROOT, 'test/goldens/judge/live');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf-8'));

const TENSION_KEY = 'tension_current';
const TENSION_TOLERANCE = 0.3;

const normDeltas = (deltas) => deltas.map((d) => `${d.q}=${JSON.stringify(d.v)}`).sort();

function scoreFixture(expectedDeltas, liveDeltas) {
  const expectedNorm = normDeltas(expectedDeltas.filter((d) => d.q !== TENSION_KEY));
  const liveNorm = normDeltas(liveDeltas.filter((d) => d.q !== TENSION_KEY));
  const plotPass = JSON.stringify(expectedNorm) === JSON.stringify(liveNorm);
  const expectedTension = expectedDeltas.find((d) => d.q === TENSION_KEY);
  if (!expectedTension) return { pass: plotPass, expectedNorm, liveNorm };
  const liveTension = liveDeltas.find((d) => d.q === TENSION_KEY);
  const tensionPass = typeof liveTension?.v === 'number' && Math.abs(liveTension.v - expectedTension.v) <= TENSION_TOLERANCE;
  return {
    pass: plotPass && tensionPass,
    expectedNorm: [...expectedNorm, `${TENSION_KEY}~${expectedTension.v}±${TENSION_TOLERANCE}`],
    liveNorm: [...liveNorm, `${TENSION_KEY}=${liveTension?.v ?? 'none'}`],
  };
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function discoverFixtures(filter) {
  const files = await readdir(FIX_DIR);
  const names = files
    .filter((file) => /^extractor.*\.story\.json$/.test(file))
    .map((file) => file.replace(/\.story\.json$/, ''))
    .filter((name) => !filter || name.includes(filter))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const fixtures = [];
  for (const name of names) {
    try {
      const story = await readJson(join(FIX_DIR, `${name}.story.json`));
      const transcript = await readJson(join(FIX_DIR, `${name}.transcript.json`));
      const expected = await readJson(join(FIX_DIR, `${name}.expected.json`));
      const hints = await readJson(join(FIX_DIR, `${name}.hints.json`)).catch(() => null);
      fixtures.push({ name, story, transcript, expected, hints });
    } catch {
      // skip fixtures without a full triple
    }
  }
  return fixtures;
}

async function runSuite(page, { min, filter, record, judge = false, floors = DEFAULT_TIER_FLOORS as Partial<Record<string, number>>, floorsGiven = [] as string[], expectCount = null }) {
  const fixtures = await discoverFixtures(filter);
  if (!fixtures.length) throw new Error(`No fixtures found in ${FIX_DIR}`);
  if (record) await mkdir(judge ? JUDGE_GOLDEN_DIR : LIVE_GOLDEN_DIR, { recursive: true });

  const results = [];
  for (const fixture of fixtures) {
    const startedAt = Date.now();
    try {
      const live = await evaluateInST(page, async (spec) => {
        const suite = globalThis.storyOrchestratorLiveSuite;
        if (!suite) throw new Error('storyOrchestratorLiveSuite not registered');
        return suite.runFixture({ story: spec.story, transcript: spec.transcript, ...(spec.overrides ?? {}) }, spec.judge ? { judge: true, hints: spec.hints ?? {} } : {});
      }, { story: fixture.story, transcript: fixture.transcript, overrides: fixture.expected?.spec ?? {}, judge, hints: fixture.hints });

      const { pass, expectedNorm, liveNorm } = scoreFixture(fixture.expected.deltas ?? [], live.deltas ?? []);
      // §F: score every tier the fixture states, not only the plot deltas. `facts` and `rejected`
      // expectations have been in these files all along with nothing reading them.
      const tiers = [
        { tier: 'deltas' as const, scored: true, pass, detail: `expected=[${expectedNorm.join(', ')}] live=[${liveNorm.join(', ')}]` },
        scoreContains('facts', fixture.expected.facts, live.facts ?? []),
        scoreRejected(fixture.expected.rejected, live.rejected ?? []),
        scoreContains('memory', fixture.expected.memory, live.memory ?? []),
        scoreContains('arcs', fixture.expected.arcs, live.arcs ?? []),
        scoreContains('epistemic', fixture.expected.epistemic, live.epistemic ?? []),
        scoreContains('ledger', fixture.expected.ledger, live.ledger ?? []),
      ].filter((row) => row.scored);
      const tierFailures = tiers.filter((row) => !row.pass);
      const sources = (live.deltas ?? []).map((d) => `${d.q}:${d.judge === undefined ? 'llm' : `judge@${d.judge}`}`);
      results.push({ name: fixture.name, pass, tiers, expected: expectedNorm, live: liveNorm, ...(judge ? { sources, judged: live.judged?.answered ?? [] } : {}), ms: Date.now() - startedAt });
      for (const row of tierFailures) console.log(`  ${row.tier}: ${row.detail}`);
      if (record && judge) await writeFile(join(JUDGE_GOLDEN_DIR, `${fixture.name}.json`), `${JSON.stringify({ rawResponse: live.rawResponse, judged: live.judged ?? null }, null, 2)}\n`);
      else if (record) await writeFile(join(LIVE_GOLDEN_DIR, `${fixture.name}.response.txt`), `${live.rawResponse}\n`);
      console.log(`${pass ? 'PASS' : 'FAIL'} ${fixture.name} expected=[${expectedNorm.join(', ')}] live=[${liveNorm.join(', ')}]${judge ? ` sources=[${sources.join(', ')}]` : ''}`);
    } catch (err) {
      results.push({ name: fixture.name, pass: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - startedAt });
      console.log(`FAIL ${fixture.name} ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const passed = results.filter((entry) => entry.pass).length;
  const accuracy = passed / results.length;
  const totals = tierTotals(results.map((entry) => ({ name: entry.name, pass: entry.pass, tiers: entry.tiers ?? [] })), floors);
  const incomplete = results.filter((entry) => entry.error).map((entry) => entry.name);
  // The headline has always meant plot deltas; it is labelled that way now, and every other tier
  // carries its own floor so a strong tier cannot carry a weak one.
  const verdict = suiteVerdict({ plotAccuracy: accuracy, min, totals, ran: results.length, expectCount, incomplete });
  const report = {
    total: results.length,
    passed,
    plotDeltaAccuracy: Number(accuracy.toFixed(4)),
    min,
    tiers: totals,
    floors: Object.fromEntries(Object.entries(floors).map(([tier, floor]) => [tier, { floor, from: floorsGiven.includes(tier) ? 'given' : 'default' }])),
    expectCount: expectCount ?? null,
    incomplete,
    notGreen: verdict.reasons,
    ok: verdict.ok,
    recorded: record,
    judge,
    results,
  };
  await writeJSON(report, judge ? 'so-live-suite-judge-report' : 'so-live-suite-report');
  for (const [tier, total] of Object.entries(totals)) {
    console.log(`${total.ok ? 'ok  ' : 'FAIL'} ${tier.padEnd(10)} ${total.passed}/${total.scored}${total.floor === undefined ? '' : ` floor ${total.floor}`}${total.vacuous.length ? `  [vacuous expectations: ${total.vacuous.join(', ')}]` : ''}`);
  }
  for (const reason of verdict.reasons) console.log(`NOT GREEN: ${reason}`);
  console.log(JSON.stringify({ total: report.total, passed, plotDeltaAccuracy: report.plotDeltaAccuracy, min, tiers: totals, ok: report.ok }, null, 2));
  return { ok: report.ok };
}

export { runSuite };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'run' || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const min = Number(argValue('--min', '0.9'));
  const filter = argValue('--filter', '');
  const record = process.argv.includes('--record');
  const { floors, given, errors } = parseTierFloors(argValue('--min-tier', ''));
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  const expectCountRaw = argValue('--expect-count', '');
  runCli((page) => runSuite(page, { min, filter, record, judge: process.argv.includes('--judge'), floors, floorsGiven: given, expectCount: expectCountRaw ? Number(expectCountRaw) : null }));
}
