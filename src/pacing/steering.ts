import { DEFAULT_AGENCY, NO_CLOSING_QUESTION_CLAUSE, NO_SKIP_CLAUSE, PLAYER_REF, type AgencyPolicy, type PullStage, type TensionLevel } from "@engine/index";
import { DEFAULT_PACING_DRIFT_THRESHOLD } from "@constants/defaults";
import { numericToLevel } from "./tension";

export type SteeringDirection = "escalate" | "hold" | "ease";

export interface SteeringHint {
  direction: SteeringDirection;
  text: string;
}

export interface GenerationBias {
  direction: SteeringDirection;
  magnitude: number;
}

const STRONG_DRIFT_THRESHOLD = 0.5;

// Steering used to phrase every escalation as pressure toward a confrontation the
// scene was expected to deliver, whatever the checkpoint actually wanted — which is how narration
// ended up moving the player along a prepared route. The policy decides whether the world presses on
// its own or the move belongs to the player, and the default (never narrate the player's acts) adds
// one clause to every hint for every story that does not say otherwise.
const playerClause = (policy: AgencyPolicy) =>
  (policy.never_narrate_player_action ? ` Do not narrate ${PLAYER_REF}'s own words or decisions. ${NO_SKIP_CLAUSE} ${NO_CLOSING_QUESTION_CLAUSE}` : "");

export const NOTHING_NEW_CLAUSE = `If nothing new is happening, hand the scene back to ${PLAYER_REF} in one short beat; never fill it with weather, silence or atmosphere.`;

const hintText = (direction: SteeringDirection, strong: boolean, level: TensionLevel, policy: AgencyPolicy): string => {
  const mine = policy.objective_kind === "player_action";
  const clause = playerClause(policy);
  const development = "move the scene with one concrete development: someone acts, something arrives, or something comes out.";
  if (direction === "hold") return `Pacing: keep the tension near ${level} — ${development} ${NOTHING_NEW_CLAUSE}${clause}`;
  if (direction === "escalate") {
    if (strong) {
      return mine
        ? `Pacing: escalate sharply toward ${level} — raise the stakes and put a hard choice in front of ${PLAYER_REF}, then stop there.${clause}`
        : `Pacing: escalate sharply toward ${level} — the world presses hard: force a confrontation, a reveal, or a hard consequence now.${clause}`;
    }
    return mine
      ? `Pacing: raise the tension toward ${level} — sharpen the stakes so ${PLAYER_REF}'s next move matters.${clause}`
      : `Pacing: raise the tension toward ${level} — sharpen the stakes and let the world press the conflict forward.${clause}`;
  }
  return strong
    ? `Pacing: wind down decisively toward ${level} — release the pressure through something that happens: a retreat, a truce, help arriving. ${NOTHING_NEW_CLAUSE}${clause}`
    : mine
      ? `Pacing: ease the tension toward ${level} — lower the stakes through what people do, then give ${PLAYER_REF} room to decide what comes next.${clause}`
      : `Pacing: ease the tension toward ${level} — lower the stakes through what people do or say. ${NOTHING_NEW_CLAUSE}${clause}`;
};

export const getSteeringHint = (
  smoothed: number | null,
  expected: number | null,
  threshold: number = DEFAULT_PACING_DRIFT_THRESHOLD,
  policy: AgencyPolicy = DEFAULT_AGENCY,
): SteeringHint | null => {
  if (smoothed === null || expected === null) return null;
  const drift = expected - smoothed;
  const direction: SteeringDirection = drift > threshold ? "escalate" : drift < -threshold ? "ease" : "hold";
  return { direction, text: hintText(direction, Math.abs(drift) > STRONG_DRIFT_THRESHOLD, numericToLevel(expected), policy) };
};

export const OPEN_STRETCH_LINE = `Open stretch: there is no task here. Follow what ${PLAYER_REF} starts (a detour, a talk, a rest) `
  + `and let the world answer it; ${PLAYER_REF} alone decides when to move on.`;

const PULL_LINES: Record<PullStage, string> = {
  gentle: "Now and then let the next place make itself felt (a mention, a turn in the weather), as a hook, never a push.",
  steady: "Let most replies carry one hook toward the next place.",
  strong: "Let the world press toward the next place plainly in this reply, as a deadline or someone urging.",
};

export const pullLine = (stage: PullStage | null): string =>
  (stage ? `${OPEN_STRETCH_LINE} ${PULL_LINES[stage]} Never move the party there or narrate the decision to go.` : OPEN_STRETCH_LINE);

export const getGenerationBias = (smoothed: number | null, expected: number | null): GenerationBias | null => {
  if (smoothed === null || expected === null) return null;
  const drift = expected - smoothed;
  const direction: SteeringDirection = drift > 0 ? "escalate" : drift < 0 ? "ease" : "hold";
  return { direction, magnitude: Math.abs(drift) };
};

export const getTensionTrajectory = (fromTension: number, toTarget: number, steps: number): number[] => {
  if (steps <= 0) return [];
  if (steps === 1) return [toTarget];
  return Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1);
    return fromTension + ratio * (toTarget - fromTension);
  });
};
