import type { Checkpoint, GateNode, Quality, Transition, ValidationError } from "../schema";
import { PLAYER_TURNS_KEY } from "../stretch";
import { addError } from "./common";

export const MIN_TURNS_MAX = 20;

export const dwellLeaf = (turns: number): GateNode => ({ q: PLAYER_TURNS_KEY, op: ">=", v: turns });

const sameLeaf = (gate: GateNode, turns: number): boolean => "q" in gate && gate.q === PLAYER_TURNS_KEY && gate.op === ">=" && gate.v === turns;

export const holdsDwell = (gate: GateNode, turns: number): boolean => sameLeaf(gate, turns) || ("all" in gate && gate.all.some((entry) => sameLeaf(entry, turns)));

export const readMinTurns = (value: unknown, path: string, errors: ValidationError[]): { min_turns?: number } => {
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MIN_TURNS_MAX) {
    addError(errors, path, `min_turns must be a whole number from 1 to ${MIN_TURNS_MAX}`);
    return {};
  }
  return { min_turns: value };
};

export const TURNS_QUALITY: Quality = { key: PLAYER_TURNS_KEY, type: "int", source: "code", rubric: "Player turns since the current checkpoint began." };

export function compileDwell(checkpoints: readonly Checkpoint[], transitions: Transition[], qualities: Quality[], errors: ValidationError[]): { transitions: Transition[]; qualities: Quality[] } {
  const dwell = new Map<string, number>();
  checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.min_turns === undefined) return;
    if (checkpoint.stretch?.mode === "open" && checkpoint.type !== "anchor") {
      addError(errors, `checkpoints.${index}.min_turns`, "min_turns does not apply to an open stretch; its pace sets how long it lasts");
      return;
    }
    dwell.set(checkpoint.id, checkpoint.min_turns);
  });
  if (!dwell.size) return { transitions, qualities };
  const compiled = transitions.map((transition) => {
    const turns = dwell.get(transition.from);
    if (turns === undefined || transition.urgent === true || holdsDwell(transition.gate, turns)) return transition;
    return { ...transition, gate: { all: [transition.gate, dwellLeaf(turns)] } };
  });
  const declared = qualities.some((quality) => quality.key === PLAYER_TURNS_KEY);
  return { transitions: compiled, qualities: declared ? qualities : [...qualities, TURNS_QUALITY] };
}
