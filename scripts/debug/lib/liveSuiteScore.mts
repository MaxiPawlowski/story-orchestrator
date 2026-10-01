// v2.3 plan 01 §F — the live suite scores every tier the fixture states, with binding floors.
//
// T5 from the credibility audit: `so-live-suite` scored plot deltas and nothing else, then
// reported the number as "live delta accuracy 22/22 = 100%" — which was read, reasonably, as the
// memory model being right about everything. The fixtures already carried `facts` and `rejected`
// expectations that nothing looked at. Per-tier accuracy is reported separately and each tier
// carries its own floor, because one aggregate lets a strong tier carry a weak one.

export type TierName = 'deltas' | 'facts' | 'rejected' | 'memory' | 'arcs' | 'epistemic' | 'ledger' | 'intents';

export const TIERS: TierName[] = ['deltas', 'facts', 'rejected', 'memory', 'arcs', 'epistemic', 'ledger', 'intents'];

export interface IntentCounts { expected: number; matched: number; spurious: number; playerAttributed: number }

export interface TierOutcome {
  tier: TierName;
  /** False when the fixture states no expectation for this tier — it is not scored, not passed. */
  scored: boolean;
  pass: boolean;
  detail: string;
  /** An expectation that cannot fail, e.g. `mustContain: [""]`. Reported, never counted as a pass. */
  vacuous?: string[];
  counts?: IntentCounts;
}

const text = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(text).join(' ');
  return String(value ?? '');
};

const joined = (values: unknown[]): string => values.map(text).join(' — ').toLowerCase();

export interface ContainsSpec {
  minCount?: number;
  mustContain?: string[];
  mustNotContain?: string[];
  /** An explicit "this tier claims nothing here", with the reason. Never scored, never vacuous. */
  none?: string;
  /** `golden`: describes the hand-written golden only (jest); `live`: the model's answer only (this suite). */
  scope?: 'golden' | 'live';
}

/** Shared shape for the free-text tiers: a floor on how many lines, and words that must (not) appear. */
export function scoreContains(tier: TierName, spec: ContainsSpec | undefined, live: unknown[]): TierOutcome {
  if (!spec) return { tier, scored: false, pass: false, detail: 'the fixture states no expectation for this tier' };
  if (typeof spec.none === 'string') return { tier, scored: false, pass: false, detail: `the fixture declares no ${tier} expectation: ${spec.none || '(no reason given)'}` };
  if (spec.scope === 'golden') return { tier, scored: false, pass: false, detail: `the ${tier} expectation is golden-scoped: it describes the hand-written golden, which jest asserts` };
  const haystack = joined(live ?? []);
  const problems: string[] = [];
  const vacuous: string[] = [];

  if (typeof spec.minCount === 'number' && (live ?? []).length < spec.minCount) {
    problems.push(`expected at least ${spec.minCount} line(s), got ${(live ?? []).length}`);
  }
  for (const needle of spec.mustContain ?? []) {
    // `mustContain: [""]` matches everything, so it is an expectation that cannot fail. Several
    // shipped fixtures carry one; they are named rather than counted as evidence.
    if (!needle.trim()) { vacuous.push('mustContain: ""'); continue; }
    if (!haystack.includes(needle.toLowerCase())) problems.push(`missing "${needle}"`);
  }
  for (const needle of spec.mustNotContain ?? []) {
    if (!needle.trim()) { vacuous.push('mustNotContain: ""'); continue; }
    if (haystack.includes(needle.toLowerCase())) problems.push(`must not contain "${needle}"`);
  }
  const claims = (spec.minCount ?? 0) > 0 || [...(spec.mustContain ?? []), ...(spec.mustNotContain ?? [])].some((needle) => needle.trim());
  if (!claims) vacuous.push('no assertion');

  return {
    tier,
    scored: true,
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `${(live ?? []).length} line(s) matched the fixture`,
    ...(vacuous.length ? { vacuous } : {}),
  };
}

/** Rejections are scored by REASON: the audit has to say why a line was thrown away, not just that it was. */
export function scoreRejected(stated: Array<{ reason?: string; scope?: string }> | undefined, live: Array<{ reason?: string }> | undefined): TierOutcome {
  if (!stated) return { tier: 'rejected', scored: false, pass: false, detail: 'the fixture states no expectation for this tier' };
  const expected = stated.filter((entry) => entry.scope !== 'golden');
  if (stated.length && !expected.length) return { tier: 'rejected', scored: false, pass: false, detail: 'every expected rejection is golden-scoped: it describes the hand-written golden, which jest asserts' };
  const liveReasons = (live ?? []).map((entry) => String(entry.reason ?? '').toLowerCase());
  const wanted = expected.map((entry) => String(entry.reason ?? '').toLowerCase()).filter(Boolean);
  const missing = wanted.filter((reason) => !liveReasons.some((actual) => actual.includes(reason)));
  // An empty expectation means "nothing should have been rejected", which is a real claim.
  if (!wanted.length) {
    const pass = (live ?? []).length === 0;
    return { tier: 'rejected', scored: true, pass, detail: pass ? 'nothing was rejected, as expected' : `expected no rejections, got ${liveReasons.join(', ')}` };
  }
  return {
    tier: 'rejected',
    scored: true,
    pass: missing.length === 0,
    detail: missing.length ? `missing rejection reason(s): ${missing.join(', ')} (got: ${liveReasons.join(', ') || 'none'})` : `rejected for ${wanted.join(', ')}`,
  };
}

export interface IntentClaim { subject: string; anyOf: string[] }

export interface IntentsSpec {
  expect?: IntentClaim[];
  players?: string[];
  none?: string;
  scope?: 'golden' | 'live';
}

export interface LiveEpistemicRow { tag?: string; subject?: string; content?: string }

export const INTENTS_FLOORS = { precision: 0.8, recall: 0.5, playerAttributed: 0 } as const;

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

export function scoreIntents(spec: IntentsSpec | undefined, live: LiveEpistemicRow[] | undefined, players: string[] = []): TierOutcome {
  const tier = 'intents' as const;
  if (!spec) return { tier, scored: false, pass: false, detail: 'the fixture states no expectation for this tier' };
  if (typeof spec.none === 'string') return { tier, scored: false, pass: false, detail: `the fixture declares no intents expectation: ${spec.none || '(no reason given)'}` };
  if (spec.scope === 'golden') return { tier, scored: false, pass: false, detail: 'the intents expectation is golden-scoped: it describes the hand-written golden, which jest asserts' };
  const vacuous: string[] = [];
  if (!Array.isArray(spec.expect)) vacuous.push('no assertion');
  const claims = (Array.isArray(spec.expect) ? spec.expect : []).filter((claim) => {
    const needles = (claim?.anyOf ?? []).filter((needle) => typeof needle === 'string' && needle.trim());
    if (!norm(claim?.subject)) { vacuous.push('subject: ""'); return false; }
    if (needles.length !== (claim?.anyOf ?? []).length || !needles.length) { vacuous.push(`anyOf: "" (${claim.subject})`); return false; }
    return true;
  });
  const playerSet = new Set([...(spec.players ?? []), ...players].map(norm).filter(Boolean));
  const rows = (live ?? []).filter((row) => norm(row.tag) === 'intends');
  const open = claims.map((claim) => ({ subject: norm(claim.subject), anyOf: claim.anyOf.map(norm), label: claim.subject, taken: false }));
  const problems: string[] = [];
  let matched = 0;
  let spurious = 0;
  let playerAttributed = 0;
  for (const row of rows) {
    const subject = norm(row.subject);
    const content = norm(row.content);
    if (playerSet.has(subject)) {
      playerAttributed += 1;
      spurious += 1;
      problems.push(`player-attributed intent: ${row.subject} | ${row.content}`);
      continue;
    }
    const claim = open.find((entry) => !entry.taken && entry.subject === subject && entry.anyOf.some((needle) => content.includes(needle)));
    if (claim) { claim.taken = true; matched += 1; continue; }
    spurious += 1;
    problems.push(`unclaimed intent: ${row.subject} | ${row.content}`);
  }
  for (const claim of open.filter((entry) => !entry.taken)) problems.push(`missing intent for ${claim.label} (${claim.anyOf.join(' | ')})`);
  const counts: IntentCounts = { expected: open.length, matched, spurious, playerAttributed };
  return {
    tier,
    scored: true,
    pass: problems.length === 0 && vacuous.length === 0,
    detail: problems.length ? problems.join('; ') : `${matched} of ${open.length} intent(s) matched, nothing spurious`,
    counts,
    ...(vacuous.length ? { vacuous } : {}),
  };
}

export interface IntentsTotals { expected: number; matched: number; spurious: number; playerAttributed: number; precision: number | null; recall: number | null }

export function intentsTotals(outcomes: TierOutcome[]): IntentsTotals {
  const sum = (key: keyof IntentCounts) => outcomes.reduce((total, row) => total + (row.counts?.[key] ?? 0), 0);
  const expected = sum('expected');
  const matched = sum('matched');
  const spurious = sum('spurious');
  const ratio = (num: number, den: number) => (den ? Number((num / den).toFixed(4)) : null);
  return { expected, matched, spurious, playerAttributed: sum('playerAttributed'), precision: ratio(matched, matched + spurious), recall: ratio(matched, expected) };
}

export function intentsFailures(totals: IntentsTotals, precisionFloor: number = INTENTS_FLOORS.precision): string[] {
  const failures: string[] = [];
  if (totals.precision !== null && totals.precision < precisionFloor) failures.push(`intents precision ${totals.precision} is below its floor ${precisionFloor}`);
  if (totals.recall === null) failures.push('intents recall cannot be measured: no fixture claims a positive intent');
  else if (totals.recall < INTENTS_FLOORS.recall) failures.push(`intents recall ${totals.recall} is below its floor ${INTENTS_FLOORS.recall}`);
  if (totals.playerAttributed > INTENTS_FLOORS.playerAttributed) failures.push(`intents playerAttributed ${totals.playerAttributed} is above its floor ${INTENTS_FLOORS.playerAttributed}`);
  return failures;
}

export interface FixtureScore {
  name: string;
  tiers: TierOutcome[];
  /** The plot-delta verdict, kept separate because it is what the headline number has always meant. */
  pass: boolean;
}

export interface TierTotals { scored: number; passed: number; accuracy: number | null; floor?: number; ok: boolean; vacuous: string[]; intents?: IntentsTotals; failures?: string[] }

/** Per-tier totals across every fixture. A tier no fixture states is absent, never reported as 100%. */
export function tierTotals(scores: FixtureScore[], floors: Partial<Record<TierName, number>> = {}): Record<string, TierTotals> {
  const totals: Record<string, TierTotals> = {};
  for (const tier of TIERS) {
    const outcomes = scores.flatMap((score) => score.tiers.filter((row) => row.tier === tier && row.scored));
    if (!outcomes.length) continue;
    const passed = outcomes.filter((row) => row.pass).length;
    const accuracy = passed / outcomes.length;
    const floor = floors[tier];
    const vacuous = [...new Set(outcomes.flatMap((row) => row.vacuous ?? []))];
    if (tier === 'intents') {
      const intents = intentsTotals(outcomes);
      const failures = floor === 0 ? [] : [...intentsFailures(intents, floor ?? INTENTS_FLOORS.precision), ...(vacuous.length ? [`intents carries vacuous claim(s): ${vacuous.join(', ')}`] : [])];
      totals[tier] = { scored: outcomes.length, passed, accuracy: intents.precision, floor: floor ?? INTENTS_FLOORS.precision, ok: failures.length === 0, vacuous, intents, failures };
      continue;
    }
    totals[tier] = {
      scored: outcomes.length,
      passed,
      accuracy: Number(accuracy.toFixed(4)),
      ...(floor === undefined ? {} : { floor }),
      ok: floor === undefined ? true : accuracy >= floor,
      vacuous,
    };
  }
  return totals;
}

/**
 * T5: the floors bind by default. They are plan 01 §F's declared floors and have NOT been calibrated
 * against a live run; the one live measurement (2026-09-22) sits below two of them, and the suite
 * says so rather than having its floors lowered to meet it. `--min-tier tier=x` overrides one, and
 * `tier=0` switches one off in a way the report shows.
 */
export const DEFAULT_TIER_FLOORS: Readonly<Partial<Record<TierName, number>>> = { facts: 0.85, rejected: 0.9, epistemic: 0.8, ledger: 0.8, arcs: 0.8, intents: INTENTS_FLOORS.precision };

/** `--min-tier facts=0.85,rejected=0.9`, applied over `DEFAULT_TIER_FLOORS`. */
export function parseTierFloors(value: string | null | undefined, defaults: Partial<Record<TierName, number>> = DEFAULT_TIER_FLOORS): { floors: Partial<Record<TierName, number>>; given: TierName[]; errors: string[] } {
  const floors: Partial<Record<TierName, number>> = { ...defaults };
  const given: TierName[] = [];
  const errors: string[] = [];
  for (const part of (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const [tier, raw] = part.split('=');
    if (!TIERS.includes(tier as TierName)) { errors.push(`unknown tier "${tier}" in --min-tier`); continue; }
    const floor = Number(raw);
    if (!Number.isFinite(floor) || floor < 0 || floor > 1) { errors.push(`--min-tier ${tier}: "${raw}" is not a fraction between 0 and 1`); continue; }
    floors[tier as TierName] = floor;
    given.push(tier as TierName);
  }
  return { floors, given, errors };
}

export interface SuiteVerdict { ok: boolean; reasons: string[] }

/**
 * The run is green only when the headline plot-delta accuracy clears `min`, every stated tier
 * clears its own floor, and — when `expectCount` is given — the expected number of fixtures ran.
 * A skipped or crashed fixture used to shrink the denominator, so a suite that ran three of
 * twenty-two could report 100%.
 */
export function suiteVerdict(
  { plotAccuracy, min, totals, ran, expectCount, incomplete = [] }:
  { plotAccuracy: number; min: number; totals: Record<string, TierTotals>; ran: number; expectCount?: number | null; incomplete?: string[] },
): SuiteVerdict {
  const reasons: string[] = [];
  if (plotAccuracy < min) reasons.push(`plot-delta accuracy ${plotAccuracy.toFixed(4)} is below --min ${min}`);
  for (const [tier, total] of Object.entries(totals)) {
    if (total.ok) continue;
    if (total.failures?.length) reasons.push(...total.failures);
    else reasons.push(`${tier} accuracy ${total.accuracy} is below its floor ${total.floor}`);
  }
  if (typeof expectCount === 'number' && ran !== expectCount) {
    reasons.push(`ran ${ran} fixture(s), expected ${expectCount} — a shrinking denominator cannot raise accuracy`);
  }
  if (incomplete.length) reasons.push(`incomplete fixture(s): ${incomplete.join(', ')}`);
  return { ok: reasons.length === 0, reasons };
}
