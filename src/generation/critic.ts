import { progressQualityForAnchor, thresholdFor, type GateLeaf, type GateNode, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { askText, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { renderCriticPrompt } from "./prompts";
import { parseCriticVerdict } from "./parse";
import { gatePins, gatesHeldOnEntry, outcomePaths } from "./paths";
import type { CodeCheckResult, CriticVerdict, GeneratedBeat, PlannedExpansionInput } from "./types";

const valuesEqual = (left: PrimitiveValue | undefined, right: PrimitiveValue) => left === right;

const collectAndLeaves = (gate: GateNode, out: GateLeaf[]) => {
  if ("q" in gate) { out.push(gate); return; }
  if ("all" in gate) gate.all.forEach((entry) => collectAndLeaves(entry, out));
};

const gateKey = (gate: GateNode): string => {
  if ("q" in gate) return JSON.stringify([gate.q, gate.op, gate.v]);
  if ("all" in gate) return `all(${gate.all.map(gateKey).sort().join(",")})`;
  if ("any" in gate) return `any(${gate.any.map(gateKey).sort().join(",")})`;
  return `not(${gateKey(gate.not)})`;
};

const leafSatisfiedBy = (leaf: GateLeaf, value: PrimitiveValue): boolean => {
  if (leaf.op === "==") return value === leaf.v;
  if (leaf.op === "!=") return value !== leaf.v;
  if (leaf.op === "in") return Array.isArray(leaf.v) && leaf.v.includes(value);
  if (typeof value !== "number" || typeof leaf.v !== "number") return true;
  if (leaf.op === ">=") return value >= leaf.v;
  if (leaf.op === "<=") return value <= leaf.v;
  if (leaf.op === ">") return value > leaf.v;
  if (leaf.op === "<") return value < leaf.v;
  return true;
};

export function runCodeChecks(story: NormalizedStoryV2, input: PlannedExpansionInput, beats: GeneratedBeat[]): CodeCheckResult {
  const issues: string[] = [];
  const target = story.checkpointById[input.candidate.targetAnchorId];
  // A snapshot key the plan left out already holds its target on entry (planExpansion only lists what
  // differs), so the simulation starts it there; the chain breaks it only by writing another value.
  const planned = new Set(input.deltas.map((delta) => delta.q));
  const satisfied = Object.entries(target.state_snapshot ?? {}).filter(([key]) => !planned.has(key) && story.qualityByKey[key]);
  const start = {
    ...Object.fromEntries(satisfied),
    ...Object.fromEntries(input.deltas.map((delta) => [delta.q, delta.current]).filter((entry): entry is [string, PrimitiveValue] => entry[1] !== undefined))
  };
  let progressTotal = 0;
  beats.forEach((beat, index) => {
    const isFinal = index === beats.length - 1;
    beat.outcomes.forEach((outcome) => {
      if (isFinal && outcome.progress) issues.push("final anchor-entry transition must not carry progress increment");
    });
    if (!isFinal) progressTotal += Math.min(...beat.outcomes.map((outcome) => outcome.progress?.amount ?? 0));
  });
  const paths = outcomePaths(start, beats);
  if (!paths.length) issues.push(`${beats.length} beats with this many outcomes have too many routes to check`);
  const bridged = (path: Record<string, PrimitiveValue>) => Object.entries(target.state_snapshot ?? {}).filter(([key, targetValue]) => !valuesEqual(path[key], targetValue)).map(([key]) => key);
  const brokenKeys = [...new Set(paths.flatMap(bridged))];
  brokenKeys.forEach((key) => issues.push(`${key} does not bridge to target snapshot`));
  const threshold = thresholdFor(target);
  if (progressTotal < threshold) issues.push(`${progressQualityForAnchor(target.id)} increments ${progressTotal} < threshold ${threshold}`);
  if (beats.length < 2) issues.push("generated chain needs at least two beats so progress can apply before anchor entry");

  // The engine fires the first declared outcome whose gate holds, so an outcome gated
  // exactly like an earlier one of the same beat can never fire. Two of two real route-1 walks met a
  // beat whose outcomes both gated on `approach == unknown`: a fork on paper, one route in play.
  beats.forEach((beat, index) => {
    const seen = new Map<string, string>();
    beat.outcomes.forEach((outcome) => {
      const key = gateKey(outcome.gate);
      const earlier = seen.get(key);
      if (earlier !== undefined) issues.push(`beat ${index + 1} outcome '${outcome.label}' can never fire: its gate is the same as '${earlier}'`);
      else seen.set(key, outcome.label);
    });
  });

  const latched = input.latched ?? {};
  beats.forEach((beat, index) => {
    beat.outcomes.forEach((outcome) => {
      const leaves: GateLeaf[] = [];
      collectAndLeaves(outcome.gate, leaves);
      leaves.forEach((leaf) => {
        if (Object.prototype.hasOwnProperty.call(latched, leaf.q) && !leafSatisfiedBy(leaf, latched[leaf.q])) {
          issues.push(`beat ${index + 1} outcome '${outcome.label}' gate contradicts latched ${leaf.q}=${String(latched[leaf.q])}`);
        }
      });
    });
  });

  issues.push(...gatesHeldOnEntry({ ...latched, ...gatePins(input.candidate.transition.gate) }, beats));

  return { ok: issues.length === 0, issues, progressTotal };
}

export async function runCritic(
  story: NormalizedStoryV2,
  input: PlannedExpansionInput,
  beats: GeneratedBeat[],
  model: ModelCall,
  ask: ModelAsk,
  judgeCritic?: (beats: GeneratedBeat[]) => Promise<CriticVerdict | null>,
): Promise<{ codeCheck: CodeCheckResult; verdict: CriticVerdict; needsReview: boolean }> {
  const codeCheck = runCodeChecks(story, input, beats);
  if (!codeCheck.ok) return { codeCheck, verdict: { pass: false, issues: codeCheck.issues, raw: "CODE_CHECK" }, needsReview: true };
  const judged = judgeCritic ? await judgeCritic(beats).catch(() => null) : null;
  if (judged) return { codeCheck, verdict: judged, needsReview: !judged.pass };
  const raw = await askText(model, renderCriticPrompt(story, input, beats, codeCheck.issues), { ...ask, pass: "critic", maxTokens: 512 });
  const verdict = parseCriticVerdict(raw);
  return { codeCheck, verdict, needsReview: !verdict.pass };
}
