import type { Checkpoint, CheckpointStretch, StretchPace } from "./schema";

export const PLAYER_TURNS_KEY = "player_turns_in_checkpoint";

export const PACE_PULL_AFTER: Record<StretchPace, number> = { brief: 3, unhurried: 6, long: 10 };

export const DEFAULT_STRETCH_PACE: StretchPace = "unhurried";

export const PULL_STEADY_AFTER = 3;

export type PullStage = "gentle" | "steady" | "strong";

export const openStretch = (checkpoint: Pick<Checkpoint, "stretch"> | null | undefined): CheckpointStretch | null =>
  (checkpoint?.stretch?.mode === "open" ? checkpoint.stretch : null);

export const isOpenStretch = (checkpoint: Pick<Checkpoint, "stretch"> | null | undefined): boolean => openStretch(checkpoint) !== null;

export const playerTurnsBetween = (playerTurnIds: readonly number[], startedMessageId: number, lastMessageId: number): number =>
  playerTurnIds.filter((id) => id > startedMessageId && id <= lastMessageId).length;

export const pullStage = (stretch: CheckpointStretch, playerTurns: number): PullStage | null => {
  if (playerTurns < stretch.pull_after) return null;
  if (stretch.max_turns !== undefined && playerTurns >= stretch.max_turns) return "strong";
  return playerTurns - stretch.pull_after >= PULL_STEADY_AFTER ? "steady" : "gentle";
};
