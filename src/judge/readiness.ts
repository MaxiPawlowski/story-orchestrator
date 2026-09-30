import { canonicalModel, isFloatingModel } from "./policy";
import { JUDGE_USE_KEYS, type JudgeSettings, type JudgeUseKey } from "./settings";

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

export type JudgeReadinessKey = JudgeUseKey | "warden";

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
}

const MEASURED_ON = "jev-1.13.0";

export const JUDGE_READINESS: Record<JudgeReadinessKey, JudgeReadinessFact> = {
  stallCheck: { calibration: 1, latencyP50Ms: 1188, live: "J11.23", measuredOn: MEASURED_ON, recommendation: "The strongest measured use: both families clean." },
  memoryVerify: { calibration: 0.9792, latencyP50Ms: 275, live: "J11.7, J11.8", measuredOn: MEASURED_ON, recommendation: "Also the cheapest measured call, against a 3000 ms budget." },
  warden: {
    calibration: 0.9765,
    latencyP50Ms: 720,
    live: "J8.5, J8.6",
    measuredOn: MEASURED_ON,
    recommendation: "Recommended in review mode: auto puts a note in the prompt without an author seeing it.",
  },
  expansionCritic: { calibration: 0.975, latencyP50Ms: 999, live: "J11.25", measuredOn: MEASURED_ON, recommendation: "Replaces a second model call, so it pays for itself." },
  expansionLookahead: { calibration: 1, latencyP50Ms: 812, live: "J11.25", measuredOn: MEASURED_ON, recommendation: "Worth it where prepare-ahead is wanted; dead weight otherwise." },
  lookahead: { calibration: 1, latencyP50Ms: 812, live: "J11.25", measuredOn: MEASURED_ON, recommendation: "Worth it where prepare-ahead is wanted; dead weight otherwise." },
  curatorFilter: { calibration: 0.9167, latencyP50Ms: 223, live: "J11.26, J8", measuredOn: MEASURED_ON, recommendation: "Worth it once a curator scope exceeds ~40 entries; pointless below that." },
  typedExtraction: {
    calibration: 0.8433,
    latencyP50Ms: 1290,
    live: "J11.20, J11.21",
    measuredOn: MEASURED_ON,
    recommendation: "Needs authored read_as hints to do anything. The rate is lower than v2.2 reported because it now counts the coverage family — how often the judge answers " +
      "at all — whose own floor is 0.",
  },
  memoryPairs: { calibration: 0.9063, latencyP50Ms: 750, live: "J11.9, J11.10", measuredOn: MEASURED_ON, recommendation: "Measured on the consolidation path." },
  sceneTrigger: {
    calibration: 0.9503,
    latencyP50Ms: 1512,
    live: "J11.11–J11.15",
    measuredOn: MEASURED_ON,
    recommendation: "The most expensive measured use, against a 2500 ms budget, and off the reply path so lateness costs nothing a player feels.",
  },
  sceneTracker: { calibration: 0.9503, latencyP50Ms: 1512, live: "J11.11–J11.15", measuredOn: MEASURED_ON, recommendation: "As sceneTrigger: measured, and off the reply path." },
  director: {
    calibration: 0.9091,
    latencyP50Ms: 1129,
    live: "J11.3, J11.4",
    measuredOn: MEASURED_ON,
    recommendation: "Only with an authored role on every candidate — without roles it reports no-roles and does nothing. Fits its 1500 ms reply-path budget at p50.",
  },
  agencyCheck: {
    calibration: 1,
    latencyP50Ms: 1441,
    live: "J8.10, J8.11",
    measuredOn: MEASURED_ON,
    recommendation: "Review mode recommended, as for the warden. Rides the warden's call off the reply path; stands down where a checkpoint allows narrating the player.",
  },
  houseRules: {
    calibration: 0.9896,
    latencyP50Ms: 499,
    live: "J8.12, J8.13",
    measuredOn: MEASURED_ON,
    recommendation: "Does nothing until the story authors house rules. Measured on objective rules (content, format, world); keep one demand per rule.",
  },
  loreSelect: {
    calibration: 0.8974,
    latencyP50Ms: 509,
    live: "J11.16–J11.19",
    measuredOn: MEASURED_ON,
    recommendation: "Known weakness: ranking by a compressed, heavily tied probability, so which entries win is weaker than the rate suggests. Fits its 1500 ms reply-path budget at p50.",
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
};

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
  /** Set when the verdict is `blocked`: the dependency that is off. */
  blockedBy?: JudgeUseKey;
  /** Set when the model in effect is not the one the row was measured on. */
  modelMismatch?: JudgeModelMismatch;
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

/**
 * One row per use, in the order the settings declare them, plus the warden when its own switch is
 * on. `blocked` is its own verdict because an enabled use whose dependency is off is not doing
 * anything — saying "measured" there would be the over-claim this report exists to avoid.
 */
export function judgeReadiness(
  settings: JudgeSettings,
  dependencies: Partial<Record<JudgeUseKey, JudgeUseKey>> = {},
  lastAnswered: string | null = null,
  extra: { warden?: boolean } = {},
): JudgeReadinessRow[] {
  const row = (key: JudgeReadinessKey, enabled: boolean): JudgeReadinessRow => {
    const fact = JUDGE_READINESS[key];
    if (!settings.enabled || !enabled) return { key, ...fact, enabled, verdict: "off" };
    const dependency = key === "warden" ? undefined : dependencies[key];
    if (dependency && settings.uses[dependency] !== true) return { key, ...fact, enabled, verdict: "blocked", blockedBy: dependency };
    if (fact.calibration === null) return { key, ...fact, enabled, verdict: "unproven" };
    const mismatch = modelMismatch(settings.model, lastAnswered, fact.measuredOn);
    return mismatch ? { key, ...fact, enabled, verdict: "unproven", modelMismatch: mismatch } : { key, ...fact, enabled, verdict: "measured" };
  };
  const rows = JUDGE_USE_KEYS.map((key) => row(key, settings.uses[key] === true));
  return extra.warden ? [...rows, row("warden", true)] : rows;
}

/** Only what an author needs to look at: what is on, and what is on but not doing anything. */
export const judgeReadinessConcerns = (rows: JudgeReadinessRow[]): JudgeReadinessRow[] => rows.filter((row) => row.verdict === "unproven" || row.verdict === "blocked");
