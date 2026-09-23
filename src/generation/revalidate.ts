import type { NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import { applyDeltas, outcomePaths } from "./paths";
import type { ExpansionCacheEntry, GeneratedBeat, RevalidationResult } from "./types";

const matches = (current: PrimitiveValue | undefined, target: PrimitiveValue, tolerance: number) => {
  if (typeof current === "number" && typeof target === "number") return Math.abs(current - target) <= tolerance;
  return current === target;
};

type Route = { values: Record<string, PrimitiveValue>; outcomes: number[]; bridged: boolean };

/** Every route through the chain with the outcome index taken at each beat, so a beat whose outcome
 *  cannot reach the anchor can be named instead of being averaged away. */
const routes = (blackboard: Record<string, PrimitiveValue>, beats: GeneratedBeat[]): Route[] => {
  let open: Route[] = [{ values: { ...blackboard }, outcomes: [], bridged: true }];
  for (const beat of beats) {
    const next: Route[] = [];
    for (const route of open) {
      beat.outcomes.forEach((outcome, outcomeIndex) => {
        next.push({ values: applyDeltas(route.values, outcome.deltas), outcomes: [...route.outcomes, outcomeIndex], bridged: true });
      });
    }
    const seen = new Map<string, Route>();
    for (const route of next) {
      const key = JSON.stringify(Object.keys(route.values).sort().map((name) => [name, route.values[name]]));
      if (!seen.has(key)) seen.set(key, route);
    }
    open = [...seen.values()];
  }
  return open;
};

export function revalidateExpansion(
  story: NormalizedStoryV2,
  entry: ExpansionCacheEntry,
  blackboard: Record<string, PrimitiveValue>,
  tolerance = 0.001,
): RevalidationResult {
  const target = story.checkpointById[entry.targetAnchorId];
  if (!target) return { status: "fail", validBeatCount: 0, issues: [`Unknown target anchor ${entry.targetAnchorId}`] };
  const driftIssues = Object.entries(target.state_snapshot ?? {})
    .filter(([key, value]) => key in entry.basis && blackboard[key] !== entry.basis[key] && !matches(blackboard[key], value, tolerance))
    .map(([key]) => `${key} drifted from expansion basis`);
  if (driftIssues.length) return { status: "fail", validBeatCount: 0, issues: driftIssues };
  // v2.3 plan 07 (R9). A route that no longer bridges is not a route: it is a player who takes the
  // outcome the merge used to discard and never enters the anchor. Every route is checked, and the
  // beat whose outcome fails is named.
  if (!outcomePaths({ ...blackboard }, entry.beats).length) {
    return { status: "partial", validBeatCount: 0, issues: ["too many outcome routes to revalidate"] };
  }
  const all = routes(blackboard, entry.beats);
  const failing = Object.entries(target.state_snapshot ?? {});
  const bridged = (route: Route) => failing.every(([key, value]) => matches(route.values[key], value, tolerance));
  const good = all.filter(bridged);
  const beatTraversed = (index: number) => new Set(good.map((route) => route.outcomes[index]));
  let validBeatCount = 0;
  for (let index = 0; index < entry.beats.length; index += 1) {
    const taken = beatTraversed(index);
    if (entry.beats[index].outcomes.some((_, outcomeIndex) => !taken.has(outcomeIndex))) break;
    validBeatCount += 1;
  }
  if (good.length === all.length) return { status: "pass", validBeatCount, issues: [] };
  const issues = [...new Set(all.filter((route) => !bridged(route)).map((route) => `route ${route.outcomes.join("-")} cannot bridge current blackboard to target`))].slice(0, 4);
  return { status: good.length ? "partial" : "fail", validBeatCount, issues };
}
