import { DEFAULT_STRETCH_PACE, PACE_PULL_AFTER, type CheckpointStretch, type GateNode, type StretchPace, type Transition } from "@engine/index";

export interface StretchExit {
  index: number;
  to: string;
  toName: string;
  gate: GateNode;
}

export const stretchExits = (
  checkpointId: string,
  transitions: readonly Transition[],
  checkpoints: ReadonlyArray<{ id: string; name: string; player_name?: string }>,
): StretchExit[] => transitions.flatMap((transition, index) => {
  if (transition.from !== checkpointId) return [];
  const target = checkpoints.find((checkpoint) => checkpoint.id === transition.to);
  return [{ index, to: transition.to, toName: target?.player_name ?? target?.name ?? transition.to, gate: transition.gate }];
});

const sameGate = (left: GateNode, right: GateNode): boolean => JSON.stringify(left) === JSON.stringify(right);

export const arrivalExit = (stretch: CheckpointStretch, exits: readonly StretchExit[]): StretchExit | null =>
  exits.find((exit) => sameGate(exit.gate, stretch.arrive_when)) ?? null;

export const offArrivalExits = (stretch: CheckpointStretch, exits: readonly StretchExit[]): StretchExit[] =>
  exits.filter((exit) => !sameGate(exit.gate, stretch.arrive_when));

export const newOpenStretch = (exits: readonly StretchExit[]): CheckpointStretch => ({
  mode: "open",
  pace: DEFAULT_STRETCH_PACE,
  pull_after: PACE_PULL_AFTER[DEFAULT_STRETCH_PACE],
  arrive_when: exits[0]?.gate ?? { all: [] },
});

const withoutLowMax = (stretch: CheckpointStretch): CheckpointStretch => {
  if (stretch.max_turns === undefined || stretch.max_turns > stretch.pull_after) return stretch;
  const { max_turns: _dropped, ...rest } = stretch;
  return rest;
};

export const withPace = (stretch: CheckpointStretch, pace: StretchPace): CheckpointStretch =>
  withoutLowMax({ ...stretch, pace, pull_after: PACE_PULL_AFTER[pace] });

export const withPullAfter = (stretch: CheckpointStretch, pullAfter: number | undefined): CheckpointStretch =>
  withoutLowMax({ ...stretch, pull_after: pullAfter && pullAfter >= 1 ? pullAfter : PACE_PULL_AFTER[stretch.pace] });

export const withMaxTurns = (stretch: CheckpointStretch, maxTurns: number | undefined): CheckpointStretch => {
  const { max_turns: _dropped, ...rest } = stretch;
  return maxTurns && maxTurns > stretch.pull_after ? { ...rest, max_turns: maxTurns } : rest;
};

export const withArrival = (stretch: CheckpointStretch, exit: StretchExit): CheckpointStretch => ({ ...stretch, arrive_when: exit.gate });
