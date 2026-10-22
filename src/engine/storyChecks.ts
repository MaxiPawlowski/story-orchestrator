import { dieFace } from "./chance";
import { evaluateGate, type GateReader } from "./gates";
import { checkRolledKey, type CheckDegree, type CheckModifier, type CheckRoll, type GateNode, type NormalizedStory, type NormalizedTransition, type PrimitiveValue, type StoryCheck } from "./schema";
import { valueReader } from "./quests";

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

export const checksAt = (story: Pick<NormalizedStory, "checkpointById" | "outgoingByCheckpoint">, checkpointId: string): ActiveCheck[] => [
  ...(story.checkpointById[checkpointId]?.checks ?? []).map((check) => ({ check, transition: null })),
  ...(story.outgoingByCheckpoint[checkpointId] ?? []).flatMap((transition) => (transition.check ? [{ check: transition.check, transition }] : [])),
];

export const hasChecks = (story: Pick<NormalizedStory, "checkpoints" | "transitions"> | null | undefined): boolean =>
  Boolean(story && (story.checkpoints.some((checkpoint) => checkpoint.checks?.length) || story.transitions.some((transition) => transition.check)));

export const checksById = (story: Pick<NormalizedStory, "checkpoints" | "transitions">): Map<string, StoryCheck> => new Map([
  ...story.checkpoints.flatMap((checkpoint) => checkpoint.checks ?? []),
  ...story.transitions.flatMap((transition) => (transition.check ? [transition.check] : [])),
].map((check) => [check.id, check]));

export const checkWrittenKeys = (check: StoryCheck): string[] => [check.quality, ...(check.outcome ? [check.outcome.quality] : []), ...(check.twist ? [check.twist.quality] : [])];

export const checkDice = (check: StoryCheck): number => check.roll.dice ?? 1;

export type RollResult = Omit<CheckResult, "degree">;

export const resolveRoll = (roll: CheckRoll, checkModifiers: readonly CheckModifier[] | undefined, units: readonly number[], values: Readonly<Record<string, PrimitiveValue>>): RollResult => {
  const faces = units.map((unit) => dieFace(roll.sides, unit));
  const modifiers = (checkModifiers ?? []).filter((modifier) => values[modifier.q] === modifier.v)
    .map((modifier) => ({ q: modifier.q, add: modifier.add, ...(modifier.label ? { label: modifier.label } : {}) }));
  const total = faces.reduce((sum, face) => sum + face, 0) + modifiers.reduce((sum, modifier) => sum + modifier.add, 0);
  return { faces, modifiers, total, success: total >= roll.target, twist: faces.length > 1 && faces.every((face) => face === faces[0]) };
};

export const resolveCheck = (check: StoryCheck, units: readonly number[], values: Readonly<Record<string, PrimitiveValue>>): CheckResult => {
  const result = resolveRoll(check.roll, check.modifiers, units, values);
  const margin = check.outcome?.partial_margin;
  const degree: CheckDegree | null = margin === undefined ? null : !result.success ? "miss" : result.total >= check.roll.target + margin ? "strong" : "weak";
  return { ...result, degree };
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

type Values = Readonly<Record<string, PrimitiveValue>>;

const rolledThisVisit = (check: StoryCheck, values: Values, visit: number): boolean => {
  const at = values[checkRolledKey(check.id)];
  return typeof at === "number" && at > visit;
};

export const checkRollsNow = (check: StoryCheck, values: Values, visit: number): boolean =>
  !check.when || (!rolledThisVisit(check, values, visit) && evaluateGate(check.when, valueReader(values)));

export const checkRolledAt = (check: StoryCheck, values: Values, boundary: number): boolean => !check.when || values[checkRolledKey(check.id)] === boundary;

export const checkRolledKeys = (story: Pick<NormalizedStory, "checkpoints">): string[] =>
  story.checkpoints.flatMap((checkpoint) => (checkpoint.checks ?? []).filter((check) => check.when).map((check) => checkRolledKey(check.id)));
