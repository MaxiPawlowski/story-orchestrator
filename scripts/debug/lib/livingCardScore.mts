export interface CardReplyRating { mentions: boolean; agrees: boolean }
export const S32_ARMS = ['none', 'depth1', 'depth4'] as const;
export const S32_FLOORS = { replies: 30, mentions: 15, agreement: 0.9, rounds: 2 } as const;

export function scoreCardArm(rows: CardReplyRating[]) {
  if (rows.length !== S32_FLOORS.replies || rows.some((row) => typeof row.mentions !== 'boolean' || typeof row.agrees !== 'boolean')) {
    throw new Error('S32-1 needs every one of its 30 replies rated; an incomplete arm cannot be scored.');
  }
  const mentioned = rows.filter((row) => row.mentions);
  const agreeing = mentioned.filter((row) => row.agrees).length;
  return { replies: rows.length, mentioned: mentioned.length, excluded: rows.length - mentioned.length, agreeing,
    agreement: mentioned.length ? agreeing / mentioned.length : 0,
    floor: mentioned.length >= S32_FLOORS.mentions && agreeing / mentioned.length >= S32_FLOORS.agreement };
}

export function decideCardOverlay(reports: Array<{ kind: string; round: number; build: string; cleanup: { clean: boolean }; arms: Record<string, { ratings: CardReplyRating[] }> }>) {
  if (reports.length !== S32_FLOORS.rounds || new Set(reports.map((report) => report.round)).size !== 2
    || reports.some((report) => ![1, 2].includes(report.round) || report.kind !== 's32-1' || S32_ARMS.some((arm) => !report.arms[arm]))) {
    throw new Error('S32-1 needs two distinct complete three-arm runs.');
  }
  if (reports.some((report) => report.cleanup?.clean !== true) || !reports[0].build || reports[0].build !== reports[1].build) {
    throw new Error('S32-1 needs clean runs on the same served candidate.');
  }
  const rounds = reports.map((report) => ({ round: report.round,
    arms: Object.fromEntries(S32_ARMS.map((arm) => [arm, scoreCardArm(report.arms[arm].ratings)])) }));
  if (rounds.some((round) => round.arms.none.mentioned < S32_FLOORS.mentions)) throw new Error('The baseline has too few mentioning replies to compare.');
  const winners = ['depth1', 'depth4'].filter((arm) => rounds.every((round) => round.arms[arm].floor && round.arms[arm].agreement > round.arms.none.agreement));
  winners.sort((left, right) => rounds.reduce((sum, round) => sum + round.arms[right].agreement - round.arms[left].agreement, 0));
  return { kind: 's32-1-decision', floors: S32_FLOORS, rounds, verdict: winners.length ? 'enable' : 'keep-off',
    depth: winners[0] === 'depth4' ? 4 : winners.length ? 1 : null,
    reason: winners.length ? 'The selected depth passed twice and beat the baseline twice.' : 'No overlay depth passed twice and beat the baseline twice.' };
}
