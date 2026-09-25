import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';

const USAGE = `Usage: node scripts/debug/so-role-calibration.mts run --role director|curator|authoring|synthesis [--profile <name|id>] [--arm <label>] [--filter <id>] [--record] [--expect-count <n>]

v2.4 plan 08 T18 per-role calibration. Runs every case of the role's fixture through the role's real
prompt/parse path on the real model (globalThis.storyOrchestratorLiveSuite.runRoleCase, src/runtime/roleCalibration.ts),
then scores it against the floors predeclared in docs/plans/v2.4/08-author-observability.md
(§"Per-role calibration floors"). A floor is never retuned.

  --profile <name|id>  route the role to this Connection Manager profile for the run (extraction.profiles[role]);
                       without it the role is UNSET for the run (the memory-model fallback). The role map is
                       restored afterwards and read back.
  --arm <label>        golden file suffix (default: routed when --profile is given, else shared)
  --record             write test/goldens/live/role-calibration/<role>-<arm>.json (replayed in jest)
  --expect-count <n>   fail unless exactly n cases ran

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

async function runRole(page, { role, profile, arm, filter, record, expectCount }) {
  if (!ROLES.includes(role)) throw new Error(`--role must be one of ${ROLES.join(', ')}`);
  const loaded = await loadCases(role);
  const cases = loaded.cases.filter((entry) => !filter || entry.id.includes(filter));
  const manifest = JSON.parse(await readFile(join(PROJECT_ROOT, 'dist/manifest.json'), 'utf-8'));
  const route = await setRoute(page, role, profile);
  const records = [];
  const incomplete = [];
  let restored = null;
  try {
    await evaluateInST(page, () => { for (const key of Object.keys(globalThis).filter((name) => name.startsWith('storyOrchestratorDebug'))) delete globalThis[key]; return true; });
    for (const entry of cases) {
      let outcome = null;
      let lastError = null;
      for (let attempt = 0; attempt < 3 && !outcome; attempt += 1) {
        try {
          outcome = await evaluateInST(page, async ({ role, entry }) => {
            const suite = globalThis.storyOrchestratorLiveSuite;
            if (!suite?.runRoleCase) throw new Error('storyOrchestratorLiveSuite.runRoleCase not registered (rebuild + st-session reload)');
            return suite.runRoleCase(role, entry);
          }, { role, entry });
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
  } finally {
    restored = await restoreRoute(page, route.before);
  }
  const summary = await evaluateInST(page, ({ role, records, floorIds }) => globalThis.storyOrchestratorLiveSuite.summarizeRoleCalibration(role, records, floorIds ? { floorIds } : {}), { role, records: records.map(({ case: _case, ...rest }) => rest), floorIds: loaded.floorIds });
  const reasons = [
    ...(incomplete.length ? [`incomplete: ${incomplete.map((entry) => entry.id).join(', ')}`] : []),
    ...(expectCount !== null && records.length + incomplete.length !== expectCount ? [`ran ${records.length + incomplete.length} case(s), expected ${expectCount}`] : []),
  ];
  const armLabel = arm || (profile ? 'routed' : 'shared');
  const report = {
    role,
    arm: armLabel,
    profile: route.profile,
    routeDuringRun: route.route,
    roleMapRestored: restored,
    fixtureFrozenAt: loaded.frozenAt,
    bundle: String(manifest.bundle?.sha256 ?? '').slice(0, 12),
    runAt: new Date().toISOString(),
    cases: records.length,
    summary,
    incomplete,
    notGreen: reasons,
    records,
  };
  await writeJSON(report, `so-role-calibration-${role}-${armLabel}`);
  if (record && !incomplete.length) {
    await mkdir(GOLDEN_DIR, { recursive: true });
    await writeFile(join(GOLDEN_DIR, `${role}-${armLabel}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`recorded test/goldens/live/role-calibration/${role}-${armLabel}.json`);
  }
  for (const reason of reasons) console.log(`NOT GREEN: ${reason}`);
  console.log(JSON.stringify({ role, arm: armLabel, profile: route.profile, cases: records.length, summary, restored }, null, 2));
  return { ok: reasons.length === 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'run' || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const expectRaw = argValue('--expect-count', '');
  runCli((page) => runRole(page, {
    role: argValue('--role', ''),
    profile: argValue('--profile', '') || null,
    arm: argValue('--arm', ''),
    filter: argValue('--filter', ''),
    record: process.argv.includes('--record'),
    expectCount: expectRaw ? Number(expectRaw) : null,
  }));
}
