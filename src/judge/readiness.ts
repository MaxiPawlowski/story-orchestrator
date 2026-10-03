import { canonicalModel, isFloatingModel } from "./policy";
import { judgeUseActive, JUDGE_USE_KEYS, type JudgeRouteKey, type JudgeSettings, type JudgeUseKey } from "./settings";
import { DEFAULT_JUDGE_PROVIDER, type JudgeProviderId } from "./providers";

// Re-measured The recommended-configuration table as data the settings
// panel can render — the numbers are RECORDED measurements, not a re-run, so the panel says where
// each one came from. They are this round's: every use was re-calibrated live on against
// `jev-1.13.0`, and the goldens under `test/goldens/judge/*.calibration.json` carry the rate, the
// per-family verdicts and the latency behind each row. `docs/plans recommended-config.md`
// keeps the evidence and the caveats; the page is superseded (its `typedExtraction` read 0.908
// where this round measured 0.843, and it had no latency column at all).
//
// The point of the summary is the distinction the review asked for: "enabled" is not "working". A use
// with no calibration is reported `unproven` rather than being quietly listed alongside the measured
// ones, and a use that is on but whose dependency is off says so. adds the model: a rate
// measured on one model says nothing about another, so a mismatch reads `unproven` (never re-floored).

export type JudgeReadinessKey = JudgeRouteKey;

export interface JudgeReadinessFact {
  /** Accuracy at the recorded floor, or null when nothing has measured this use. */
  calibration: number | null;
  /** Median call latency from the same calibration run, or null when nothing has measured it. */
  latencyP50Ms: number | null;
  /** The journeys that exercised it, or null. */
  live: string | null;
  /** The versioned model the calibration ran on, or null when nothing has measured it. */
  measuredOn: string | null;
  recommendation: string;
  fixtureRevision?: string | null;
  passed?: boolean;
}

const MEASURED_ON = "jev-1.13.0";

export const JUDGE_FIXTURE_REVISION: Partial<Record<JudgeReadinessKey, string>> = {
  stallCheck: "285953bcdcd0",
  memoryVerify: "35299aebd287",
  warden: "667319dbcd15",
  expansionCritic: "94ba671a348a",
  expansionLookahead: "775cd0b58e03",
  lookahead: "775cd0b58e03",
  curatorFilter: "8c4be67eb91b",
  typedExtraction: "74b12b210456",
  memoryPairs: "ef829c8a4916",
  sceneTrigger: "efa5d9d5461f",
  sceneTracker: "efa5d9d5461f",
  director: "d30d38c6ce47",
  agencyCheck: "1a69bad097f7",
  houseRules: "26340841970d",
  loreSelect: "9711db218ed5",
  wardenLore: "f7e3fb753e56",
};

const MEASURED_FIXTURE_REVISION: Partial<Record<JudgeReadinessKey, string>> = {
  stallCheck: "285953bcdcd0",
  memoryVerify: "35299aebd287",
  warden: "667319dbcd15",
  expansionCritic: "94ba671a348a",
  expansionLookahead: "775cd0b58e03",
  lookahead: "775cd0b58e03",
  curatorFilter: "8c4be67eb91b",
  typedExtraction: "74b12b210456",
  memoryPairs: "ef829c8a4916",
  sceneTrigger: "efa5d9d5461f",
  sceneTracker: "efa5d9d5461f",
  director: "d30d38c6ce47",
  agencyCheck: "1a69bad097f7",
  houseRules: "26340841970d",
  loreSelect: "9711db218ed5",
  wardenLore: "f7e3fb753e56",
};

export const JUDGE_READINESS: Record<JudgeReadinessKey, JudgeReadinessFact> = {
  stallCheck: { calibration: 1, latencyP50Ms: 243, live: "J11.23", measuredOn: MEASURED_ON, recommendation: "The strongest measured use: both families clean." },
  memoryVerify: { calibration: 0.9722, latencyP50Ms: 236, live: "J11.7, J11.8", measuredOn: MEASURED_ON, recommendation: "Cheap against its 3000 ms budget." },
  warden: {
    calibration: 0.9701,
    latencyP50Ms: 247,
    live: "J8.5, J8.6",
    measuredOn: MEASURED_ON,
    recommendation: "Recommended in review mode: auto puts a note in the prompt without an author seeing it.",
  },
  expansionCritic: { calibration: 0.9853, latencyP50Ms: 245, live: "J11.25", measuredOn: MEASURED_ON, recommendation: "Replaces a second model call, so it pays for itself." },
  expansionLookahead: { calibration: 1, latencyP50Ms: 270, live: "J11.25", measuredOn: MEASURED_ON, recommendation: "Worth it where prepare-ahead is wanted; dead weight otherwise." },
  lookahead: { calibration: 1, latencyP50Ms: 270, live: "J11.25", measuredOn: MEASURED_ON, recommendation: "Worth it where prepare-ahead is wanted; dead weight otherwise." },
  curatorFilter: { calibration: 0.8889, latencyP50Ms: 281, live: "J11.26, J8", measuredOn: MEASURED_ON, recommendation: "Worth it once a curator scope exceeds ~40 entries; pointless below that." },
  typedExtraction: {
    calibration: 0.8295,
    latencyP50Ms: 260,
    live: "J11.20, J11.21",
    measuredOn: MEASURED_ON,
    recommendation: "Needs authored read_as hints to do anything. The rate is lower than v2.2 reported because it now counts the coverage family — how often the judge answers " +
      "at all — whose own floor is 0.",
  },
  memoryPairs: { calibration: 0.931, latencyP50Ms: 254, live: "J11.9, J11.10", measuredOn: MEASURED_ON, recommendation: "Measured on the consolidation path." },
  sceneTrigger: {
    calibration: 0.9673,
    latencyP50Ms: 243,
    live: "J11.11–J11.15",
    measuredOn: MEASURED_ON,
    recommendation: "Off the reply path, against a 2500 ms budget, so lateness costs nothing a player feels.",
  },
  sceneTracker: { calibration: 0.9673, latencyP50Ms: 243, live: "J11.11–J11.15", measuredOn: MEASURED_ON, recommendation: "As sceneTrigger: measured, and off the reply path." },
  director: {
    calibration: 0.88,
    latencyP50Ms: 245,
    live: "J11.3, J11.4",
    measuredOn: MEASURED_ON,
    recommendation: "Only with an authored role on every candidate — without roles it reports no-roles and does nothing. Fits its 1500 ms reply-path budget at p50.",
  },
  agencyCheck: {
    calibration: 1,
    latencyP50Ms: 241,
    live: "J8.10, J8.11",
    measuredOn: MEASURED_ON,
    recommendation: "Review mode recommended, as for the warden. Rides the warden's call off the reply path; stands down where a checkpoint allows narrating the player.",
  },
  houseRules: {
    calibration: 0.965,
    latencyP50Ms: 235,
    live: "J8.12, J8.13",
    measuredOn: MEASURED_ON,
    passed: false,
    recommendation:
      "Below its floor on the re-measure with the scene and the fired world-book entries " +
      "(2026-10-02, the Adolion saga's 8 house rules: broken 18/18, kept 10/10, untouched 165/172 vs 0.966): off by default. " +
      "Every broken rule is now caught; the false alarms sit on judgement rules that overlap " +
      "(the player's action read as a group member's, a spent mystery read as a spent secret); objective rules alone cleared every floor (0.9875).",
  },
  loreSelect: {
    calibration: 0.8966,
    latencyP50Ms: 291,
    live: "J11.16–J11.19",
    measuredOn: MEASURED_ON,
    recommendation: "Known weakness: ranking by a compressed, heavily tied probability, so which entries win is weaker than the rate suggests. Fits its 1500 ms reply-path budget at p50.",
  },
  wardenLore: {
    calibration: 1,
    latencyP50Ms: 233,
    live: null,
    measuredOn: MEASURED_ON,
    recommendation: "Review mode recommended, as for the warden. Its own call, off the reply path, only on the story's own lore that fired for the reply; " +
      "not yet measured live (latency bar and over-steer).",
  },
  loreExclusive: {
    calibration: null,
    latencyP50Ms: null,
    live: null,
    measuredOn: null,
    recommendation: "Not measured yet: its recall and noise floors (v2.5 plan 08 X1/X2) have not run live, so keep it off.",
  },
  expressions: {
    calibration: null,
    latencyP50Ms: null,
    live: null,
    measuredOn: null,
    recommendation: "Not measured yet: presentation only, a wrong face never touches the story. The sprite model and the local classifier take over when it is off.",
  },
};

/** The `use` string each call-ring row carries, mapped to the readiness rows it measures. */
export const RING_USE_TO_READINESS: Record<string, JudgeReadinessKey[]> = {
  director: ["director"],
  memoryVerify: ["memoryVerify"],
  memoryPairs: ["memoryPairs"],
  curatorFilter: ["curatorFilter"],
  lore: ["loreSelect"],
  scene: ["sceneTrigger", "sceneTracker", "lookahead"],
  typed: ["typedExtraction"],
  stall: ["stallCheck"],
  critic: ["expansionCritic"],
  warden: ["warden"],
  wardenLore: ["wardenLore"],
};

type ReadinessFacts = Partial<Record<JudgeReadinessKey, JudgeReadinessFact>>;

const withFixtureRevisions = <T extends ReadinessFacts>(facts: T, revisions: Partial<Record<JudgeReadinessKey, string>>): T =>
  Object.fromEntries(
    Object.entries(facts).map(([key, fact]) => [key, { ...fact, fixtureRevision: fact?.fixtureRevision ?? revisions[key as JudgeReadinessKey] ?? null }]),
  ) as T;

export const LLAMA_LOGPROB_MEASURED_ON = "/workspace/models/TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf";

const llamaRow = (calibration: number, latencyP50Ms: number, passed: boolean, recommendation: string): JudgeReadinessFact => ({
  calibration,
  latencyP50Ms,
  live: null,
  measuredOn: LLAMA_LOGPROB_MEASURED_ON,
  passed,
  recommendation: `${recommendation} Measured ×2 on 2026-10-03 (Artemis 31B v1.1 Q4_K_M on llama-server b11046, docs/plans/v2.6/12-provider-matrix.md).`,
});

const playLoad = (answered: string, fixtures: string) =>
  `Withdrawn after the T6-2 play check (2026-10-03): under play load (group replies on the same pod, one request per question, 2 in flight) ${answered}. ` +
  `On fixtures ${fixtures}.`;

const LLAMA_LOGPROB_READINESS: ReadinessFacts = {
  memoryPairs: llamaRow(0.9655, 1475, false, playLoad("it answered 26 of 58 calls, the rest timed out or hit busy", "it met its floor (28/29 both runs) inside its 3000 ms budget (p95 1.7 s)")),
  typedExtraction: llamaRow(0.8485, 1041, false, playLoad("it answered 0 of 59 calls", "the answered family was 55/57 both runs inside its 5000 ms budget (p95 4.1 s)")),
  stallCheck: llamaRow(1, 1180, false, playLoad("it answered 0 of 7 calls", "every row was right both runs inside its 4000 ms budget (p95 3.5 s)")),
  warden: llamaRow(
    1,
    1320,
    false,
    playLoad("it answered 0 of 30 calls", "continuity was right in every family both runs inside its 4000 ms budget (p95 3.8 s)"),
  ),
  agencyCheck: llamaRow(0.9756, 1015, false, playLoad("it rides the warden's call, which answered 0 of 30", "writes 17/18 and clean 23/23 both runs (p95 1.8 s)")),
  director: llamaRow(0.88, 4301, false, "Refused: meets its floor (22/25 both runs) but needs 5.3 s at p95 against its 1500 ms reply-path budget."),
  memoryVerify: llamaRow(1, 3591, false, "Refused: every row right both runs, but 3.9 s at p95 against its 3000 ms budget."),
  expansionCritic: llamaRow(0.9265, 2676, false, "Refused: below its floor (verdict 30/34 against 1.0, both runs, no timeouts) and 3.0 s at p95 against its 2500 ms budget."),
  expansionLookahead: llamaRow(0.8125, 2777, false, "Refused: below its floor (rejected 5/8 against 1.0, both runs, no timeouts)."),
  lookahead: llamaRow(0.8125, 2777, false, "Refused: below its floor (rejected 5/8 against 1.0, both runs, no timeouts)."),
  wardenLore: llamaRow(
    1,
    1488,
    false,
    "Refused: the same entries asked as established facts were all right both runs but took 4.3 s at p95 against its 4000 ms budget; " +
      "the lore question it ships with was not measured cleanly.",
  ),
};

export const JUDGE_READINESS_BY_PROVIDER: Record<JudgeProviderId, ReadinessFacts> = {
  typesafe: withFixtureRevisions(JUDGE_READINESS, MEASURED_FIXTURE_REVISION),
  "llama-logprob": withFixtureRevisions(LLAMA_LOGPROB_READINESS, MEASURED_FIXTURE_REVISION),
};

export interface JudgeFixtureStale {
  measured: string | null;
  current: string;
}

export function fixtureStale(
  key: JudgeReadinessKey,
  fact: JudgeReadinessFact,
  current: Partial<Record<JudgeReadinessKey, string>> = JUDGE_FIXTURE_REVISION,
): JudgeFixtureStale | undefined {
  const revision = current[key];
  if (fact.calibration === null || revision === undefined) return undefined;
  const measured = fact.fixtureRevision ?? null;
  return measured === revision ? undefined : { measured, current: revision };
}

export const readinessFact = (provider: JudgeProviderId, key: JudgeReadinessKey): JudgeReadinessFact =>
  JUDGE_READINESS_BY_PROVIDER[provider][key] ?? {
    calibration: null,
    latencyP50Ms: null,
    live: null,
    measuredOn: null,
    recommendation: "Not calibrated on this provider: keeps its usual path until it is.",
  };

export type JudgeServedModels = Partial<Record<JudgeProviderId, string | null>>;

export type JudgeCalibrationProblem = "unmeasured" | "failed" | "stale" | "model";

const servedId = (model: string) => model.replace(/^llama-server:/, "");

export function calibrationProblem(key: JudgeReadinessKey, fact: JudgeReadinessFact, served: string | null | undefined): JudgeCalibrationProblem | null {
  if (fact.calibration === null) return "unmeasured";
  if (fact.passed === false) return "failed";
  if (fixtureStale(key, fact) || (fact.fixtureRevision ?? null) === null) return "stale";
  if (served && fact.measuredOn !== null && servedId(served) !== fact.measuredOn) return "model";
  return null;
}

export const providerCleared = (provider: JudgeProviderId, key: JudgeReadinessKey, served: JudgeServedModels = {}): boolean =>
  provider === DEFAULT_JUDGE_PROVIDER || calibrationProblem(key, readinessFact(provider, key), served[provider]) === null;

export const RING_USE_ROUTE_KEYS: Record<string, JudgeReadinessKey[]> = {
  ...RING_USE_TO_READINESS,
  lore: ["loreSelect", "loreExclusive"],
  warden: ["warden", "agencyCheck", "houseRules"],
  expressions: ["expressions"],
};

export type JudgeRouteRefusal = "uncalibrated" | "split";

export interface JudgeRoute {
  provider: JudgeProviderId;
  keys: JudgeReadinessKey[];
  refused?: JudgeRouteRefusal;
}

const keyActive = (settings: JudgeSettings, key: JudgeReadinessKey) => key === "warden" || judgeUseActive(settings, key);

export function judgeRoute(settings: JudgeSettings, use: string, served: JudgeServedModels = {}): JudgeRoute {
  const keys = RING_USE_ROUTE_KEYS[use] ?? [];
  if (!keys.length) return { provider: DEFAULT_JUDGE_PROVIDER, keys };
  const active = keys.filter((key) => keyActive(settings, key));
  const deciding = active.length ? active : keys.slice(0, 1);
  const providers = [...new Set(deciding.map((key) => settings.provider?.[key] ?? DEFAULT_JUDGE_PROVIDER))];
  const provider = providers[0];
  if (providers.length > 1) return { provider, keys: deciding, refused: "split" };
  return deciding.every((key) => providerCleared(provider, key, served)) ? { provider, keys: deciding } : { provider, keys: deciding, refused: "uncalibrated" };
}

export type JudgeReadinessVerdict = "off" | "unproven" | "measured" | "blocked";

export interface JudgeModelMismatch {
  configured: string;
  answered: string | null;
  measuredOn: string;
}

export interface JudgeReadinessRow extends JudgeReadinessFact {
  key: JudgeReadinessKey;
  enabled: boolean;
  verdict: JudgeReadinessVerdict;
  provider: JudgeProviderId;
  /** Set when the verdict is `blocked`: the dependency that is off. */
  blockedBy?: JudgeUseKey;
  /** Set when the model in effect is not the one the row was measured on. */
  modelMismatch?: JudgeModelMismatch;
  uncalibratedOn?: JudgeProviderId;
  calibrationProblem?: JudgeCalibrationProblem;
  splitFrom?: JudgeReadinessKey[];
  fixtureStale?: JudgeFixtureStale;
}

/**
 * The models a measurement has to hold for: a pinned configured id (the next call asks it) and the
 * version that last answered. A floating alias names no version until it has answered, so an alias
 * with no answer yet is unknown, and unknown is never a match.
 */
function modelMismatch(configured: string, answered: string | null, measuredOn: string | null): JudgeModelMismatch | undefined {
  if (measuredOn === null) return undefined;
  const inEffect = [isFloatingModel(configured) ? null : canonicalModel(configured), answered ? canonicalModel(answered) ?? answered : null].filter((id): id is string => id !== null);
  if (inEffect.length && inEffect.every((id) => id === measuredOn)) return undefined;
  return { configured, answered, measuredOn };
}

function servedMismatch(provider: JudgeProviderId, served: string | null, measuredOn: string | null): JudgeModelMismatch | undefined {
  if (measuredOn === null) return undefined;
  return served && servedId(served) === measuredOn ? undefined : { configured: provider, answered: served, measuredOn };
}

const splitPartners = (settings: JudgeSettings, key: JudgeReadinessKey): JudgeReadinessKey[] => {
  const use = Object.keys(RING_USE_ROUTE_KEYS).find((ring) => RING_USE_ROUTE_KEYS[ring].includes(key));
  if (!use) return [];
  const route = judgeRoute(settings, use);
  return route.refused === "split" && route.keys.includes(key) ? route.keys.filter((other) => settings.provider?.[other] !== settings.provider?.[key]) : [];
};

/**
 * One row per use, in the order the settings declare them, plus the warden when its own switch is
 * on. `blocked` is its own verdict because an enabled use whose dependency is off is not doing
 * anything — saying "measured" there would be the over-claim this report exists to avoid.
 */
export function judgeReadiness(
  settings: JudgeSettings,
  dependencies: Partial<Record<JudgeUseKey, JudgeUseKey>> = {},
  lastAnswered: string | null = null,
  extra: { warden?: boolean; fixtureRevisions?: Partial<Record<JudgeReadinessKey, string>>; served?: JudgeServedModels } = {},
): JudgeReadinessRow[] {
  const row = (key: JudgeReadinessKey, enabled: boolean): JudgeReadinessRow => {
    const provider = settings.provider?.[key] ?? DEFAULT_JUDGE_PROVIDER;
    const fact = readinessFact(provider, key);
    const base = { key, ...fact, enabled, provider };
    if (!settings.enabled || !enabled) return { ...base, verdict: "off" };
    const dependency = key === "warden" ? undefined : dependencies[key];
    if (dependency && settings.uses[dependency] !== true) return { ...base, verdict: "blocked", blockedBy: dependency };
    const typesafe = provider === DEFAULT_JUDGE_PROVIDER;
    const served = extra.served?.[provider] ?? null;
    const problem = typesafe ? null : calibrationProblem(key, fact, null);
    if (problem === "unmeasured") return { ...base, verdict: "unproven", uncalibratedOn: provider };
    if (problem === "failed" || problem === "stale") {
      const stale = fixtureStale(key, fact, extra.fixtureRevisions);
      return { ...base, verdict: "unproven", uncalibratedOn: provider, calibrationProblem: problem, ...(stale ? { fixtureStale: stale } : {}) };
    }
    if (typesafe && fact.passed === false) return { ...base, verdict: "unproven", calibrationProblem: "failed" };
    const split = settings.provider ? splitPartners(settings, key) : [];
    if (split.length) return { ...base, verdict: "unproven", splitFrom: split };
    if (fact.calibration === null) return { ...base, verdict: "unproven" };
    const mismatch = typesafe ? modelMismatch(settings.model, lastAnswered, fact.measuredOn) : servedMismatch(provider, served, fact.measuredOn);
    if (mismatch) return { ...base, verdict: "unproven", modelMismatch: mismatch };
    const stale = fixtureStale(key, fact, extra.fixtureRevisions);
    return stale ? { ...base, verdict: "unproven", fixtureStale: stale } : { ...base, verdict: "measured" };
  };
  const rows = JUDGE_USE_KEYS.map((key) => row(key, settings.uses[key] === true));
  return extra.warden ? [...rows, row("warden", true)] : rows;
}

/** Only what an author needs to look at: what is on, and what is on but not doing anything. */
export const judgeReadinessConcerns = (rows: JudgeReadinessRow[]): JudgeReadinessRow[] => rows.filter((row) => row.verdict === "unproven" || row.verdict === "blocked");
