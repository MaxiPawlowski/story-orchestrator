import { JUDGE_USE_KEYS, type JudgeSettings, type JudgeUseKey } from "./settings";

// v2.3 plan 09, re-measured by plan 11. The recommended-configuration table as data the settings
// panel can render — the numbers are RECORDED measurements, not a re-run, so the panel says where
// each one came from. They are this round's: every use was re-calibrated live on 2026-09-22 against
// `jev-1.13.0`, and the goldens under `test/goldens/judge/*.calibration.json` carry the rate, the
// per-family verdicts and the p50 latency behind each row. `docs/plans/v2.3/recommended-config.md`
// keeps the evidence and the caveats; the v2.2 page is superseded (its `typedExtraction` read 0.908
// where this round measured 0.843, and it had no latency column at all).
//
// The point of the summary is the distinction the review asked for: "enabled" is not "working". A use
// with no calibration is reported `unproven` rather than being quietly listed alongside the measured
// ones, and a use that is on but whose dependency is off says so.

export interface JudgeReadinessFact {
  /** Accuracy at the recorded floor, or null when nothing has measured this use. */
  calibration: number | null;
  /** Median call latency from the same calibration run, or null when nothing has measured it. */
  latencyP50Ms: number | null;
  /** The journeys that exercised it, or null. */
  live: string | null;
  recommendation: string;
}

export const JUDGE_READINESS: Record<JudgeUseKey, JudgeReadinessFact> = {
  stallCheck: { calibration: 1, latencyP50Ms: 1188, live: "J11.23", recommendation: "The strongest measured use: both families clean." },
  memoryVerify: { calibration: 0.9792, latencyP50Ms: 275, live: "J11.7, J11.8", recommendation: "Also the cheapest measured call, against a 3000 ms budget." },
  expansionCritic: { calibration: 0.975, latencyP50Ms: 999, live: "J11.25", recommendation: "Replaces a second model call, so it pays for itself." },
  expansionLookahead: { calibration: 1, latencyP50Ms: 812, live: "J11.25", recommendation: "Worth it where prepare-ahead is wanted; dead weight otherwise." },
  lookahead: { calibration: 1, latencyP50Ms: 812, live: "J11.25", recommendation: "Worth it where prepare-ahead is wanted; dead weight otherwise." },
  curatorFilter: { calibration: 0.9167, latencyP50Ms: 223, live: "J11.26, J8", recommendation: "Worth it once a curator scope exceeds ~40 entries; pointless below that." },
  typedExtraction: { calibration: 0.8433, latencyP50Ms: 1290, live: "J11.20, J11.21", recommendation: "Needs authored read_as hints to do anything. The rate is lower than v2.2 reported because it now counts the coverage family — how often the judge answers at all — whose own floor is 0." },
  memoryPairs: { calibration: 0.9063, latencyP50Ms: 750, live: "J11.9, J11.10", recommendation: "Measured on the consolidation path." },
  sceneTrigger: { calibration: 0.9503, latencyP50Ms: 1512, live: "J11.11–J11.15", recommendation: "The most expensive measured use, against a 2500 ms budget, and off the reply path so lateness costs nothing a player feels." },
  sceneTracker: { calibration: 0.9503, latencyP50Ms: 1512, live: "J11.11–J11.15", recommendation: "As sceneTrigger: measured, and off the reply path." },
  director: { calibration: 0.9091, latencyP50Ms: 1129, live: "J11.3, J11.4", recommendation: "Only with an authored role on every candidate — without roles it reports no-roles and does nothing. Fits its 1500 ms reply-path budget at p50." },
  loreSelect: { calibration: 0.8974, latencyP50Ms: 509, live: "J11.16–J11.19", recommendation: "Known weakness: ranking by a compressed, heavily tied probability, so which entries win is weaker than the rate suggests. Fits its 1500 ms reply-path budget at p50." },
  sceneOoc: { calibration: null, latencyP50Ms: null, live: null, recommendation: "No evidence — not exercised by any journey and not calibrated. Unproven, not recommended." },
  memoryRerank: { calibration: null, latencyP50Ms: null, live: null, recommendation: "No evidence, as sceneOoc." },
};

export type JudgeReadinessVerdict = "off" | "unproven" | "measured" | "blocked";

export interface JudgeReadinessRow extends JudgeReadinessFact {
  key: JudgeUseKey;
  enabled: boolean;
  verdict: JudgeReadinessVerdict;
  /** Set when the verdict is `blocked`: the dependency that is off. */
  blockedBy?: JudgeUseKey;
}

/**
 * One row per use, in the order the settings declare them. `blocked` is its own verdict because an
 * enabled use whose dependency is off is not doing anything — saying "measured" there would be the
 * over-claim this report exists to avoid.
 */
export const judgeReadiness = (settings: JudgeSettings, dependencies: Partial<Record<JudgeUseKey, JudgeUseKey>> = {}): JudgeReadinessRow[] =>
  JUDGE_USE_KEYS.map((key) => {
    const fact = JUDGE_READINESS[key];
    const enabled = settings.uses[key] === true;
    const dependency = dependencies[key];
    // The master switch first: a use flag left on with the judge off is not doing anything either, and
    // reporting it as measured would be exactly the over-claim this summary exists to avoid.
    if (!settings.enabled) return { key, ...fact, enabled, verdict: "off" };
    if (!enabled) return { key, ...fact, enabled, verdict: "off" };
    if (dependency && settings.uses[dependency] !== true) return { key, ...fact, enabled, verdict: "blocked", blockedBy: dependency };
    return { key, ...fact, enabled, verdict: fact.calibration === null ? "unproven" : "measured" };
  });

/** Only what an author needs to look at: what is on, and what is on but not doing anything. */
export const judgeReadinessConcerns = (rows: JudgeReadinessRow[]): JudgeReadinessRow[] => rows.filter((row) => row.verdict === "unproven" || row.verdict === "blocked");
