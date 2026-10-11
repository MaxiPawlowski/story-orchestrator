import { judgeUseActive, type JudgeRouteKey, type JudgeSettings, type JudgeUseKey } from "./settings";
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

export const JUDGE_FIXTURE_REVISION: Partial<Record<JudgeReadinessKey, string>> = {
  canonDraft: "05fe396d0e55",
  toneCheck: "139664bd5667",
  idleCheck: "2b8052f53149",
  adversityTrend: "9535ec1a0789",
  pictureCue: "8b9d98811126",
  attentionCheck: "1a4807a406ea",
  canonVerify: "05fe396d0e55",
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

export const MEASURED_FIXTURE_REVISION: Partial<Record<JudgeReadinessKey, string>> = {
  canonDraft: "05fe396d0e55",
  toneCheck: "139664bd5667",
  idleCheck: "2b8052f53149",
  adversityTrend: "9535ec1a0789",
  pictureCue: "8b9d98811126",
  attentionCheck: "1a4807a406ea",
  canonVerify: "05fe396d0e55",
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

/** The `use` string each call-ring row carries, mapped to the readiness rows it measures. */
export const RING_USE_TO_READINESS: Record<string, JudgeReadinessKey[]> = {
  canonDraft: ["canonDraft"],
  canonVerify: ["canonVerify"], pictureCue: ["pictureCue"], adversityTrend: ["adversityTrend"], idleCheck: ["idleCheck"], toneCheck: ["toneCheck"],
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
  divergence: ["divergence"],
};

export type ReadinessFacts = Partial<Record<JudgeReadinessKey, JudgeReadinessFact>>;

export const withFixtureRevisions = <T extends ReadinessFacts>(facts: T, revisions: Partial<Record<JudgeReadinessKey, string>>): T =>
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
  recommendation: `${recommendation} Measured ×2 on 2026-10-03 (Artemis 31B v1.1 Q4_K_M on llama-server b11046).`,
});

const playLoad = (answered: string, fixtures: string) =>
  `Withdrawn after the play check (2026-10-03): under play load (group replies on the same pod, one request per question, 2 in flight) ${answered}. ` +
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

const SYSTEMONE_LOCAL_READINESS: ReadinessFacts = {};

export const ROUTED_READINESS: Partial<Record<JudgeProviderId, ReadinessFacts>> = {
  "llama-logprob": withFixtureRevisions(LLAMA_LOGPROB_READINESS, MEASURED_FIXTURE_REVISION),
  "systemone-local": withFixtureRevisions(SYSTEMONE_LOCAL_READINESS, MEASURED_FIXTURE_REVISION),
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

export const UNCALIBRATED_FACT: JudgeReadinessFact = {
  calibration: null,
  latencyP50Ms: null,
  live: null,
  measuredOn: null,
  recommendation: "Not calibrated on this provider: keeps its usual path until it is.",
};

export const routedReadinessFact = (provider: JudgeProviderId, key: JudgeReadinessKey): JudgeReadinessFact =>
  ROUTED_READINESS[provider]?.[key] ?? UNCALIBRATED_FACT;

export type JudgeServedModels = Partial<Record<JudgeProviderId, string | null>>;

export type JudgeCalibrationProblem = "unmeasured" | "failed" | "stale" | "model";

export const servedId = (model: string) => model.replace(/^llama-server:/, "");

export function calibrationProblem(key: JudgeReadinessKey, fact: JudgeReadinessFact, served: string | null | undefined): JudgeCalibrationProblem | null {
  if (fact.calibration === null) return "unmeasured";
  if (fact.passed === false) return "failed";
  if (fixtureStale(key, fact) || (fact.fixtureRevision ?? null) === null) return "stale";
  if (served && fact.measuredOn !== null && servedId(served) !== fact.measuredOn) return "model";
  return null;
}

export const providerCleared = (provider: JudgeProviderId, key: JudgeReadinessKey, served: JudgeServedModels = {}): boolean =>
  provider === DEFAULT_JUDGE_PROVIDER || calibrationProblem(key, routedReadinessFact(provider, key), served[provider]) === null;

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
