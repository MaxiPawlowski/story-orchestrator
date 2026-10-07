import { COMPLICATION_FAMILY, restateCheck } from './overSteer.mts';

export type Sp6Arm = 'release' | 'control';
export type Sp6Judge = 'on' | 'off';

export type Sp6Release = { boundary: number; id: string; block: string; reply: string | null; after: string[]; reached: boolean | null };

export type Sp6Run = { at?: string; chatId?: string; arm: Sp6Arm; judge: Sp6Judge; replies: number; agencyFlags: number; releases: Sp6Release[]; carried: number };

export const SP6_BARS = { runsPerCell: 2, minReleases: 20, k3Slack: 1, k4MaxRestates: 0, k5Release: 0.6, k5Control: 0.3, k5MinPooled: 20 } as const;

export type Sp6Verdict = 'PASS' | 'FAIL' | 'INCOMPLETE';

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN);

const reachRate = (run: Sp6Run) => {
  const measured = run.releases.filter((release) => release.reached !== null);
  return { measured: measured.length, reached: measured.filter((release) => release.reached).length, rate: measured.length ? measured.filter((release) => release.reached).length / measured.length : Number.NaN };
};

export function readSp6Runs(value: unknown): Sp6Run[] {
  if (!Array.isArray(value)) throw new Error('so-sp6-score: expected the JSON array stored in localStorage "so-sp6-records"');
  return value.map((entry, index) => {
    const run = entry as Sp6Run;
    if (!run || (run.arm !== 'release' && run.arm !== 'control') || (run.judge !== 'on' && run.judge !== 'off') || !Array.isArray(run.releases)) {
      throw new Error(`so-sp6-score: record ${index} is not an SP6 run (arm, judge, releases)`);
    }
    return run;
  });
}

export function scoreSp6(runs: Sp6Run[]) {
  const cell = (arm: Sp6Arm, judge: Sp6Judge) => runs.filter((run) => run.arm === arm && run.judge === judge);
  const cells = { releaseOn: cell('release', 'on'), controlOn: cell('control', 'on'), releaseOff: cell('release', 'off'), controlOff: cell('control', 'off') };
  const short = Object.entries(cells).filter(([, list]) => list.length < SP6_BARS.runsPerCell).map(([name, list]) => `${name}: ${list.length} of ${SP6_BARS.runsPerCell} runs`);
  const small = runs.filter((run) => run.releases.length < SP6_BARS.minReleases).map((run) => `${run.arm}/${run.judge} ${run.at ?? ''}: ${run.releases.length} releases`);

  const controlMean = mean(cells.controlOn.map((run) => run.agencyFlags));
  const k3Rows = cells.releaseOn.map((run) => ({ at: run.at ?? null, flags: run.agencyFlags, bar: controlMean + SP6_BARS.k3Slack, ok: run.agencyFlags <= controlMean + SP6_BARS.k3Slack }));
  const k3 = {
    verdict: (cells.releaseOn.length < SP6_BARS.runsPerCell || cells.controlOn.length < SP6_BARS.runsPerCell ? 'INCOMPLETE' : k3Rows.every((row) => row.ok) ? 'PASS' : 'FAIL') as Sp6Verdict,
    controlMean,
    rows: k3Rows,
    judgeOffColumn: [...cells.releaseOff, ...cells.controlOff].map((run) => ({ arm: run.arm, flags: run.agencyFlags })),
  };

  const releaseRuns = [...cells.releaseOn, ...cells.releaseOff];
  const k4Rows = releaseRuns.flatMap((run) => run.releases.map((release) => ({
    at: run.at ?? null,
    boundary: release.boundary,
    id: release.id,
    check: release.reply ? restateCheck(release.block, release.reply, COMPLICATION_FAMILY) : null,
  })));
  const restated = k4Rows.filter((row) => row.check && !row.check.ok);
  const k4 = {
    verdict: (releaseRuns.length < 2 * SP6_BARS.runsPerCell ? 'INCOMPLETE' : restated.length <= SP6_BARS.k4MaxRestates ? 'PASS' : 'FAIL') as Sp6Verdict,
    measured: k4Rows.filter((row) => row.check).length,
    unmeasured: k4Rows.filter((row) => !row.check).length,
    restated: restated.map((row) => ({ at: row.at, boundary: row.boundary, id: row.id, span: row.check?.span, metaHits: row.check?.metaHits })),
  };

  const k5Release = cells.releaseOff.map((run) => ({ at: run.at ?? null, ...reachRate(run) }));
  const k5Control = cells.controlOff.map((run) => ({ at: run.at ?? null, ...reachRate(run) }));
  const pooled = (rows: Array<{ measured: number; reached: number }>) => {
    const measured = rows.reduce((sum, row) => sum + row.measured, 0);
    const reached = rows.reduce((sum, row) => sum + row.reached, 0);
    return { measured, reached, rate: measured ? reached / measured : Number.NaN };
  };
  const pooledRelease = pooled(k5Release);
  const pooledControl = pooled(k5Control);
  const k5 = {
    verdict: (cells.releaseOff.length < SP6_BARS.runsPerCell || cells.controlOff.length < SP6_BARS.runsPerCell
      || pooledRelease.measured < SP6_BARS.k5MinPooled || pooledControl.measured < SP6_BARS.k5MinPooled ? 'INCOMPLETE'
      : pooledRelease.rate >= SP6_BARS.k5Release && pooledControl.rate <= SP6_BARS.k5Control ? 'PASS' : 'FAIL') as Sp6Verdict,
    rule: 'pooled over the runs of each arm (v2.7 35 decision 3); per-run rows are reported, not gated',
    pooled: { release: pooledRelease, control: pooledControl },
    release: k5Release,
    control: k5Control,
  };

  const verdicts = [k3.verdict, k4.verdict, k5.verdict];
  const overall: Sp6Verdict = short.length || small.length ? 'INCOMPLETE' : verdicts.includes('FAIL') ? 'FAIL' : verdicts.includes('INCOMPLETE') ? 'INCOMPLETE' : 'PASS';
  return { overall, short, small, k3, k4, k5 };
}
