// v2.8 35 G1/G2: before the live-suite matcher moves from word start to whole term, every needle is
// inventoried against the recorded live answer it was last scored on, and every recorded golden is
// re-scored under both scorer versions. Pure: the caller hands in the parsed live tiers.

import { termPresent, type TermMode } from '../../../src/utils/termPresent.ts';
import { joined, matchV1, matchV2, scoreContains, scoreIntents, scoreRejected, SCORER_VERSION, type ContainsSpec, type IntentsSpec, type LiveEpistemicRow, type NeedleMatch, type TierName, type TierOutcome } from './liveSuiteScore.mts';

export type NeedleClass = 'term' | 'prefix' | 'substring-only' | 'absent' | 'unrecorded';
export type NeedleKind = 'mustContain' | 'mustNotContain' | 'reason' | 'anyOf';

export interface NeedleRow {
  fixture: string;
  tier: TierName;
  kind: NeedleKind;
  needle: string;
  subject?: string;
  class: NeedleClass;
  mode: TermMode;
  declared: TermMode | null;
}

export interface LiveTiers {
  facts: unknown[];
  factLines?: unknown[];
  rejected: Array<{ reason?: string }>;
  memory: unknown[];
  arcs: unknown[];
  epistemic: LiveEpistemicRow[];
  ledger: unknown[];
}

export interface RecordedFixture {
  name: string;
  expected: Record<string, unknown>;
  players: string[];
  live: LiveTiers | null;
}

const CONTAINS_TIERS = ['facts', 'memory', 'arcs', 'epistemic', 'ledger'] as const;

const classify = (haystacks: string[] | null, needle: string, scope: 'contains' | 'rejected' | 'intents'): NeedleClass => {
  if (haystacks === null) return 'unrecorded';
  if (!haystacks.some((haystack) => matchV1(haystack, needle, 'prefix', scope))) return 'absent';
  if (haystacks.some((haystack) => termPresent(haystack, needle, 'term'))) return 'term';
  return haystacks.some((haystack) => termPresent(haystack, needle, 'prefix')) ? 'prefix' : 'substring-only';
};

const recommended = (kind: NeedleClass): TermMode => (kind === 'prefix' ? 'prefix' : 'term');

const declaredMode = (modes: Record<string, TermMode> | undefined, needle: string): TermMode | null => modes?.[needle] ?? null;

export function inventoryFixture(fixture: RecordedFixture): NeedleRow[] {
  const rows: NeedleRow[] = [];
  const { expected, live, name } = fixture;
  for (const tier of CONTAINS_TIERS) {
    const spec = expected[tier] as ContainsSpec | undefined;
    if (!spec || typeof spec.none === 'string' || spec.scope === 'golden') continue;
    const haystack = live ? [joined(live[tier] ?? [])] : null;
    for (const kind of ['mustContain', 'mustNotContain'] as const) {
      for (const needle of spec[kind] ?? []) {
        if (!needle.trim()) continue;
        const found = classify(haystack, needle, 'contains');
        rows.push({ fixture: name, tier, kind, needle, class: found, mode: recommended(found), declared: declaredMode(spec.modes, needle) });
      }
    }
  }
  const rejected = (expected.rejected as Array<{ reason?: string; scope?: string; mode?: TermMode }> | undefined) ?? [];
  const reasons = live ? live.rejected.map((entry) => String(entry.reason ?? '').toLowerCase()) : null;
  for (const entry of rejected.filter((row) => row.scope !== 'golden' && String(row.reason ?? '').trim())) {
    const needle = String(entry.reason).toLowerCase();
    const found = reasons === null ? 'unrecorded' : reasons.length ? classify(reasons, needle, 'rejected') : 'absent';
    rows.push({ fixture: name, tier: 'rejected', kind: 'reason', needle, class: found, mode: recommended(found), declared: entry.mode ?? null });
  }
  const intents = expected.intents as IntentsSpec | undefined;
  if (intents && typeof intents.none !== 'string' && intents.scope !== 'golden') {
    for (const claim of intents.expect ?? []) {
      const subject = String(claim.subject ?? '').trim().toLowerCase();
      const contents = live ? live.epistemic.filter((row) => String(row.tag ?? '').toLowerCase() === 'intends' && String(row.subject ?? '').trim().toLowerCase() === subject).map((row) => String(row.content ?? '').toLowerCase()) : null;
      for (const needle of claim.anyOf ?? []) {
        if (!needle.trim()) continue;
        const found = contents === null ? 'unrecorded' : contents.length ? classify(contents, needle.toLowerCase(), 'intents') : 'absent';
        rows.push({ fixture: name, tier: 'intents', kind: 'anyOf', needle, subject: claim.subject, class: found, mode: recommended(found), declared: declaredMode(claim.modes, needle) });
      }
    }
  }
  return rows;
}

export interface InventorySummary {
  fixtures: number;
  recorded: number;
  needles: number;
  byClass: Record<NeedleClass, number>;
  prefixDependent: NeedleRow[];
  substringOnly: NeedleRow[];
  undeclaredPrefix: NeedleRow[];
}

export function summarizeInventory(fixtures: RecordedFixture[], rows: NeedleRow[]): InventorySummary {
  const byClass: Record<NeedleClass, number> = { term: 0, prefix: 0, 'substring-only': 0, absent: 0, unrecorded: 0 };
  for (const row of rows) byClass[row.class] += 1;
  const prefixDependent = rows.filter((row) => row.class === 'prefix');
  return {
    fixtures: fixtures.length,
    recorded: fixtures.filter((fixture) => fixture.live).length,
    needles: rows.length,
    byClass,
    prefixDependent,
    substringOnly: rows.filter((row) => row.class === 'substring-only'),
    undeclaredPrefix: prefixDependent.filter((row) => row.declared !== 'prefix'),
  };
}

export interface RescoreTier { tier: TierName; before: boolean; after: boolean; changed: boolean; beforeDetail: string; afterDetail: string }
export interface RescoreFixture { name: string; tiers: RescoreTier[]; changed: boolean }

interface ScorerSpec { match: NeedleMatch; facts: (live: LiveTiers) => unknown[] }

const factLinesOf = (live: LiveTiers): unknown[] => live.factLines ?? live.facts ?? [];

export const SCORERS: Readonly<Record<number, ScorerSpec>> = {
  1: { match: matchV1, facts: factLinesOf },
  2: { match: matchV2, facts: factLinesOf },
  3: { match: matchV2, facts: (live) => live.facts ?? [] },
};

const scorerOf = (version: number): ScorerSpec => {
  const spec = SCORERS[version];
  if (!spec) throw new Error(`unknown scorer version ${version} (known: ${Object.keys(SCORERS).join(', ')})`);
  return spec;
};

const scoreWith = (fixture: RecordedFixture, live: LiveTiers, version: number): TierOutcome[] => {
  const { match, facts } = scorerOf(version);
  const tiers: LiveTiers = { ...live, facts: facts(live) };
  return [
    ...CONTAINS_TIERS.map((tier) => scoreContains(tier, fixture.expected[tier] as ContainsSpec | undefined, tiers[tier] ?? [], match)),
    scoreRejected(fixture.expected.rejected as Array<{ reason?: string; scope?: string; mode?: TermMode }> | undefined, live.rejected ?? [], match),
    scoreIntents(fixture.expected.intents as IntentsSpec | undefined, live.epistemic ?? [], fixture.players, match),
  ].filter((row) => row.scored);
};

export function rescoreFixture(fixture: RecordedFixture, from = 1, to = SCORER_VERSION): RescoreFixture | null {
  if (!fixture.live) return null;
  const before = scoreWith(fixture, fixture.live, from);
  const after = scoreWith(fixture, fixture.live, to);
  const tiers = after.map((row) => {
    const old = before.find((entry) => entry.tier === row.tier);
    const was = old?.pass ?? false;
    return { tier: row.tier, before: was, after: row.pass, changed: was !== row.pass, beforeDetail: old?.detail ?? '', afterDetail: row.detail };
  });
  return { name: fixture.name, tiers, changed: tiers.some((row) => row.changed) };
}

export interface RescoreTotal { scored: number; before: number; after: number }

export interface RescoreRecord {
  kind: 'live-suite-rescore';
  scorerVersion: number;
  fromScorerVersion: number;
  source: string;
  recordedAt: string;
  totals: Partial<Record<TierName, RescoreTotal>>;
  fixtures: RescoreFixture[];
  changed: Array<{ fixture: string; tier: TierName; before: boolean; after: boolean }>;
  unrecorded: string[];
}

const rescoreTotals = (scored: RescoreFixture[]): Partial<Record<TierName, RescoreTotal>> => {
  const totals: Partial<Record<TierName, RescoreTotal>> = {};
  for (const row of scored.flatMap((fixture) => fixture.tiers)) {
    const total = (totals[row.tier] ??= { scored: 0, before: 0, after: 0 });
    total.scored += 1;
    total.before += row.before ? 1 : 0;
    total.after += row.after ? 1 : 0;
  }
  return totals;
};

export function rescoreRecord(fixtures: RecordedFixture[], source: string, recordedAt: string, from = 1, to = SCORER_VERSION): RescoreRecord {
  const scored = fixtures.map((fixture) => rescoreFixture(fixture, from, to)).filter((row): row is RescoreFixture => row !== null);
  return {
    kind: 'live-suite-rescore',
    scorerVersion: to,
    fromScorerVersion: from,
    source,
    recordedAt,
    totals: rescoreTotals(scored),
    fixtures: scored,
    changed: scored.flatMap((fixture) => fixture.tiers.filter((row) => row.changed).map((row) => ({ fixture: fixture.name, tier: row.tier, before: row.before, after: row.after }))),
    unrecorded: fixtures.filter((fixture) => !fixture.live).map((fixture) => fixture.name),
  };
}
