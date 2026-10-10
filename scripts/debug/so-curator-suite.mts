import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/so-curator-suite.mts run [--revision 2] [--samples 3] [--filter <id>] [--record] [--expect-count 24]

v2.8 plan 11 (was v2.4 plan 06 F5 Phase A). Runs every case of the curator-create fixture through the
Lore creation role's route (globalThis.storyOrchestratorLiveSuite.runCuratorCreate, role "lore", which
falls back to the curator's route when unset): the candidate create prompt, the create parser and the
shipped contract-B guards (allowlist, existing title, a hidden entry recreated, empty keys, cast-name keys,
>= 2 live facts naming the title or first key). Nothing is written to any lorebook. --revision 1 reruns
the frozen v2.4/v2.6 fixture (cases.json); the default, 2, is the contract-B fixture (revision-2.json).
Two passing runs on one route make an eligibility row (src/stagecraft/createEligibility.ts).

Scored end to end, after the code guards, against the floors the fixture declares (propose >= 0.90
of samples yield a valid card naming the case's entity; none = 1.00 of samples yield no valid card).
Model-alone rates (any [create] line at all) are reported, never scored. Below the floor the create
op is NOT built, and no floor is retuned. Capture a run header first (so-run-header capture).

  --samples <n>       samples per case (default: the fixture's own, 3)
  --filter <id>       only cases whose id contains <id>
  --record            write test/goldens/live/curator-create/<id>.json (raw responses; replayed in jest)
  --expect-count <n>  fail unless exactly n cases ran`;

const REVISION = argValue('--revision', '2');
const CASES = join(PROJECT_ROOT, REVISION === '1' ? 'test/fixtures/curator-create/cases.json' : 'test/fixtures/curator-create/revision-2.json');
const GOLDEN_DIR = join(PROJECT_ROOT, REVISION === '1' ? 'test/goldens/live/curator-create' : 'test/goldens/live/curator-create-r2');

function argValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function runSuite(page, { samples, filter, record, expectCount }: { samples: number | null; filter: string; record: boolean; expectCount: number | null }) {
  const fixture = JSON.parse(await readFile(CASES, 'utf-8'));
  const cases = fixture.cases.filter((entry) => !filter || entry.id.includes(filter));
  const perCase = samples ?? fixture.samples ?? 3;
  if (record) await mkdir(GOLDEN_DIR, { recursive: true });

  const rows = [];
  for (const entry of cases) {
    const runs = [];
    for (let sample = 0; sample < perCase; sample += 1) {
      try {
        const live = await evaluateInST(page, async (spec) => {
          const suite = globalThis.storyOrchestratorLiveSuite;
          if (!suite?.runCuratorCreate) throw new Error('storyOrchestratorLiveSuite.runCuratorCreate not registered (rebuild + st-session reload)');
          return suite.runCuratorCreate(spec);
        }, entry);
        runs.push({ rawResponse: live.rawResponse, sample: live.sample });
      } catch (err) {
        runs.push({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    const passes = runs.map((run) => Boolean(run.sample?.pass));
    const modelCreated = runs.filter((run) => (run.sample?.created ?? 0) > 0).length;
    rows.push({ id: entry.id, lang: entry.lang, label: entry.label, why: entry.why, passes, modelCreated, errors: runs.filter((run) => run.error).map((run) => run.error), runs });
    console.log(`${passes.every(Boolean) ? 'PASS' : 'FAIL'} ${entry.id} ${entry.label}/${entry.why} ${passes.filter(Boolean).length}/${perCase}${modelCreated ? ` (model proposed a create in ${modelCreated})` : ''}`);
    if (record) await writeFile(join(GOLDEN_DIR, `${entry.id}.json`), `${JSON.stringify({ id: entry.id, label: entry.label, frozenAt: fixture.frozenAt, responses: runs.map((run) => run.rawResponse ?? null), passes }, null, 2)}\n`);
  }

  const rate = (label: string, pick: (row) => number) => {
    const scoped = rows.filter((row) => row.label === label);
    const total = scoped.length * perCase;
    return total ? scoped.reduce((sum, row) => sum + pick(row), 0) / total : 0;
  };
  const propose = rate('propose', (row) => row.passes.filter(Boolean).length);
  const none = rate('none', (row) => row.passes.filter(Boolean).length);
  const incomplete = rows.filter((row) => row.errors.length).map((row) => row.id);
  const reasons = [
    ...(propose < fixture.floors.propose ? [`propose ${propose.toFixed(3)} < floor ${fixture.floors.propose}`] : []),
    ...(none < fixture.floors.none ? [`none ${none.toFixed(3)} < floor ${fixture.floors.none}`] : []),
    ...(incomplete.length ? [`incomplete: ${incomplete.join(', ')}`] : []),
    ...(expectCount !== null && rows.length !== expectCount ? [`ran ${rows.length} case(s), expected ${expectCount}`] : []),
  ];
  const report = {
    revision: fixture.revision ?? '1',
    contract: fixture.contract ?? 'create-A',
    frozenAt: fixture.frozenAt,
    floors: fixture.floors,
    samples: perCase,
    cases: rows.length,
    endToEnd: { propose: Number(propose.toFixed(4)), none: Number(none.toFixed(4)) },
    modelAlone: { proposeCreated: Number(rate('propose', (row) => row.modelCreated).toFixed(4)), noneCreated: Number(rate('none', (row) => row.modelCreated).toFixed(4)) },
    verdict: reasons.length ? 'NOT BUILT' : 'PASSES FLOOR',
    notGreen: reasons,
    ok: reasons.length === 0,
    rows,
  };
  await writeJSON(report, 'so-curator-suite-report');
  for (const reason of reasons) console.log(`NOT GREEN: ${reason}`);
  console.log(JSON.stringify({ cases: report.cases, samples: perCase, endToEnd: report.endToEnd, modelAlone: report.modelAlone, verdict: report.verdict }, null, 2));
  return { ok: report.ok };
}

export { runSuite };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'run' || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const samplesRaw = argValue('--samples', '');
  const expectRaw = argValue('--expect-count', '');
  runCli((page) => runSuite(page, { samples: samplesRaw ? Number(samplesRaw) : null, filter: argValue('--filter', ''), record: process.argv.includes('--record'), expectCount: expectRaw ? Number(expectRaw) : null }));
}
