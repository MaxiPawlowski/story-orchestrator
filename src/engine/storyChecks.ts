import { dieFace } from "./chance";
import { evaluateGate, type GateReader } from "./gates";
import type { CheckDegree, GateNode, NormalizedStoryV2, NormalizedTransition, PrimitiveValue, StoryCheck } from "./schema";

export interface ActiveCheck {
  check: StoryCheck;
  transition: NormalizedTransition | null;
}

export interface CheckResult {
  faces: number[];
  modifiers: Array<{ q: string; add: number; label?: string }>;
  total: number;
  success: boolean;
  degree: CheckDegree | null;
  twist: boolean;
}

export const checksAt = (story: Pick<NormalizedStoryV2, "checkpointById" | "outgoingByCheckpoint">, checkpointId: string): ActiveCheck[] => [
  ...(story.checkpointById[checkpointId]?.checks ?? []).map((check) => ({ check, transition: null })),
  ...(story.outgoingByCheckpoint[checkpointId] ?? []).flatMap((transition) => (transition.check ? [{ check: transition.check, transition }] : [])),
];

export const hasChecks = (story: Pick<NormalizedStoryV2, "checkpoints" | "transitions"> | null | undefined): boolean =>
  Boolean(story && (story.checkpoints.some((checkpoint) => checkpoint.checks?.length) || story.transitions.some((transition) => transition.check)));

export const checksById = (story: Pick<NormalizedStoryV2, "checkpoints" | "transitions">): Map<string, StoryCheck> => new Map([
  ...story.checkpoints.flatMap((checkpoint) => checkpoint.checks ?? []),
  ...story.transitions.flatMap((transition) => (transition.check ? [transition.check] : [])),
].map((check) => [check.id, check]));

export const checkWrittenKeys = (check: StoryCheck): string[] => [check.quality, ...(check.outcome ? [check.outcome.quality] : []), ...(check.twist ? [check.twist.quality] : [])];

export const checkDice = (check: StoryCheck): number => check.roll.dice ?? 1;

export const resolveCheck = (check: StoryCheck, units: readonly number[], values: Readonly<Record<string, PrimitiveValue>>): CheckResult => {
  const faces = units.map((unit) => dieFace(check.roll.sides, unit));
  const modifiers = (check.modifiers ?? []).filter((modifier) => values[modifier.q] === modifier.v)
    .map((modifier) => ({ q: modifier.q, add: modifier.add, ...(modifier.label ? { label: modifier.label } : {}) }));
  const total = faces.reduce((sum, face) => sum + face, 0) + modifiers.reduce((sum, modifier) => sum + modifier.add, 0);
  const success = total >= check.roll.target;
  const margin = check.outcome?.partial_margin;
  const degree: CheckDegree | null = margin === undefined ? null : !success ? "miss" : total >= check.roll.target + margin ? "strong" : "weak";
  return { faces, modifiers, total, success, degree, twist: faces.length > 1 && faces.every((face) => face === faces[0]) };
};

export const checkWrites = (check: StoryCheck, result: CheckResult): Array<{ q: string; v: PrimitiveValue }> => [
  { q: check.quality, v: result.success },
  ...(check.outcome && result.degree ? [{ q: check.outcome.quality, v: result.degree }] : []),
  ...(check.twist ? [{ q: check.twist.quality, v: result.twist }] : []),
];

const assuming = (gate: GateNode, reader: GateReader, keys: ReadonlySet<string>): boolean => {
  if ("q" in gate) return keys.has(gate.q) || evaluateGate(gate, reader);
  if ("all" in gate) return gate.all.every((entry) => assuming(entry, reader, keys));
  if ("any" in gate) return gate.any.some((entry) => assuming(entry, reader, keys));
  return !evaluateGate(gate.not, reader);
};

export const checkAttempted = (active: ActiveCheck, reader: GateReader): boolean =>
  !active.transition || assuming(active.transition.gate, reader, new Set(checkWrittenKeys(active.check)));
