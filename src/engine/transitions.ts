import type { Blackboard } from "./blackboard";
import { evaluateGate } from "./gates";
import type { NormalizedTransition } from "./schema";

export const selectFiring = (outgoing: NormalizedTransition[], blackboard: Blackboard): NormalizedTransition | null => {
  return outgoing.find((transition) => evaluateGate(transition.gate, blackboard)) ?? null;
};
