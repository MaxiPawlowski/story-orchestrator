// v2.6 plan 13 R3/R5: the rules that turn an inventory row into one call, and the suite list into a budget.

const nameOf = (path) => path.split('/').pop().replace(/\.json$/, '');
const matches = (list, name) => (list ?? []).find((entry) => new RegExp(entry.pattern).test(name));
const inMerge = (config, path) => (config.mergeCandidates ?? []).find((entry) => entry.paths.includes(path));

/** One call for one asset. `kind` is jest | storybook | harness | scenario | journey | live. */
export function decideAsset(kind, row, config = {}) {
  if (kind === 'jest') {
    if (row.vacuous) return { decision: 'fix', reason: 'test blocks with no assertion' };
    if (row.replay?.length) return { decision: 'keep', reason: `defect-replay killer: ${row.replay.join(', ')}` };
    if (row.guard === 'nothing named') return { decision: 'keep', reason: `unnamed: names no invariant, defect or contract${row.fixes ? ` (touched by ${row.fixes} fix commit(s))` : ''}; name it on next touch (budget rule 1)` };
    return { decision: 'keep', reason: `guards a named ${row.guard}` };
  }
  if (kind === 'storybook') return row.plays ? { decision: 'keep', reason: `UI contract: ${row.plays} interaction plays + a11y` } : { decision: 'fix', reason: 'no play function: renders only' };
  if (kind === 'harness') return row.vacuous ? { decision: 'fix', reason: 'no assertion' } : { decision: 'keep', reason: `harness guard (${row.guard})` };
  if (kind === 'scenario') {
    const name = nameOf(row.path);
    const measurement = matches(config.measurement, name);
    if (measurement && row.shape?.needsLlm) return { decision: 'demote', reason: measurement.reason };
    const merge = inMerge(config, row.path);
    if (merge) return { decision: 'merge', reason: merge.reason };
    if (row.shape?.vacuous) return { decision: 'fix', reason: 'no assertion step' };
    if (!row.shape?.needsLlm) return { decision: 'keep', reason: `deterministic tier, no backend (${row.guard})` };
    if (row.guard === 'nothing named') return { decision: 'demote', reason: 'LLM tier naming no invariant, defect or contract: nothing states why no cheaper tier sees it (R3 rule 3); out of the final suite until it names its guard, file kept' };
    return { decision: 'keep', reason: `LLM tier: real generation or an unmocked pass is the behaviour (${row.guard}${row.oneShot ? ', one-shot plan fixture' : ''})` };
  }
  if (kind === 'journey') {
    if (row.mode === 'human') return { decision: 'keep', reason: 'human rubric row, scored in plan 10 sessions' };
    if (row.shape?.vacuous) return { decision: 'fix', reason: 'no assertion step' };
    return { decision: 'keep', reason: `${row.shape?.needsLlm ? 'LLM' : 'no-LLM'} journey check${row.findings?.length ? ` (${row.findings.join(', ')})` : ', no finding id'}` };
  }
  if (kind === 'live') {
    if (row.vacuous?.length) return { decision: 'fix', reason: `vacuous needle: ${row.vacuous.join(', ')}` };
    return { decision: 'keep', reason: `live-suite fixture (${row.tiers.join(', ')}); its golden replays in jest` };
  }
  return { decision: 'keep', reason: '' };
}

/** A journey's lane minutes: the measured median when records hold one, else the step estimate, plus overhead. */
export function journeyMinutes(entry, config = {}) {
  const measured = config.journeyMinutes?.[entry.id];
  const overhead = config.overheadMinutes ?? 0;
  if (typeof measured === 'number') return { minutes: Math.round(measured + overhead), source: `measured median ${measured} min + ${overhead}` };
  return { minutes: Math.round(entry.estSeconds / 60 + overhead), source: `estimate + ${overhead}` };
}

/** Sums the LLM sections into lane-hours and compares ×2 with two nights of lanes. */
export function suiteBudget(sections, config = {}, demoted = []) {
  const capped = (row) => (typeof row.capMinutes === 'number' ? row.capMinutes : row.minutes ?? 0);
  const summed = sections.map((section) => ({ name: section.name, llm: section.llm, minutes: section.rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0), capped: section.rows.reduce((sum, row) => sum + capped(row), 0) }));
  const hours = (key) => summed.filter((section) => section.llm).reduce((sum, section) => sum + section[key], 0) / 60;
  const llmHours = hours('minutes');
  const cappedHours = hours('capped');
  const capacityHours = 2 * (config.nightHours ?? 10) * (config.lanes ?? 2);
  return { sections: summed, llmHours, cappedHours, capacityHours, fits: llmHours * 2 <= capacityHours, fitsCapped: cappedHours * 2 <= capacityHours, gapHours: Math.max(0, cappedHours * 2 - capacityHours), demotedCount: demoted.length, demotedMinutes: demoted.reduce((sum, row) => sum + (row.est ?? 0), 0) / 60 };
}

const HEADER_PAIR = 'run header before + `so-run-header.mts diff` after';

export const GENERATED = {
  journey: (id) => ({
    command: `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group <id> ${id}`,
    when: 'always',
    config: 'the journey file\'s own setup; scan mode where plan 10 says so',
    artifacts: [`journey record per run under test/journeys/records/v2.6-acceptance/${id}/`, 'engine-history-<journeyId>.json covering every owned chat (H-k)', HEADER_PAIR],
    tier: 'T7',
  }),
  scenario: (asset) => ({
    command: asset.startsWith('test/')
      ? `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group <id> ${asset}`
      : `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group <id> <${asset}>`,
    when: 'always',
    config: 'the scenario file\'s own steps, --sandbox',
    artifacts: ['st-lanes batch summary', 'scenario log per run', HEADER_PAIR],
    tier: 'T7',
  }),
};

export const TOY_GROUP = '1759606632088';

const describeRequires = (requires = {}) => [
  requires.group ? `group ${requires.group}` : null,
  requires.members?.length ? `members ${requires.members.join(', ')}` : null,
  requires.authorView ? 'Author view' : null,
  requires.judge === 'off' ? 'judge off' : null,
  requires.mainApi ? `main API ${requires.mainApi}` : null,
  requires.roleProfiles ? `every role on ${requires.roleProfiles}` : null,
  typeof requires.macroEngine === 'boolean' ? `macro engine ${requires.macroEngine ? 'on' : 'off'}` : null,
  typeof requires.vectorsWorldInfo === 'boolean' ? `Vectors World Info ${requires.vectorsWorldInfo ? 'on' : 'off'}` : null,
].filter(Boolean).join('; ');

export function noLlmSuiteRows(scenarios, { group = TOY_GROUP } = {}) {
  const runnable = scenarios.filter((row) => !row.requires?.prior);
  const noModel = runnable.filter((row) => row.requires?.lane === 'no-model');
  const live = runnable.filter((row) => row.requires?.lane !== 'no-model');
  const minutes = (list) => Math.round(list.reduce((sum, row) => sum + (row.est ?? 0), 0) / 60);
  const batch = (list) => `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group ${group} ${list.map((row) => row.asset).join(' ')}`;
  const rows = [];
  if (noModel.length) rows.push({
    id: `no-model lane (${noModel.length})`,
    what: 'kept no-LLM scenarios with requires.lane no-model: the pass must fail or no extraction may run',
    command: `node scripts/debug/st-lanes.mts stop <n>; node scripts/debug/st-lanes.mts no-model <n>; node scripts/debug/st-lanes.mts start <n>; ${batch(noModel)}; node scripts/debug/st-lanes.mts stop <n>; node scripts/debug/st-lanes.mts restore-model <n>`,
    when: 'always',
    config: `a lane with no model (api keys removed, judge off); each scenario's own requires (group, members, Author view) is established by so-scenario, its --group ${group} only where the file names none`,
    artifacts: ['st-lanes batch summary', 'scenario log per run', 'run header before + `so-run-header.mts diff` after'],
    tier: 'T7',
    minutes: minutes(noModel),
  });
  if (live.length) rows.push({
    id: `live lane (${live.length})`,
    what: 'every other kept no-LLM scenario; those with requires.lane model need the model to answer',
    command: batch(live),
    when: 'always',
    config: `a lane with the live model; each scenario's own requires is established by so-scenario (group by name, members re-enabled, Author view, judge off) or refused as not-runnable (main API, role profiles, macro engine, Vectors World Info); --group ${group} only where the file names none`,
    artifacts: ['st-lanes batch summary', 'scenario log per run', 'run header before + `so-run-header.mts diff` after'],
    tier: 'T7',
    minutes: minutes(live),
  });
  return {
    rows,
    excluded: scenarios.filter((row) => row.requires?.prior).map((row) => ({ asset: row.asset, prior: row.requires.prior })),
    preconditions: scenarios.filter((row) => row.requires && Object.keys(row.requires).length).map((row) => ({ asset: row.asset, lane: row.requires.lane ?? 'any', needs: describeRequires(row.requires), why: row.requires.why ?? row.requires.prior ?? '' })),
  };
}

const REPO_PATH = /(?:^|[\s(])((?:scripts|test|src|docs)\/[^\s;,()`'"]+\.(?:mts|mjs|ts|json|md))/g;

export function suiteRowProblems(row, exists = () => true) {
  const problems = [];
  const text = `${row.what ?? ''} ${row.note ?? ''}`;
  if (/placeholder/i.test(text)) problems.push(`${row.id}: still marked as a placeholder`);
  if (typeof row.command !== 'string' || !/(?:^|\s)(?:node|npx|npm)\s/.test(row.command)) problems.push(`${row.id}: no runnable command (node/npx/npm)`);
  if (!/^T[0-7]$/.test(String(row.tier ?? ''))) problems.push(`${row.id}: tier must be one of T0..T7, got ${JSON.stringify(row.tier)}`);
  if (!Array.isArray(row.artifacts) || !row.artifacts.length || row.artifacts.some((item) => typeof item !== 'string' || !item.trim())) problems.push(`${row.id}: no artifact requirement`);
  if (typeof row.when !== 'string' || !row.when.trim()) problems.push(`${row.id}: no run condition (when)`);
  for (const [, path] of String(row.command ?? '').matchAll(REPO_PATH)) {
    if (path.includes('<') || path.includes('*')) continue;
    if (!exists(path)) problems.push(`${row.id}: ${path} does not exist`);
  }
  return problems;
}
