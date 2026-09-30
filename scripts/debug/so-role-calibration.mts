import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { roleVerdict, summarizeHoldout, type RoleRun } from './lib/roleVerdict.mts';
import { effortArmLabel, parseEffortArm, pinRoleEffort, readRoleReasoning, restoreRoleEfforts, type EffortArm } from './lib/roleEffort.mts';

const USAGE = `Usage: node scripts/debug/so-role-calibration.mts run --role director|curator|authoring|synthesis [--profile <name|id>] [--effort default|off|low|medium|high] [--arm <label>] [--filter <id>] [--record] [--expect-count <n>] [--holdout] [--digest-pad <book>]
       node scripts/debug/so-role-calibration.mts verdict <report-run1.json> <report-run2.json>

v2.4 plan 08 T18 per-role calibration. Runs every case of the role's fixture through the role's real
prompt/parse path on the real model (globalThis.storyOrchestratorLiveSuite.runRoleCase, src/runtime/roleCalibration.ts),
then scores it against the floors predeclared in docs/plans/v2.4/08-author-observability.md
(§"Per-role calibration floors"). A floor is never retuned.

  --profile <name|id>  route the role to this Connection Manager profile for the run (extraction.profiles[role]);
                       without it the role is UNSET for the run (the memory-model fallback). The role map is
                       restored afterwards and read back.
  --effort <level>     v2.6 plan 05 R3: pin this role's reasoning effort for the run (extraction.routes[role]); the role map is
                       restored afterwards and read back. The report records what the connection did with it (applied /
                       unsupported / collapsed) and the reasoning it spent. The arm label gains -effort-<level>.
  --arm <label>        golden file suffix (default: routed when --profile is given, else shared)
  --record             write test/goldens/live/role-calibration/<role>-<arm>.json (replayed in jest)
  --expect-count <n>   fail unless exactly n cases ran (the fixture's cases; hold-out rows are counted apart)
  --digest-pad <book>  curator only (v2.5 plan 09 SP8 W4 b): pad every case with this install's lorebook (read only), prompt through
                       the digest spike (src/stagecraft/curatorDigest.ts), refuse title-only rewrites/patches, score with today's
                       rules and floors. The report carries each case's digest ratio. Default arm: digest.
  --holdout            authoring only (v2.5 plan 06 J1): also run test/fixtures/role-calibration/authoring-holdout.json
                       and report its validity/opShape beside the fixture score. It never enters the floors.

verdict: the plan 06 J1 rule over two consecutive recorded reports of one role and one bundle: recommended only if
both meet every floor; an authoring hold-out miss in either run reads 'fixture floors met; generalisation not shown'.
Record the two runs under distinct arms (e.g. --arm shared-<bundle>-r1, -r2) so the second does not overwrite the first.

Fixtures: director = test/fixtures/judge/director.json (floor over D01-D26; Spanish rows reported),
curator/authoring/synthesis = test/fixtures/role-calibration/<role>.json. Capture a run header first.`;

const ROLES = ['director', 'curator', 'authoring', 'synthesis'];
const GOLDEN_DIR = join(PROJECT_ROOT, 'test/goldens/live/role-calibration');
const DIRECTOR_FLOOR_IDS = Array.from({ length: 26 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`);

function argValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const readJson = async (path: string) => JSON.parse(await readFile(join(PROJECT_ROOT, path), 'utf-8'));

export function directorTitleFor(row, spikeRows: Array<{ id: string; world: string }>, worlds: Array<{ id: string; title: string; roster: Array<{ name: string }> }>): string {
  const byId = spikeRows.find((entry) => entry.id === row.id);
  const world = byId ? worlds.find((entry) => entry.id === byId.world) : null;
  if (world) return world.title;
  const names = row.input.candidates.map((candidate) => candidate.name);
  const ranked = worlds
    .map((entry) => ({ entry, shared: entry.roster.filter((member) => names.includes(member.name)).length }))
    .sort((left, right) => right.shared - left.shared);
  return ranked[0]?.shared ? ranked[0].entry.title : '';
}

export async function loadCases(role: string) {
  if (role === 'director') {
    const fixture = await readJson('test/fixtures/judge/director.json');
    const spike = await readJson('scripts/spike/typesafe/data/director.json');
    const worlds = await readJson('scripts/spike/typesafe/data/worlds.json');
    return {
      frozenAt: fixture.labelledAt,
      floorIds: DIRECTOR_FLOOR_IDS,
      cases: fixture.rows.map((row) => ({
        id: row.id,
        lang: row.tags.includes('spanish') ? 'es' : 'en',
        acceptable: row.acceptable,
        input: {
          storyTitle: directorTitleFor(row, spike, worlds),
          checkpointName: row.input.checkpointName,
          objective: row.input.objective,
          candidates: row.input.candidates,
          allowSilence: row.input.allowSilence,
          ...(row.input.lead ? { lead: row.input.lead } : {}),
          ...(row.input.instruction ? { instruction: row.input.instruction } : {}),
          window: row.input.window,
        },
      })),
    };
  }
  const fixture = await readJson(`test/fixtures/role-calibration/${role}.json`);
  if (role === 'authoring') {
    return {
      frozenAt: fixture.frozenAt,
      floorIds: null,
      cases: fixture.cases.map((entry) => ({ ...entry, draft: fixture.drafts[entry.draft], ...(entry.stage === 'provisioning' ? { environment: fixture.environment } : {}) })),
    };
  }
  return { frozenAt: fixture.frozenAt, floorIds: null, cases: fixture.cases };
}

export async function loadHoldout(role: string) {
  if (role !== 'authoring') return null;
  const holdout = await readJson('test/fixtures/role-calibration/authoring-holdout.json');
  const fixture = await readJson(`test/fixtures/role-calibration/${holdout.draftsFrom}`);
  return {
    labelledAt: holdout.labelledAt,
    cases: holdout.cases.map((entry) => ({ ...entry, draft: fixture.drafts[entry.draft], ...(entry.stage === 'provisioning' ? { environment: fixture.environment } : {}) })),
  };
}

export function verdictFromReports(reports) {
  const roles = [...new Set(reports.map((report) => report.role))];
  if (roles.length !== 1) throw new Error(`a verdict is for one role; got ${roles.join(', ')}`);
  const runs: RoleRun[] = reports.map((report) => ({ bundle: report.bundle, meetsFloors: report.summary?.meetsFloors ?? null, holdout: report.holdout ?? null }));
  return roleVerdict(runs, { holdoutRequired: roles[0] === 'authoring' });
}

async function setRoute(page, role: string, profile: string | null) {
  return evaluateInST(page, ({ role, profile }) => {
    const rt = globalThis.storyOrchestratorRuntime;
    const profiles = SillyTavern.getContext().extensionSettings?.connectionManager?.profiles ?? [];
    const before = { ...(rt.getGlobalSettings().extraction.profiles ?? {}) };
    const next = { ...before };
    let chosen = null;
    if (profile) {
      chosen = profiles.find((entry) => entry.id === profile || entry.name === profile);
      if (!chosen) throw new Error(`no Connection Manager profile named or id'd "${profile}"`);
      next[role] = chosen.id;
    } else {
      delete next[role];
    }
    rt.setExtractionSettings({ profiles: next });
    const route = (rt.getSnapshot().roleRoutes ?? []).find((entry) => entry.role === role) ?? null;
    const memory = profiles.find((entry) => entry.id === rt.getGlobalSettings().extraction.profileId);
    return { before, route, profile: chosen ? { id: chosen.id, name: chosen.name } : { id: memory?.id ?? null, name: memory?.name ?? null, fallback: true } };
  }, { role, profile });
}

async function restoreRoute(page, before) {
  const after = await evaluateInST(page, (before) => {
    const rt = globalThis.storyOrchestratorRuntime;
    rt.setExtractionSettings({ profiles: before });
    return rt.getGlobalSettings().extraction.profiles ?? {};
  }, before);
  await saveSettingsNow(page);
  return after;
}

async function runCases(page, role: string, cases, digestPad: string | null = null) {
  const records = [];
  const incomplete = [];
  for (const entry of cases) {
    let outcome = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3 && !outcome; attempt += 1) {
      try {
        outcome = await evaluateInST(page, async ({ role, entry, digestPad }) => {
          const suite = globalThis.storyOrchestratorLiveSuite;
          if (digestPad) {
            if (!suite?.runCuratorDigestCase) throw new Error('storyOrchestratorLiveSuite.runCuratorDigestCase not registered (a bundle without the SP8 spike, or rebuild + st-session reload)');
            return suite.runCuratorDigestCase(entry, digestPad);
          }
          if (!suite?.runRoleCase) throw new Error('storyOrchestratorLiveSuite.runRoleCase not registered (rebuild + st-session reload)');
          return suite.runRoleCase(role, entry);
        }, { role, entry, digestPad });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    if (!outcome) {
      incomplete.push({ id: entry.id, error: lastError });
      console.log(`ERROR ${entry.id}: ${lastError}`);
      continue;
    }
    records.push({ ...outcome, case: entry });
    const score = outcome.score;
    const verdict = role === 'director' ? `${score.correct ? 'PASS' : 'FAIL'} pick=${score.pick} ${outcome.latencyMs} ms`
      : role === 'curator' ? `valid=${score.valid} shape=${score.survived}/${score.opLines} decision=${score.decision} kept=[${score.kept.join(', ')}]`
      : role === 'authoring' ? `valid=${score.valid} (${score.status}${score.repaired ? ', repaired' : ''}) shape=${score.shape} kinds=[${score.kinds.join(', ')}]`
      : `valid=${score.valid}${score.empty ? ' empty' : ''}${score.truncated ? ' truncated' : ''}${score.noise ? ' noise' : ''}`;
    console.log(`${entry.id} ${outcome.lang} ${verdict}`);
  }
  return { records, incomplete };
}

async function runRole(page, { role, profile, effort = null, arm, filter, record, expectCount, holdout, digestPad = null }: { role: string; profile: string | null; effort?: EffortArm | null; arm: string; filter: string; record: boolean; expectCount: number | null; holdout: boolean; digestPad?: string | null }) {
  if (!ROLES.includes(role)) throw new Error(`--role must be one of ${ROLES.join(', ')}`);
  if (digestPad && role !== 'curator') throw new Error('--digest-pad is a curator calibration option');
  const loaded = await loadCases(role);
  const cases = loaded.cases.filter((entry) => !filter || entry.id.includes(filter));
  const manifest = JSON.parse(await readFile(join(PROJECT_ROOT, 'dist/manifest.json'), 'utf-8'));
  const route = await setRoute(page, role, profile);
  const pinned = effort ? await pinRoleEffort(page, role, effort) : null;
  let reasoning = null;
  let effortsRestored = null;
  const holdoutCases = holdout ? (await loadHoldout(role))?.cases ?? null : null;
  if (holdout && !holdoutCases) throw new Error(`--holdout: the ${role} role has no hold-out fixture`);
  let run = { records: [], incomplete: [] };
  let held = { records: [], incomplete: [] };
  let restored = null;
  try {
    await evaluateInST(page, () => { for (const key of Object.keys(globalThis).filter((name) => name.startsWith('storyOrchestratorDebug'))) delete globalThis[key]; return true; });
    run = await runCases(page, role, cases, digestPad);
    if (holdoutCases) held = await runCases(page, role, holdoutCases);
    reasoning = await readRoleReasoning(page, role);
  } finally {
    restored = await restoreRoute(page, route.before);
    if (pinned) effortsRestored = await restoreRoleEfforts(page, pinned.before);
  }
  const { records, incomplete } = run;
  const holdoutSummary = holdoutCases ? summarizeHoldout(held.records) : null;
  if (holdoutSummary) console.log(`hold-out: validity ${holdoutSummary.validity.passed}/${holdoutSummary.validity.total}, opShape ${holdoutSummary.opShape.passed}/${holdoutSummary.opShape.total}${holdoutSummary.misses.length ? `, misses ${holdoutSummary.misses.join(', ')}` : ''}`);
  const summary = await evaluateInST(page, ({ role, records, floorIds }) => globalThis.storyOrchestratorLiveSuite.summarizeRoleCalibration(role, records, floorIds ? { floorIds } : {}), { role, records: records.map(({ case: _case, ...rest }) => rest), floorIds: loaded.floorIds });
  const reasons = [
    ...(incomplete.length ? [`incomplete: ${incomplete.map((entry) => entry.id).join(', ')}`] : []),
    ...(held.incomplete.length ? [`hold-out incomplete: ${held.incomplete.map((entry) => entry.id).join(', ')}`] : []),
    ...(expectCount !== null && records.length + incomplete.length !== expectCount ? [`ran ${records.length + incomplete.length} case(s), expected ${expectCount}`] : []),
  ];
  const armLabel = arm || effortArmLabel(digestPad ? 'digest' : profile ? 'routed' : 'shared', effort);
  const digestRatios = digestPad ? records.map((entry) => entry.digest?.ratio).filter((value) => typeof value === 'number') : [];
  const report = {
    role,
    arm: armLabel,
    profile: route.profile,
    routeDuringRun: route.route,
    effort: effort ?? 'unpinned',
    reasoning,
    effortsRestored,
    roleMapRestored: restored,
    fixtureFrozenAt: loaded.frozenAt,
    bundle: String(manifest.bundle?.sha256 ?? '').slice(0, 12),
    runAt: new Date().toISOString(),
    cases: records.length,
    summary,
    incomplete,
    notGreen: reasons,
    records,
    ...(digestPad ? { digestPad, digestRatio: { max: Math.max(...digestRatios), mean: digestRatios.reduce((sum, value) => sum + value, 0) / (digestRatios.length || 1) } } : {}),
    ...(holdoutSummary ? { holdout: holdoutSummary, holdoutRecords: held.records, holdoutIncomplete: held.incomplete } : {}),
  };
  await writeJSON(report, `so-role-calibration-${role}-${armLabel}`);
  if (record && !incomplete.length && !held.incomplete.length) {
    await mkdir(GOLDEN_DIR, { recursive: true });
    await writeFile(join(GOLDEN_DIR, `${role}-${armLabel}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`recorded test/goldens/live/role-calibration/${role}-${armLabel}.json`);
  }
  for (const reason of reasons) console.log(`NOT GREEN: ${reason}`);
  console.log(JSON.stringify({ role, arm: armLabel, profile: route.profile, cases: records.length, summary, restored }, null, 2));
  return { ok: reasons.length === 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'verdict' && !hasHelpFlag()) {
    const reports = await Promise.all(process.argv.slice(3).map(async (path) => JSON.parse(await readFile(path, 'utf-8'))));
    const verdict = verdictFromReports(reports);
    console.log(JSON.stringify({ role: reports[0]?.role ?? null, bundle: reports[0]?.bundle ?? null, holdout: reports.map((report) => report.holdout ?? null), ...verdict }, null, 2));
    process.exit(verdict.verdict === 'recommended' ? 0 : 1);
  }
  if (process.argv[2] !== 'run' || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const expectRaw = argValue('--expect-count', '');
  runCli((page) => runRole(page, {
    role: argValue('--role', ''),
    profile: argValue('--profile', '') || null,
    effort: parseEffortArm(argValue('--effort', '')),
    arm: argValue('--arm', ''),
    filter: argValue('--filter', ''),
    record: process.argv.includes('--record'),
    expectCount: expectRaw ? Number(expectRaw) : null,
    holdout: process.argv.includes('--holdout'),
    digestPad: argValue('--digest-pad', '') || null,
  }));
}
