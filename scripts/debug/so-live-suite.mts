import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

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

async function runSuite(page, { min, filter, record, judge = false }) {
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
      const sources = (live.deltas ?? []).map((d) => `${d.q}:${d.judge === undefined ? 'llm' : `judge@${d.judge}`}`);
      results.push({ name: fixture.name, pass, expected: expectedNorm, live: liveNorm, ...(judge ? { sources, judged: live.judged?.answered ?? [] } : {}), ms: Date.now() - startedAt });
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
  const report = { total: results.length, passed, accuracy: Number(accuracy.toFixed(4)), min, ok: accuracy >= min, recorded: record, judge, results };
  await writeJSON(report, judge ? 'so-live-suite-judge-report' : 'so-live-suite-report');
  console.log(JSON.stringify({ total: report.total, passed, accuracy: report.accuracy, min, ok: report.ok }, null, 2));
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
  runCli((page) => runSuite(page, { min, filter, record, judge: process.argv.includes('--judge') }));
}
