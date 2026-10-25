import type { StopDeclaration, StopItem, StopRecord } from './stopRule.mts';

export function liveSuiteDeclaration(fixtures: Array<{ expected?: { intents?: unknown } }>, { min, floors, record = false, arm = null as string | null }: { min: number; floors: Partial<Record<string, number>>; record?: boolean; arm?: string | null }): StopDeclaration {
  const tierFloors = Object.entries(floors)
    .filter(([tier, floor]) => tier !== 'intents' && typeof floor === 'number' && floor > 0)
    .map(([tier, floor]) => ({ id: tier, rate: floor as number, direction: 'atLeast' as const }));
  const intents = fixtures.some((fixture) => fixture.expected?.intents !== undefined && (floors.intents ?? 1) > 0);
  return { N: fixtures.length, floors: [{ id: 'plot', rate: min, direction: 'atLeast' }, ...tierFloors], needsAll: record || Boolean(arm) || intents };
}

export const liveSuiteItem = (pass: boolean, tiers: Array<{ tier: string; pass: boolean }>): StopItem => ({
  metrics: { plot: pass, ...Object.fromEntries(tiers.filter((row) => row.tier !== 'deltas').map((row) => [row.tier, row.pass])) },
});

export function stoppedVerdict(stopped: StopRecord | null, verdict: { ok: boolean; reasons: string[] }): { ok: boolean; reasons: string[] } {
  if (!stopped) return verdict;
  if (stopped.verdict === 'pass') return { ok: true, reasons: [] };
  const line = `stopped ${stopped.stopped} at ${stopped.at}: ${stopped.reason}${stopped.verdict === 'not-a-measurement' ? ' (not a measurement)' : ''}`;
  return { ok: false, reasons: [line, ...verdict.reasons.filter((reason) => !reason.startsWith('incomplete fixture'))] };
}
